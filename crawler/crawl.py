"""ListenBook 内容爬虫 —— 从公开播客订阅源抓取英语学习内容并入库。

数据流：
    订阅源(RSS) ──▶ 最新若干集 ──▶ 字幕(官方字幕 优先 / 本地 Whisper 转写)
                                          ──▶ 中文翻译
                                          ──▶ 写入 ListenBook 后端(仅存文本+直链)

设计要点：
  * 音频与封面只存官方 CDN 直链，前端直接拉流 —— 零存储零带宽成本。
  * 字幕按前端约定格式写入（`M:SS 句子`，一行一句），播放时自动逐句高亮。
  * 已入库的集用 audio_url 去重，可反复运行。

用法：
    python crawl.py                     # 按 config.json 正常跑
    python crawl.py --dry-run           # 只抓取不写库，用来检查
    python crawl.py --source all-ears-english --limit 1
    python crawl.py --no-asr            # 只用官方字幕，不跑语音识别
    python crawl.py --list              # 列出已配置的源
"""
import argparse
import datetime as dt
import email.utils
import hashlib
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from lib import asr, backend, common, feed, subs, translate  # noqa: E402

CONFIG_PATH = os.path.join(HERE, "config.json")
SOURCES_PATH = os.path.join(HERE, "sources.json")
LOG_DIR = os.path.join(HERE, "logs")
CACHE_DIR = os.path.join(HERE, "cache")
AUDIO_CACHE = os.path.join(CACHE_DIR, "audio")

STATE_PATH = os.path.join(CACHE_DIR, "state.json")


def log(msg):
    ts = dt.datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# --------------------------------------------------------------------- state


def load_state():
    return common.load_json(STATE_PATH, {}) or {"done": {}, "asr_used": 0}


def save_state(st):
    common.save_json(STATE_PATH, st)


# ------------------------------------------------------------------- helpers


def pub_date(raw):
    """RFC2822 / ISO -> 'YYYY-MM-DD' (or '')."""
    if not raw:
        return ""
    try:
        return email.utils.parsedate_to_datetime(raw).date().isoformat()
    except Exception:  # noqa: BLE001
        pass
    try:
        return dt.datetime.fromisoformat(raw.replace("Z", "+00:00")).date().isoformat()
    except Exception:  # noqa: BLE001
        return ""


def audio_cache_path(url):
    return os.path.join(AUDIO_CACHE, hashlib.sha1(url.encode()).hexdigest()[:16] + ".mp3")


def prune_audio_cache(max_age_days=3, log=print):
    """删掉过期的音频缓存。

    音频只是转写的中间产物：字幕一旦入库，这个 mp3 就没价值了（真要重下也就
    10 秒左右，实测约 1.5MB/s）。不清理的话，按每天 16 集 × 约 20MB 算，
    缓存会以每月近 10GB 的速度膨胀 —— 用户对磁盘很敏感，必须自己回收。
    """
    if not os.path.isdir(AUDIO_CACHE):
        return 0
    cutoff = time.time() - max_age_days * 86400
    removed = freed = 0
    for name in os.listdir(AUDIO_CACHE):
        path = os.path.join(AUDIO_CACHE, name)
        try:
            if os.path.isfile(path) and os.path.getmtime(path) < cutoff:
                freed += os.path.getsize(path)
                os.remove(path)
                removed += 1
        except OSError:
            pass
    if removed:
        log(f"清理音频缓存 {removed} 个（释放 {freed / 1048576:.0f} MB）")
    return removed


def category_map(be):
    """slug -> id, from the live API so we never invent a category."""
    st, body = be._req("GET", "/api/categories/", auth=False)
    out = {}
    if st == 200:
        rows = body.get("results", body) if isinstance(body, dict) else body
        for c in rows or []:
            out[c.get("slug")] = c.get("id")
    return out


# ------------------------------------------------------------------- podcast


def ensure_podcast(be, src, chan, cats, dry_run):
    """Create the podcast row if needed; keep cover/title/desc fresh."""
    slug = src["slug"]
    payload = {
        "title": (chan.get("title") or src["name"])[:280],
        "slug": slug,
        "author": (chan.get("author") or "")[:190],
        "description": chan.get("description") or "",
        "difficulty": src.get("difficulty", "intermediate"),
        "language": "en",
        "content_type": "audio",
        "website_url": chan.get("website") or "",
        "feed_url": src["feed"],
        "is_active": True,
    }
    cover = chan.get("cover") or src.get("cover") or ""
    if cover:
        payload["cover_url"] = cover[:590]
    cid = cats.get(src.get("category") or "")
    if cid:
        payload["category"] = cid

    existing = be.find_podcast(slug=slug)
    if existing:
        # refresh only what tends to change; keep admin edits to difficulty etc.
        patch = {}
        if cover and not (existing.get("cover_url") or "").strip():
            patch["cover_url"] = cover[:590]
        if not existing.get("category") and cid:
            patch["category"] = cid
        if patch:
            if not dry_run:
                be.update_podcast(existing["id"], patch)
            log(f"   更新播客信息 {list(patch)}")
        return existing

    if dry_run:
        log(f"   [dry-run] 新建播客 {payload['title']}")
        return {"id": -1, "slug": slug, "title": payload["title"]}
    created = be.create_podcast(payload)
    log(f"   新建播客 #{created.get('id')} {created.get('title')}")
    return created


# ------------------------------------------------------------------ subtitle


def official_segments(ep, log):
    url = ep.get("transcript_url") or ""
    if not url:
        return []
    try:
        raw = common.http_get(url, timeout=40)
    except Exception as e:  # noqa: BLE001
        log(f"   官方字幕下载失败：{e}")
        return []
    segs = subs.parse_any(raw.decode("utf-8", "replace"), url)
    if segs:
        log(f"   官方字幕命中：{len(segs)} 条")
    return segs


def asr_segments(ep, cfg, log):
    url = ep.get("audio_url") or ""
    if not url:
        return []
    dest = audio_cache_path(url)
    try:
        if not os.path.exists(dest):
            log(f"   下载音频用于转写 …")
            n = common.download(url, dest, timeout=900)
            log(f"   音频 {n / 1048576:.1f} MB")
        mb = os.path.getsize(dest) / 1048576
        if mb > cfg.get("max_audio_mb", 45):
            log(f"   音频 {mb:.0f}MB 超过上限，跳过转写")
            os.remove(dest)
            return []
        if not asr.is_usable_audio(dest):
            log("   音频文件不合法（可能是错误页），跳过")
            os.remove(dest)
            return []
        return asr.transcribe(dest, log=log)
    except Exception as e:  # noqa: BLE001
        log(f"   转写失败：{e}")
        return []


def build_subtitles(ep, cfg, args, state, log):
    """-> (en_text, zh_text, source_label)"""
    segs = []
    label = ""

    if cfg.get("official_transcript", True) and not args.no_official:
        segs = official_segments(ep, log)
        if segs:
            label = "official"

    if not segs and cfg.get("asr", True) and not args.no_asr:
        if state.get("asr_used", 0) >= args.max_asr:
            log(f"   本轮转写额度用完（{args.max_asr} 集），跳过")
        else:
            segs = asr_segments(ep, cfg, log)
            if segs:
                state["asr_used"] = state.get("asr_used", 0) + 1
                label = "asr"

    if not segs:
        return "", "", "none"

    lines = subs.merge_into_sentences(segs)
    if not lines:
        return "", "", "none"

    en_text = subs.format_subtitle(lines)
    zh_text = ""
    if cfg.get("translate", True) and not args.no_translate:
        zh = translate.translate_batch([t for _, t in lines], log=log)
        zh = [(lines[i][0], (zh[i] or "").replace("\n", " ").strip())
              for i in range(len(lines))]
        zh_text = subs.format_subtitle(zh)
    return en_text, zh_text, label


# ------------------------------------------------------------------ backfill


def backfill(be, cfg, args, state, sources):
    """给「已在库里但没字幕」的剧集补字幕。

    为什么需要独立一条路径：首轮抓取时若官方没字幕、ASR 又没跑成（额度用完 /
    音频超限 / 当时转写链路坏掉），那集就会以空字幕入库。之后它既被
    ``state["done"]`` 记成已完成、又被后端的 existing_audio_urls 挡住，正常
    抓取流程再也不会碰它 —— 字幕就永远缺着。所以补录必须显式跑。

    ``--limit`` 在这里的含义是「每个播客最多补几集」。
    """
    report = {"mode": "backfill", "pods": 0, "missing": 0, "filled": 0,
              "no_source": 0, "failed": 0}
    if not args.dry_run:
        be.login()

    for src in sources:
        pod = be.find_podcast(slug=src["slug"])
        if not pod:
            log(f"\n=== {src['name']} ===\n   库里还没有这个播客，跳过")
            continue
        log(f"\n=== {pod.get('title') or src['name']} ===")
        eps_db = be.list_episodes(pod["id"])
        missing = [e for e in eps_db if not (e.get("subtitle_en") or "").strip()]
        report["pods"] += 1
        report["missing"] += len(missing)
        log(f"   库中 {len(eps_db)} 集，其中缺字幕 {len(missing)} 集")
        if not missing:
            continue

        try:
            raw = common.http_get(src["feed"], timeout=45)
            _, feed_eps = feed.parse(raw)
        except Exception as e:  # noqa: BLE001
            log(f"   订阅源抓取失败：{e}")
            report["failed"] += len(missing)
            continue
        by_audio = {e["audio_url"]: e for e in feed_eps if e.get("audio_url")}

        done = 0
        for db_ep in missing:
            if done >= args.limit:
                log(f"   本播客补字幕额度用完（{args.limit} 集），余下下次再补")
                break
            au = (db_ep.get("audio_url") or "").strip()
            src_ep = by_audio.get(au)
            if not src_ep:
                log(f"   - #{db_ep['id']} 已滚出当前订阅源，无法补（缺原音频元数据）")
                report["no_source"] += 1
                continue
            log(f"   + #{db_ep['id']} {(db_ep.get('title') or '')[:60]}")
            try:
                en_text, zh_text, label = build_subtitles(src_ep, cfg, args, state, log)
                if label == "none" or not en_text:
                    log("     仍然没拿到字幕，保持原样")
                    continue
                if args.dry_run:
                    log(f"     [dry-run] 可补 字幕={label} 英{len(en_text)}字 中{len(zh_text)}字")
                    done += 1
                    continue
                be.update_episode(db_ep["id"], {
                    "subtitle_en": en_text, "subtitle_zh": zh_text})
                log(f"     已补 字幕={label} 英{len(en_text)}字 中{len(zh_text)}字")
                done += 1
                report["filled"] += 1
            except Exception as e:  # noqa: BLE001
                log(f"     补字幕失败：{e}")
                report["failed"] += 1
    return report


# ---------------------------------------------------------------------- main


def main():
    ap = argparse.ArgumentParser(description="ListenBook 内容爬虫")
    ap.add_argument("--dry-run", action="store_true", help="抓取但不写入后端")
    ap.add_argument("--limit", type=int, help="覆盖 每源抓取集数")
    ap.add_argument("--max-asr", type=int, help="覆盖 本轮转写额度")
    ap.add_argument("--source", help="只处理指定 slug（可逗号分隔）")
    ap.add_argument("--no-asr", action="store_true", help="禁用语音转写")
    ap.add_argument("--no-official", action="store_true", help="忽略官方字幕")
    ap.add_argument("--no-translate", action="store_true", help="不做中文翻译")
    ap.add_argument("--backfill", action="store_true",
                    help="补字幕模式：给库里已存在但没字幕的剧集补上（配合 --source/--limit）")
    ap.add_argument("--list", action="store_true", help="列出已配置的源后退出")
    args = ap.parse_args()

    cfg = common.load_json(CONFIG_PATH, {}) or {}
    sources = (common.load_json(SOURCES_PATH, {}) or {}).get("podcasts", [])
    if args.list:
        for s in sources:
            print(f"{s['slug']:<40} {s.get('category',''):<12} {s['name']}")
        return 0

    if not sources:
        log("sources.json 里没有源，先跑 discover.py")
        return 1

    if args.source:
        want = {x.strip() for x in args.source.split(",") if x.strip()}
        sources = [s for s in sources if s["slug"] in want]
        if not sources:
            log(f"没有匹配的源：{args.source}")
            return 1

    if args.backfill and args.limit is None:
        args.limit = cfg.get("backfill_limit", 10)

    limit = args.limit or cfg.get("per_source_limit", 2)
    args.max_asr = args.max_asr if args.max_asr is not None else cfg.get("max_asr_per_run", 3)
    os.environ.setdefault("ASR_MODEL", cfg.get("asr_model", "small"))
    os.makedirs(LOG_DIR, exist_ok=True)
    os.makedirs(AUDIO_CACHE, exist_ok=True)

    state = load_state()
    # asr_used 是「本轮」额度，必须每轮清零。把它写进 state.json 只是为了在同一
    # 轮内跨源累计；若不重置，第二轮起 state 里已是 max_asr，于是永久不再转写
    # —— 而且不报错、只是静默降级成「无字幕入库」，极难发现。
    state["asr_used"] = 0
    be = backend.Backend(cfg["backend_url"], cfg["username"], cfg["password"], log=log)

    if args.backfill:
        log(f"后端 {cfg['backend_url']}，补字幕模式，每个播客最多 {args.limit} 集"
            + ("（dry-run）" if args.dry_run else ""))
        t0 = time.time()
        rep = backfill(be, cfg, args, state, sources)
        rep["elapsed_sec"] = round(time.time() - t0, 1)
        rep["finished"] = dt.datetime.now().isoformat(timespec="seconds")
        if not args.dry_run:
            save_state(state)
            common.save_json(os.path.join(LOG_DIR, "last_backfill.json"), rep)
            prune_audio_cache(cfg.get("audio_cache_days", 3), log)
        log(f"\n===== 补字幕完成：检查 {rep['pods']} 个播客，缺 {rep['missing']} 集，"
            f"补齐 {rep['filled']}，源内找不到 {rep['no_source']}，失败 {rep['failed']}，"
            f"耗时 {rep['elapsed_sec']}s =====")
        return 0 if rep["failed"] == 0 else 2

    cats = category_map(be)
    log(f"后端 {cfg['backend_url']}，分类 {len(cats)} 个，共 {len(sources)} 个源，每源抓 {limit} 集")

    report = {"started": dt.datetime.now().isoformat(timespec="seconds"),
              "per_source": [], "created": 0, "skipped": 0, "failed": 0,
              "subtitled": 0}
    t0 = time.time()

    for src in sources:
        entry = {"slug": src["slug"], "name": src["name"], "new": 0,
                 "skipped": 0, "failed": 0}
        report["per_source"].append(entry)
        log(f"\n=== {src['name']} ===")
        try:
            raw = common.http_get(src["feed"], timeout=45)
            chan, eps = feed.parse(raw)
        except Exception as e:  # noqa: BLE001
            log(f"   订阅源抓取失败：{e}")
            entry["error"] = str(e)[:200]
            report["failed"] += 1
            continue

        log(f"   订阅源 {len(eps)} 集，取最新 {limit} 集")
        newest = feed.latest_first(eps, limit=limit * 3)

        # 后端调用也要各自兜住：曾因一次代理 502 让整轮从这里中断，
        # 后面的源一个都没跑。单个源出问题只能拖累自己。
        try:
            pod = ensure_podcast(be, src, chan, cats, args.dry_run)
        except Exception as e:  # noqa: BLE001
            log(f"   建/查播客失败，跳过该源：{e}")
            entry["error"] = str(e)[:200]
            report["failed"] += 1
            continue

        existing = set()
        if not args.dry_run and pod.get("id", -1) > 0:
            try:
                existing = be.existing_audio_urls(pod["id"])
                log(f"   库中已有 {len(existing)} 集")
            except Exception as e:  # noqa: BLE001
                log(f"   读取已有剧集失败（去重退化为只看本地 state）：{e}")

        made = 0
        for ep in newest:
            if made >= limit:
                break
            au = (ep.get("audio_url") or "").strip()
            if not au:
                continue
            if au in existing or au in state["done"]:
                entry["skipped"] += 1
                report["skipped"] += 1
                continue
            log(f"   + {ep['title'][:70]}")
            try:
                en_text, zh_text, label = build_subtitles(ep, cfg, args, state, log)
            except Exception as e:  # noqa: BLE001
                log(f"     生成字幕出错（改为无字幕入库，稍后可用 --backfill 补）：{e}")
                en_text, zh_text, label = "", "", "none"
            if label == "none":
                log("     无字幕（官方缺失且未转写），仍入库")
            elif zh_text:
                report["subtitled"] += 1

            payload = {
                "podcast": pod.get("id", -1) if pod.get("id", -1) > 0 else None,
                "title": ep["title"][:490],
                "description": (ep.get("description") or "")[:4000],
                "audio_url": au,
                "audio_duration": common.parse_duration(ep.get("duration"), 0),
                "episode_number": _int(ep.get("episode_no")),
                "season_number": _int(ep.get("season_no"), 1),
                "publish_date": pub_date(ep.get("pub_date")) or None,
                "is_active": True,
                "subtitle_en": en_text,
                "subtitle_zh": zh_text,
            }
            if args.dry_run:
                log(f"     [dry-run] 字幕 {label}，英文 {len(en_text)} 字，中文 {len(zh_text)} 字")
                made += 1
                continue
            try:
                created = be.create_episode(payload)
                log(f"     入库 #{created.get('id')} 字幕={label} "
                    f"英{len(en_text)}字 中{len(zh_text)}字")
                existing.add(au)
                state["done"][au] = dt.date.today().isoformat()
                made += 1
                entry["new"] += 1
                report["created"] += 1
            except Exception as e:  # noqa: BLE001
                log(f"     入库失败：{e}")
                entry["failed"] += 1
                report["failed"] += 1

        if not args.dry_run and made and pod.get("id", -1) > 0:
            try:
                be.refresh_podcast_count(pod["id"], len(existing))
            except Exception:  # noqa: BLE001
                pass

    # prune state so it cannot grow forever
    cutoff = (dt.date.today() - dt.timedelta(days=120)).isoformat()
    state["done"] = {k: v for k, v in state["done"].items() if v >= cutoff}
    if not args.dry_run:
        save_state(state)
        prune_audio_cache(cfg.get("audio_cache_days", 3), log)

    report["elapsed_sec"] = round(time.time() - t0, 1)
    report["finished"] = dt.datetime.now().isoformat(timespec="seconds")
    common.save_json(os.path.join(LOG_DIR, "last_run.json"), report)

    log(f"\n===== 完成：新增 {report['created']}，跳过 {report['skipped']}，"
        f"失败 {report['failed']}，带字幕 {report['subtitled']}，"
        f"耗时 {report['elapsed_sec']}s =====")
    return 0 if report["failed"] == 0 else 2


def _int(v, default=0):
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return default


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        # 兜底：万一还有没预料到的路径抛异常，至少留下可查的现场，
        # 而不是让定时任务只留一个看不懂的 exit code。
        import traceback
        tb = traceback.format_exc()
        print(tb, file=sys.stderr)
        try:
            os.makedirs(LOG_DIR, exist_ok=True)
            with open(os.path.join(LOG_DIR, "CRASH.txt"), "w", encoding="utf-8") as f:
                f.write(f"{dt.datetime.now().isoformat(timespec='seconds')}\n{e}\n\n{tb}")
        except Exception:  # noqa: BLE001
            pass
        sys.exit(3)

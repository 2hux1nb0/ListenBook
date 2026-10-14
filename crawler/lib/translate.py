"""Sentence-level EN -> ZH translation for bilingual subtitles.

Why not the project's own /api/ai/explain endpoint: backend/ai/explainer.py is a
rule-based generator whose Chinese output is literally the English sentence
prefixed with boilerplate -- it does not translate. So we translate here.

Two free providers, tried in order, with an on-disk cache:
  1. Youdao public demo endpoint (no key, decent quality for short sentences)
  2. MyMemory translation memory (no key, hard daily word cap)
"""
import hashlib
import json
import os
import re
import time
import urllib.parse

from . import common

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cache")
CACHE_FILE = os.path.join(CACHE_DIR, "translations.json")

_cache = None
_last_call = [0.0]
MIN_INTERVAL = 0.6  # be polite; these are free endpoints


def _load_cache():
    global _cache
    if _cache is None:
        _cache = common.load_json(CACHE_FILE, {}) or {}
    return _cache


def _save_cache():
    if _cache is not None:
        common.save_json(CACHE_FILE, _cache)


def _key(text):
    return hashlib.sha1(("v1|" + text).encode("utf-8")).hexdigest()[:20]


def _throttle():
    dt = time.time() - _last_call[0]
    if dt < MIN_INTERVAL:
        time.sleep(MIN_INTERVAL - dt)
    _last_call[0] = time.time()


def _youdao(texts):
    """Youdao demo accepts newline-joined input and returns a list."""
    q = "\n".join(texts)
    st, body = common.http_post(
        "https://aidemo.youdao.com/trans",
        {"q": q, "from": "en", "to": "zh-CHS"},
        headers={"Content-Type": "application/x-www-form-urlencoded",
                 "Referer": "https://ai.youdao.com/"},
        timeout=25,
    )
    if st != 200:
        return None
    try:
        data = json.loads(body.decode("utf-8", "replace"))
    except ValueError:
        return None
    tr = data.get("translation")
    if isinstance(tr, list):
        tr = [str(x).strip() for x in tr]
        if len(tr) == len(texts):
            return tr
        return None
    if isinstance(tr, str) and len(texts) == 1 and tr.strip():
        return [tr.strip()]
    return None


def _mymemory(text):
    url = ("https://api.mymemory.translated.net/get?q="
           + urllib.parse.quote(text[:480]) + "&langpair=en|zh-CN")
    try:
        raw = common.http_get(url, timeout=20, retries=2)
        data = json.loads(raw.decode("utf-8", "replace"))
        out = (data.get("responseData") or {}).get("translatedText") or ""
        out = out.strip()
        if out and "MYMEMORY WARNING" not in out.upper():
            return out
    except Exception:  # noqa: BLE001
        pass
    return ""


def _postfix(zh):
    """Fix machine-translation mistakes that are systematically wrong in the
    podcast domain (e.g. MT renders "host" as 房东/主人 instead of 主持人)."""
    if not zh:
        return zh
    for bad, good in POST_FIXES:
        zh = zh.replace(bad, good)
    return zh


# Ordered (wrong, right) pairs. Deliberately narrow: only terms that are
# reliably wrong when the source is an English-learning podcast transcript.
POST_FIXES = [
    ("房东", "主持人"),
    ("您的房东", "您的主持人"),
    ("我是房东", "我是主持人"),
    ("东道主", "主持人"),
    ("本集的主人", "本期主持人"),
    ("演讲者", "主讲人"),
]


def translate_batch(texts, log=print):
    """Translate a list of sentences. Returns a same-length list (never None).

    Results are cached on disk, so re-running an episode costs nothing.
    """
    cache = _load_cache()
    out = [None] * len(texts)
    todo = []
    for i, t in enumerate(texts):
        t = (t or "").strip()
        if not t:
            out[i] = ""
            continue
        hit = cache.get(_key(t))
        if hit:
            out[i] = hit
        else:
            todo.append((i, t))

    if todo:
        log(f"   翻译 {len(todo)} 句（缓存命中 {len(texts) - len(todo)}）")

    # 1) Preferred: local offline Marian model (no rate limits, no network).
    #    See lib/localmt.py for why the online routes could not be used.
    if todo:
        from . import localmt
        if localmt.available():
            try:
                zh = localmt.translate([t for _, t in todo], log=log)
                if zh and len(zh) == len(todo):
                    for (i, t), z in zip(todo, zh):
                        z = _postfix((z or "").strip())
                        out[i] = z
                        if z:
                            cache[_key(t)] = z
                    _save_cache()
                    todo = []
            except Exception as e:  # noqa: BLE001
                log(f"   本地翻译失败，回退在线接口：{e}")

    # 2) Fallback: online endpoints for whatever the local model could not do.
    # Batch through Youdao in chunks so one request covers many sentences.
    CHUNK = 20
    for s in range(0, len(todo), CHUNK):
        chunk = todo[s:s + CHUNK]
        _throttle()
        got = None
        try:
            got = _youdao([t for _, t in chunk])
        except Exception as e:  # noqa: BLE001
            log(f"   有道接口异常：{e}")
        if got:
            for (i, t), zh in zip(chunk, got):
                zh = _postfix(zh)
                out[i] = zh
                cache[_key(t)] = zh
            _save_cache()
            continue
        # fall back to per-sentence MyMemory
        for i, t in chunk:
            _throttle()
            zh = _postfix(_mymemory(t))
            if zh:
                out[i] = zh
                cache[_key(t)] = zh
                _save_cache()
            else:
                out[i] = ""
    for i in range(len(out)):
        if out[i] is None:
            out[i] = ""
    return out

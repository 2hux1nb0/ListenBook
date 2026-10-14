"""Subtitle plumbing: parse SRT / VTT / JSON transcripts, then re-emit the
exact line format ListenBook's frontend expects.

Frontend contract (js/app.js -> parseTranscript / stripStamp):
    each line = "<M:SS> <sentence>"      (or "<H:MM:SS> <sentence>")
    regex    = /^(\\d{1,2}:)?\\d{1,2}:\\d{2}\\s+/
    one line == one sentence == one highlight unit
English and Chinese lines are matched by index, so both sides must have the
same number of lines.
"""
import html
import json
import re

# ----------------------------------------------------------------- capture


def parse_srt(text):
    """SRT -> [(start_seconds, text), ...]"""
    out = []
    blocks = re.split(r"\n\s*\n", text.replace("\r\n", "\n").replace("\r", "\n"))
    for block in blocks:
        lines = [ln for ln in block.strip().split("\n") if ln.strip()]
        if len(lines) < 2:
            continue
        m = re.search(r"(\d{1,2}:\d{2}:\d{2})[,.](\d{1,3})\s*-->\s*"
                      r"(\d{1,2}:\d{2}:\d{2})[,.](\d{1,3})", block)
        if not m:
            continue
        start = _hms_to_sec(m.group(1)) + int(m.group(2)) / 1000.0
        body = []
        for ln in lines:
            if "-->" in ln or re.fullmatch(r"\d+", ln.strip()):
                continue
            body.append(ln.strip())
        txt = _clean(" ".join(body))
        if txt:
            out.append((start, txt))
    return out


def parse_vtt(text):
    """WebVTT -> [(start_seconds, text), ...]"""
    out = []
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"^WEBVTT.*?\n", "", text, count=1, flags=re.S)
    for block in re.split(r"\n\s*\n", text):
        if "-->" not in block:
            continue
        m = re.search(r"(\d{1,2}:\d{2}:\d{2})[.,](\d{1,3})\s*-->", block)
        if not m:
            continue
        start = _hms_to_sec(m.group(1)) + int(m.group(2)) / 1000.0
        body = []
        for ln in block.strip().split("\n"):
            if "-->" in ln or ln.strip().upper().startswith(("NOTE", "STYLE", "WEBVTT")):
                continue
            body.append(ln.strip())
        txt = _clean(" ".join(body))
        if txt:
            out.append((start, txt))
    return out


def parse_json_transcript(text):
    """Podcasting 2.0 JSON transcript -> [(start_seconds, text), ...]"""
    try:
        data = json.loads(text)
    except ValueError:
        return []
    segs = data.get("segments") or data.get("cues") or []
    out = []
    for s in segs:
        if not isinstance(s, dict):
            continue
        start = s.get("startTime", s.get("start", s.get("time", 0)))
        body = s.get("body", s.get("text", s.get("caption", "")))
        try:
            start = float(start)
        except (TypeError, ValueError):
            start = 0.0
        body = _clean(str(body))
        if body:
            out.append((start, body))
    return out


def parse_any(text, url=""):
    """Best-effort detect the transcript format and parse it."""
    low = (url or "").lower()
    head = text.lstrip()[:200].upper()
    if low.endswith(".json") or head.startswith("{") or head.startswith("["):
        got = parse_json_transcript(text)
        if got:
            return got
    if low.endswith(".vtt") or head.startswith("WEBVTT"):
        return parse_vtt(text)
    if low.endswith(".srt") or re.search(r"\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->", text):
        return parse_srt(text)
    # Last resort: try each
    for fn in (parse_vtt, parse_srt):
        got = fn(text)
        if got:
            return got
    return []


# ----------------------------------------------------------------- emitting


def merge_into_sentences(segments, max_chars=200, max_gap=2.0):
    """ASR/auto-caption segments are fragments ("and then we", "go to the").
    Glue them into sentence-sized lines, which is what the UI highlights and
    what makes a usable bilingual transcript."""
    if not segments:
        return []
    segments = sorted(segments, key=lambda x: x[0])
    lines = []
    cur_text, cur_start, cur_end = "", None, None
    for start, end, frag in _as_triples(segments):
        frag = _clean(frag)
        if not frag:
            continue
        gap = (start - cur_end) if cur_end is not None else 0
        joined = (cur_text + " " + frag).strip() if cur_text else frag
        too_long = len(joined) > max_chars
        boundary = bool(re.search(r'[.!?…]["\')\]]?\s*$', cur_text))
        if cur_text and (too_long or gap > max_gap or boundary):
            lines.append((cur_start, cur_text))
            cur_text, cur_start, cur_end = frag, start, end
        else:
            if cur_start is None:
                cur_start = start
            cur_text = joined
            cur_end = end
    if cur_text:
        lines.append((cur_start, cur_text))
    return lines


def format_subtitle(lines, keep_chinese_index=True):
    """[(start_sec, text)] -> "M:SS sentence\\n..." for subtitle_en/subtitle_zh."""
    return "\n".join(f"{stamp(start)} {txt}" for start, txt in lines if txt)


def stamp(seconds):
    seconds = max(0, int(round(seconds)))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


# ----------------------------------------------------------------- helpers


def _as_triples(segments):
    """Accept (start, text) or (start, end, text) and normalise."""
    for seg in segments:
        if len(seg) == 3:
            yield float(seg[0]), float(seg[1]), str(seg[2])
        else:
            yield float(seg[0]), float(seg[0]), str(seg[1])


def _hms_to_sec(hms):
    parts = [int(p) for p in hms.split(":")]
    total = 0
    for p in parts:
        total = total * 60 + p
    return total


def _clean(s):
    s = html.unescape(s or "")
    s = re.sub(r"<[^>]+>", "", s)          # stray vtt/srt tags
    s = re.sub(r"\{\\[^}]*\}", "", s)      # {\an8} style ASS tags
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def align_bilingual(en_lines, zh_lines):
    """Force both sides to the same length so the frontend index-matching
    never silently drops a line."""
    n = max(len(en_lines), len(zh_lines))
    en = list(en_lines) + [(None, "")] * (n - len(en_lines))
    zh = list(zh_lines) + [(None, "")] * (n - len(zh_lines))
    out_en, out_zh = [], []
    for (st, et), (_, zt) in zip(en, zh):
        out_en.append((st, et))
        out_zh.append((st, zt))
    return out_en, out_zh

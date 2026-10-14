"""RSS 2.0 / Atom feed parsing for podcast feeds.

Deliberately regex+ElementTree rather than feedparser: podcast feeds in the
wild are full of namespace weirdness, and we only need a handful of fields.
"""
import re
import xml.etree.ElementTree as ET

from . import common

NS = {
    "itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd",
    "content": "http://purl.org/rss/1.0/modules/content/",
    "podcast": "https://podcastindex.org/namespace/1.0",
    "media": "http://search.yahoo.com/mrss/",
    "atom": "http://www.w3.org/2005/Atom",
}


def _txt(node, *paths):
    for p in paths:
        el = node.find(p, NS)
        if el is not None and (el.text or "").strip():
            return el.text.strip()
        if el is not None and el.attrib.get("href"):
            return el.attrib["href"].strip()
    return ""


def _attr(node, path, attr):
    el = node.find(path, NS)
    return (el.attrib.get(attr) or "").strip() if el is not None else ""


def channel_info(root):
    """Podcast-level metadata."""
    ch = root.find("channel")
    if ch is None:
        ch = root  # Atom
    return {
        "title": _txt(ch, "title", "atom:title"),
        "author": _txt(ch, "itunes:author", "atom:author/atom:name", "author"),
        "description": common.strip_html(
            _txt(ch, "description", "atom:subtitle", "itunes:summary"))[:2000],
        "cover": (_attr(ch, "itunes:image", "href")
                  or _txt(ch, "image/url", "atom:logo", "atom:icon")),
        "website": _txt(ch, "link", "atom:link"),
        "language": _txt(ch, "language", "atom:language"),
        "categories": [c.attrib.get("text", "").strip()
                       for c in ch.findall("itunes:category", NS)
                       if c.attrib.get("text")],
    }


def episodes(root):
    """Newest-first list of episode dicts."""
    items = root.findall(".//item")
    if not items:
        items = root.findall(".//atom:entry", NS)
    out = []
    for it in items:
        audio = _attr(it, "enclosure", "url")
        if not audio:
            # Atom <link rel="enclosure">
            for ln in it.findall("atom:link", NS):
                if ln.attrib.get("rel") == "enclosure":
                    audio = (ln.attrib.get("href") or "").strip()
                    break
        if not audio:
            audio = _attr(it, "media:content", "url")

        desc = _txt(it, "content:encoded") or _txt(it, "description",
                                                   "itunes:summary", "atom:summary")
        out.append({
            "title": _txt(it, "title", "atom:title") or "Untitled",
            "audio_url": audio,
            "guid": _txt(it, "guid", "atom:id"),
            "pub_date": _txt(it, "pubDate", "atom:updated", "atom:published"),
            "duration": _txt(it, "itunes:duration"),
            "description": common.strip_html(desc)[:4000],
            "episode_no": _txt(it, "itunes:episode"),
            "season_no": _txt(it, "itunes:season"),
            "image": _attr(it, "itunes:image", "href"),
            "transcript_url": _transcript_url(it),
        })
    return out


def _transcript_url(item):
    """Podcasting 2.0 <podcast:transcript url=".." type="..">, preferring
    a machine-readable format."""
    cands = item.findall("podcast:transcript", NS)
    if not cands:
        return ""
    best = ""
    for t in cands:
        url = (t.attrib.get("url") or "").strip()
        if not url:
            continue
        typ = (t.attrib.get("type") or "").lower()
        if typ in ("application/srt", "application/x-subrip", "text/vtt",
                   "application/json"):
            return url
        best = best or url
    return best


def parse(raw_bytes):
    """Parse feed bytes -> (channel_info, [episodes])."""
    text = raw_bytes.decode("utf-8", "replace")
    # Some feeds declare a different encoding; fall back to a lenient decode.
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        text = raw_bytes.decode("latin-1", "replace")
        text = re.sub(r"&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)", "&amp;", text)
        root = ET.fromstring(text)
    return channel_info(root), episodes(root)


def latest_first(eps, limit=5):
    """Sort by pubDate (or episode number) and keep `limit`."""
    import datetime as _dt
    import email.utils

    def key(e):
        d = e.get("pub_date") or ""
        try:
            return email.utils.parsedate_to_datetime(d)
        except Exception:  # noqa: BLE001
            pass
        try:
            return _dt.datetime.fromisoformat(d.replace("Z", "+00:00"))
        except Exception:  # noqa: BLE001
            pass
        try:
            return _dt.datetime.fromtimestamp(int(e.get("episode_no") or 0))
        except Exception:  # noqa: BLE001
            return _dt.datetime(1970, 1, 1)

    return sorted(eps, key=key, reverse=True)[:limit]

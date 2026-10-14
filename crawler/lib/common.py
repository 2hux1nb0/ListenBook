"""Shared helpers: HTTP with retries, small utilities.

Kept dependency-free (stdlib only) so the crawler never breaks because of a
missing/broken third-party package.
"""
import gzip
import io
import json
import os
import random
import re
import time
import urllib.error
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36")

DEFAULT_HEADERS = {
    "User-Agent": UA,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
}


def http_get(url, timeout=30, headers=None, retries=3, backoff=2.0):
    """GET returning bytes. Retries on transient failures.

    Raises RuntimeError if every attempt fails (so callers can log and skip one
    episode without killing the whole run).
    """
    h = dict(DEFAULT_HEADERS)
    if headers:
        h.update(headers)
    last = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
                # Transparently gunzip: many feeds are served with this header
                # and urllib does not decode it for us.
                if r.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
                return raw
        except Exception as e:  # noqa: BLE001
            last = e
            if attempt < retries:
                time.sleep(backoff * attempt + random.random())
    raise RuntimeError(f"GET failed after {retries} tries: {url} ({last})")


def http_post(url, data, headers=None, timeout=30, retries=2):
    """POST form-encoded or raw body. Returns (status, body_bytes)."""
    h = dict(DEFAULT_HEADERS)
    if headers:
        h.update(headers)
    body = data if isinstance(data, bytes) else urllib.parse.urlencode(data).encode()
    last = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, data=body, headers=h, method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        except Exception as e:  # noqa: BLE001
            last = e
            if attempt < retries:
                time.sleep(1.5 * attempt)
    raise RuntimeError(f"POST failed: {url} ({last})")


def download(url, dest, timeout=180, chunk=65536, retries=3):
    """Stream a (possibly large) file to disk -- atomically, with retries.

    Writes to ``<dest>.part`` and only ``os.replace``-es it into place once the
    whole body has arrived. This matters because the callers use
    ``os.path.exists(dest)`` as the "already downloaded" test: a dropped
    connection used to leave a truncated file at ``dest``, which the next run
    happily fed to Whisper -- producing subtitles that silently covered only
    the first few seconds of the episode.

    Retries resume from the bytes already on disk when the server honours
    ``Range`` (libsyn/CloudFront do); if it ignores it we start over. A short
    read against ``Content-Length`` is treated as a failure rather than a win.

    Returns bytes written, raises if every attempt fails. On failure ``dest``
    is guaranteed not to exist (a reusable ``<dest>.part`` may be left behind).
    """
    part = dest + ".part"
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    last = None
    for attempt in range(1, retries + 1):
        have = os.path.getsize(part) if os.path.exists(part) else 0
        headers = dict(DEFAULT_HEADERS)
        if have:
            headers["Range"] = f"bytes={have}-"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                resume = have > 0 and r.status == 206
                if not resume:
                    have = 0
                clen = r.headers.get("Content-Length")
                total = have + int(clen) if clen is not None else None
                written = have
                with open(part, "ab" if resume else "wb") as f:
                    while True:
                        buf = r.read(chunk)
                        if not buf:
                            break
                        f.write(buf)
                        written += len(buf)
            if total is not None and written < total:
                raise IOError(f"incomplete download: {written}/{total} bytes")
            os.replace(part, dest)
            return written
        except Exception as e:  # noqa: BLE001
            last = e
            if attempt < retries:
                time.sleep(1.5 * attempt)
    if os.path.exists(part):
        try:
            os.remove(part)
        except OSError:
            pass
    raise RuntimeError(f"download failed after {retries} attempts: {url} ({last})")


def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, obj):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def slugify(text, maxlen=60):
    s = (text or "").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return (s[:maxlen].strip("-")) or "podcast"


def strip_html(s):
    s = re.sub(r"<br\s*/?>", "\n", s or "", flags=re.I)
    s = re.sub(r"</p>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = (s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", '"')
          .replace("&#39;", "'").replace("&apos;", "'").replace("&lt;", "<")
          .replace("&gt;", ">").replace("&mdash;", "—").replace("&ndash;", "–"))
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def parse_duration(text, fallback=0):
    """'00:12:34' / '1234' / '12:34' -> seconds."""
    if not text:
        return fallback
    t = str(text).strip()
    if re.fullmatch(r"\d+(\.\d+)?", t):
        return int(float(t))
    parts = [p for p in t.split(":") if p != ""]
    try:
        nums = [float(p) for p in parts]
    except ValueError:
        return fallback
    total = 0.0
    for n in nums:
        total = total * 60 + n
    return int(total)

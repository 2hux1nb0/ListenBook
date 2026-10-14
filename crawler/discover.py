"""Source verification: check which English-learning podcasts are actually
reachable from this machine (a lot of international hosts are blocked here).

Targeted rather than exhaustive -- for each candidate name we ask the iTunes
Search API for the matching feed, then probe it (in parallel, short timeouts).

Run:  python discover.py
Out:  candidates.json
"""
import concurrent.futures as futures
import json
import os
import re
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36")
TIMEOUT = 9

# Podcasts aimed at the same niche ListenLeap covers (learner-friendly English).
CANDIDATES = [
    "Easy English Learn English with everyday conversations",
    "Daily Easy English Expression",
    "American English Podcast",
    "All Ears English",
    "Luke's English Podcast",
    "Real English Conversations",
    "Espresso English",
    "Speak English with Vanessa",
    "Coffee Break English",
    "Culips ESL Podcast",
    "Better at English",
    "English Learning for Curious Minds",
    "The English We Speak",
    "Learning Easy English",
    "Think Fast Talk Smart",
    "Round Table China",
    "EnglishPod",
    "Listening Time English Practice",
    "Learn English with Coffee Break",
    "The Level Up English Podcast",
]


def fetch(url, timeout=TIMEOUT, range_bytes=None):
    h = {"User-Agent": UA, "Accept": "*/*"}
    if range_bytes:
        h["Range"] = f"bytes=0-{range_bytes}"
    req = urllib.request.Request(url, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), dict(r.headers)
    except Exception as e:  # noqa: BLE001
        return 0, str(e).encode()[:200], {}


def itunes(name):
    q = urllib.parse.quote(name)
    st, body, _ = fetch(
        f"https://itunes.apple.com/search?term={q}&entity=podcast&limit=3", timeout=15)
    if st != 200:
        return None
    try:
        res = json.loads(body.decode("utf-8", "replace")).get("results", [])
    except ValueError:
        return None
    for r in res:
        if r.get("feedUrl"):
            return r
    return None


def probe(item):
    """Probe feed + newest audio; fill in reachability + metadata."""
    st, body, _ = fetch(item["feed"], timeout=TIMEOUT)
    item["feedStatus"] = st
    if st != 200 or not body:
        item["ok"] = False
        return item
    text = body.decode("utf-8", "replace")
    item["items"] = len(re.findall(r"<item[\s>]", text))
    m = re.search(r'<enclosure[^>]*url="([^"]+)"', text)
    item["hasTranscript"] = "<podcast:transcript" in text
    if not m:
        item["ok"] = False
        return item
    audio = m.group(1)
    item["firstAudio"] = audio
    # Range request: cheap way to confirm audio really streams (and supports seek)
    ast, abody, ahdr = fetch(audio, timeout=TIMEOUT, range_bytes=16383)
    item["audioStatus"] = ast
    item["audioType"] = ahdr.get("Content-Type", "")
    item["audioBytes"] = len(abody)
    item["ok"] = ast in (200, 206) and "audio" in item["audioType"].lower()
    return item


def main():
    names = sys.argv[1:] or CANDIDATES
    print(f"查询 {len(names)} 个候选播客的订阅源...\n")
    found = []
    with futures.ThreadPoolExecutor(max_workers=8) as ex:
        for r in ex.map(itunes, names):
            if r:
                found.append({
                    "name": (r.get("collectionName") or "").strip(),
                    "artist": (r.get("artistName") or "").strip(),
                    "feed": r["feedUrl"],
                    "genre": r.get("primaryGenreName") or "",
                    "count": r.get("trackCount") or 0,
                    "artwork": r.get("artworkUrl600") or r.get("artworkUrl100") or "",
                    "itunesId": r.get("collectionId"),
                })
    print(f"拿到 {len(found)} 个订阅源，并发探测可达性...\n")

    results = []
    with futures.ThreadPoolExecutor(max_workers=10) as ex:
        for item in ex.map(probe, found):
            results.append(item)
            flag = "OK  " if item.get("ok") else "FAIL"
            print(f"{flag} {item['name'][:44]:<46} feed={item.get('feedStatus')} "
                  f"audio={item.get('audioStatus')} 集数={item.get('items', '-')} "
                  f"字幕={'有' if item.get('hasTranscript') else '无'}")

    results.sort(key=lambda x: (not x.get("ok"), x["name"].lower()))
    with open(os.path.join(HERE, "candidates.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    good = [r for r in results if r.get("ok")]
    print(f"\n可用 {len(good)} / {len(results)} → candidates.json")
    for g in good:
        print(f"  · {g['name']}  ({g['count']}集)")


if __name__ == "__main__":
    sys.exit(main())

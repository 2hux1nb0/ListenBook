# -*- coding: utf-8 -*-
"""临时校验脚本：检查线上爬虫 8 源（podcast id 13-20）的字幕完整性"""
import json, re, urllib.request

BASE = "https://piterju.pythonanywhere.com"
TS = re.compile(r"^\d+:\d{2}[ \t]")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "ListenBook-verify/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


pods = get(BASE + "/api/podcasts/")
if isinstance(pods, dict):
    pods = pods.get("results", [])
pods = pods if isinstance(pods, list) else pods["results"]
pmap = {}
for p in pods:
    pid = p.get("id")
    if isinstance(pid, int) and 13 <= pid <= 20:
        pmap[pid] = p.get("title") or p.get("name")

eps = []
url = BASE + "/api/episodes/?page_size=100"
while url:
    data = get(url)
    if isinstance(data, dict) and "results" in data:
        eps.extend(data["results"])
        url = data.get("next")
    else:
        eps.extend(data)
        url = None

crawl_eps = [e for e in eps if e.get("podcast") in pmap]
print("线上总集数:", len(eps))
print("爬虫 8 源集数:", len(crawl_eps))
print("源映射:", pmap)
print()

no_en, bad_ts, misalign = [], [], []
for e in crawl_eps:
    title = (e.get("title") or "")[:60]
    en = e.get("subtitle_en") or ""
    zh = e.get("subtitle_zh") or ""
    if not en.strip():
        no_en.append((e.get("id"), title))
        continue
    en_lines = [l for l in en.splitlines() if l.strip()]
    zh_lines = [l for l in zh.splitlines() if l.strip()]
    bad = [l for l in en_lines if not TS.match(l)]
    if bad:
        bad_ts.append((e.get("id"), title, bad[:2]))
    if len(en_lines) != len(zh_lines):
        misalign.append((e.get("id"), title, len(en_lines), len(zh_lines)))

print("缺英字幕:", len(no_en), no_en)
print("无时间戳行:", len(bad_ts), bad_ts)
print("中英行数不齐:", len(misalign), misalign)

# 新增集抽查：末行时间戳
new_ids = {83, 84, 85, 86}
for e in crawl_eps:
    if e.get("id") in new_ids:
        en = (e.get("subtitle_en") or "").splitlines()
        last = en[-1][:20] if en else "(空)"
        print(f"新增 #{e['id']} 行数={len(en)} 末行={last} | {e.get('title','')[:50]}")

# -*- coding: utf-8 -*-
"""Build data/dict.json -- the word-level glossary for the ListenBook reader.

Primary source: ECDICT (https://github.com/skywind3000/ECDICT), an open
EN->ZH dictionary. Columns we use:

    word        headword
    translation Chinese gloss
    tag         space separated exam tags: zk gk cet4 cet6 ky toefl ielts gre
    frq         COCA frequency rank (0 = outside the top ~60k)
    exchange    word forms, "0:lemma/p:past/d:pp/i:ing/3:3rd/s:plural/r:cmp/t:sup"

The mahavivo exam lists were only used as a cross-check; ECDICT supersedes them.

Output shape (kept deliberately compact -- this file is fetched by the browser):

    {
      "v": 1,
      "levels":  ["cet4","cet6","ielts","toefl","kaoyan"],
      "common":  {"cet4": 3000, ...},      // frq <= this counts as "known"
      "rank":    {"cet4": 1, "cet6": 2, ...},   // difficulty ordering
      "words":   {"abandon": ["放弃；抛弃", 20, 2200]},   // [zh, tagMask, frq]
      "forms":   {"abandoned": "abandon"}                // inflected -> headword
    }
"""
import csv, json, os, re, sys

csv.field_size_limit(10 ** 9)

# `tools/` lives one level under the project root; scratch downloads live in _wip/.
# Every path can be overridden with an env var so a rebuild works from anywhere.
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCRATCH = os.environ.get("LB_SCRATCH") or os.path.join(ROOT, "_wip")
ECDICT_CSV = os.environ.get("ECDICT_CSV") or os.path.join(SCRATCH, "ecdict.csv")
OUT_JSON = os.environ.get("OUT_JSON") or os.path.join(ROOT, "data", "dict.json")
CORPUS = os.path.join(SCRATCH, "corpus_wordfreq.json")

# ECDICT tag -> (bit, difficulty rank).  Every tag gets a bit so that the
# "already within my level" baseline can be computed as a mask union.
TAGS = {
    "zk":    (64, 1),   # 中考
    "gk":    (128, 2),  # 高考
    "cet4":  (1, 3),
    "cet6":  (2, 4),
    "ky":    (4, 5),    # 考研
    "ielts": (8, 6),
    "toefl": (16, 7),
    "gre":   (32, 8),
}
LEVELS = ["cet4", "cet6", "ielts", "toefl", "kaoyan"]
LEVEL_TAG = {"cet4": "cet4", "cet6": "cet6", "ielts": "ielts", "toefl": "toefl", "kaoyan": "ky"}
# An *untagged* word (no exam list claims it) is only worth annotating once it is
# genuinely rare -- untagged usually just means ECDICT has no exam metadata for it,
# so the frequency gate has to be conservative or the page fills with noise.
RARE_BY_LEVEL = {"cet4": 9000, "cet6": 11000, "ielts": 12000, "kaoyan": 12000, "toefl": 14000}
# COCA rank below which a word is a function word everyone knows ("the", "can",
# "is"). ECDICT's exam tags are noisy on these -- "can" is tagged `zk gk toefl`
# because "to can" = 装罐 -- so the frequency floor wins over the tag.
TRIVIAL_FRQ = 400
# difficulty rank of each selectable level (mirrors TAGS above)
LEVEL_RANK = {"cet4": 3, "cet6": 4, "kaoyan": 5, "ielts": 6, "toefl": 7}

MAX_ZH = 48
MAX_FRQ_KEEP = 60000
WORD_RE = re.compile(r"^[a-z][a-z'\-]{0,38}$")
POS_SPLIT = re.compile(r"\s+(?=[a-z]{1,5}\.\s)")
DOMAIN = re.compile(r"\[[^\]]{0,10}\]")


def tidy(s, limit=MAX_ZH):
    s = (s or "").replace("\\n", " ").replace("\n", " ").replace("\r", " ")
    s = re.sub(r"\s+", " ", s).strip(" ;,，。")
    return s[:limit]


def clean_gloss(s):
    """ECDICT gives long multi-sense strings; the subtitle gloss needs ~3 senses.

        'vt. 放弃, 抛弃, 遗弃, 使屈从, 沉溺, 放纵 n. 放任, 无拘束, 狂热'
            -> 'vt. 放弃；抛弃；遗弃'
    """
    s = tidy(s.replace("\\n", " "), 400)
    # a domain marker like [医] usually repeats the sense that follows it, so turn
    # it into a separator rather than deleting it -- "微波 [计] 微波" -> 微波,微波
    s = DOMAIN.sub("，", s)
    s = re.sub(r"\s+", " ", s).strip(" ;,，。")
    s = POS_SPLIT.split(s)[0]
    m = re.match(r"^((?:[a-z]{1,5}\.\s*)+)(.*)$", s)
    pos, body = (m.group(1).strip(), m.group(2)) if m else ("", s)
    items = [x.strip(" .") for x in re.split(r"[,，;；/]", body) if x.strip(" .")]
    # drop a trailing "n." style fragment that survived the split
    items = [x for x in items if not re.fullmatch(r"[a-z]{1,5}\.", x)]
    # ECDICT repeats senses across its domain blocks ("微波 [计] 微波")
    seen, uniq = set(), []
    for it in items:
        k = it.replace(" ", "")
        if k and k not in seen:
            seen.add(k)
            uniq.append(it)
    body = "；".join(uniq[:3])
    out = (pos + " " + body).strip() if pos else body
    return out[:MAX_ZH]


def main():
    src = ECDICT_CSV
    if not os.path.exists(src):
        sys.exit(
            "missing %s\n"
            "Download ECDICT first (see tools/README.md); it is ~64MB, so it is "
            "kept out of the repo." % src
        )

    words, forms = {}, {}
    n = kept = 0
    with open(src, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            n += 1
            w = (row.get("word") or "").strip().lower()
            if not WORD_RE.match(w):
                continue
            zh = clean_gloss(row.get("translation"))
            tagstr = (row.get("tag") or "").strip().lower()
            mask, ranks = 0, []
            for t in tagstr.split():
                if t in TAGS:
                    bit, rk = TAGS[t]
                    mask |= bit
                    ranks.append(rk)
            try:
                frq = int(row.get("frq") or 0)
            except ValueError:
                frq = 0
            if frq < 0:
                frq = 0

            keep = bool(mask) or (0 < frq <= MAX_FRQ_KEEP)
            if keep and zh:
                words[w] = [zh, mask, frq]
                kept += 1

            ex = row.get("exchange") or ""
            if ex:
                base = w
                for part in ex.split("/"):
                    if part.startswith("0:"):
                        base = part[2:].strip().lower() or w
                        break
                for part in ex.split("/"):
                    if ":" not in part:
                        continue
                    kind, val = part.split(":", 1)
                    if kind in ("1", "p", "d", "i", "3", "s", "r", "t"):
                        for form in val.split(","):
                            form = form.strip().lower()
                            if WORD_RE.match(form):
                                forms.setdefault(form, base)

    forms_all = dict(forms)   # every inflected form -> headword, before filtering

    # An inflected form can be a headword in its own right (ECDICT has entries for
    # "abandoned", "conversations", ...) and those entries carry no exam tag.
    # Push the base word's tags/frequency down onto them so the reader does not
    # treat a plain past tense as an unknown word.
    merged = 0
    for form, base in forms_all.items():
        if form in words and base in words:
            before = words[form][1]
            words[form][1] |= words[base][1]
            if not words[form][2]:
                words[form][2] = words[base][2]
            if words[form][1] != before:
                merged += 1

    # every inflected form the reader may need, including the ones that also have
    # a headword of their own: the frontend prefers the base gloss whenever the
    # standalone entry is markedly rarer (ECDICT files "started" as a noun).
    forms = {k: v for k, v in forms_all.items() if v in words}
    print(f"  词形合并      {merged:,} 个变体继承了原形标签")

    corpus = set()
    if os.path.exists(CORPUS):
        corpus = set(json.load(open(CORPUS, encoding="utf-8")).keys())

    def resolvable(w):
        return w in words or w in forms

    miss = [w for w in corpus if not resolvable(w)]
    print(f"  扫描 ECDICT   {n:,} 行, 保留 {kept:,} 词")
    print(f"  词形 forms    {len(forms):,}")
    print(f"  语料唯一词    {len(corpus):,}, 未收录 {len(miss):,} "
          f"({100*len(miss)/max(len(corpus),1):.1f}%)")
    print(f"    未收录样例  {miss[:14]}")

    # precompute, per selectable level: its own tag bit, and the mask of every
    # tag the listener is assumed to already know (rank <= own rank).
    level_bit, baseline = {}, {}
    for lvl in LEVELS:
        bit, rk = TAGS[LEVEL_TAG[lvl]]
        level_bit[lvl] = bit
        m = 0
        for t, (b, r) in TAGS.items():
            if r <= rk:
                m |= b
        baseline[lvl] = m

    payload = {
        "v": 1,
        "levels": LEVELS,
        "levelBit": level_bit,
        "baseline": baseline,
        "trivial": TRIVIAL_FRQ,
        "rare": RARE_BY_LEVEL,
        "words": words,
        "forms": forms,
    }
    out = OUT_JSON
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(out)
    print()
    print(f"  输出 {out}  {size/1024/1024:.2f} MB (gzip 约 {size/1024/1024*0.30:.2f} MB)")
    print(f"  带考纲标签 {sum(1 for v in words.values() if v[1]):,}")
    print()
    for p in ["abandon", "ubiquitous", "delineate", "the", "microwave", "atmosphere",
              "reconnaissance", "bridging", "conversation"]:
        print(f"    {p:16} {words.get(p)}")
    print(f"    forms: abandoned->{forms.get('abandoned')}  conversations->{forms.get('conversations')}  bridging->{forms.get('bridging')}")


if __name__ == "__main__":
    main()

/* ==========================================================================
   WordDict -- word-level Chinese glosses driven by the learner's exam level.
   --------------------------------------------------------------------------
   Data: data/dict.json (built offline from ECDICT by crawler/_wip/build_dict.py)

     words[word] = [gloss, tagMask, cocaRank]
     forms[form] = headword          (inflected forms with no entry of their own)

   tagMask bits: 1 cet4 | 2 cet6 | 4 考研 | 8 ielts | 16 toefl
                32 gre  | 64 中考 | 128 高考

   Marking rule (asked for by the user: both kinds, styled differently):
     'syll'   the word is on the syllabus of the level you picked   -> 考纲词
     'beyond' the word is harder than your level                    -> 超纲生词
     null     you are assumed to know it already (or it is a name)  -> 不标
   ========================================================================== */
const WordDict = (function () {
  let DATA = null;
  let loadPromise = null;
  const memo = new Map();

  function load() {
    if (DATA) return Promise.resolve(DATA);
    if (loadPromise) return loadPromise;
    loadPromise = fetch('data/dict.json')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('dict ' + r.status))))
      .then(d => {
        DATA = d;
        memo.clear();
        return d;
      })
      .catch(err => {
        loadPromise = null;   // allow retry on the next call
        console.warn('[WordDict] 词库加载失败:', err);
        throw err;
      });
    return loadPromise;
  }

  function ready() { return !!DATA; }

  /* ---- inflection fallback for words absent from `forms` ----------------- */
  function stems(w) {
    const out = [];
    const push = x => { if (x && x.length > 1 && x !== w) out.push(x); };
    if (w.endsWith("'s")) push(w.slice(0, -2));
    if (w.endsWith('ies')) push(w.slice(0, -3) + 'y');
    if (w.endsWith('es')) push(w.slice(0, -2));
    if (w.endsWith('s')) push(w.slice(0, -1));
    if (w.endsWith('ied')) push(w.slice(0, -3) + 'y');
    if (w.endsWith('ed')) { push(w.slice(0, -2)); push(w.slice(0, -1)); }
    if (w.endsWith('ing')) {
      push(w.slice(0, -3));
      push(w.slice(0, -3) + 'e');
      push(w.slice(0, -4));
      push(w.slice(0, -4) + 'e');
    }
    if (w.endsWith('ly')) push(w.slice(0, -2));
    if (w.endsWith('est')) { push(w.slice(0, -3)); push(w.slice(0, -2)); }
    if (w.endsWith('er')) { push(w.slice(0, -2)); push(w.slice(0, -1)); }
    // doubled final consonant: runn -> run, stopp -> stop
    for (const s of out.slice()) {
      if (s.length > 2 && s[s.length - 1] === s[s.length - 2]) push(s.slice(0, -1));
    }
    return out;
  }

  const INFLECT = /(?:ed|ing|s)$/;

  function entry(word) {
    if (!DATA || !word) return null;
    const w = String(word).toLowerCase().replace(/\u2019/g, "'").replace(/^-+|-+$/g, '');
    if (!w) return null;
    if (memo.has(w)) return memo.get(w);

    let e = DATA.words[w] || null;
    // ECDICT gives many inflections a headword of their own, often filed under the
    // wrong part of speech ("started" = 惊起；出发, "abandoned" = a. 被抛弃的).
    // Prefer the base when the standalone entry is markedly rarer -- but NOT for
    // words whose own entry is genuinely the common reading ("left" 左边的,
    // "better" 较好的, "means" 方法: their base would be wrong).
    const base = DATA.forms[w];
    const be = base ? DATA.words[base] : null;
    if (be) {
      if (!e || e[2] === 0) {
        e = be;
      } else if (be[2] > 0) {
        const ratio = e[2] / be[2];
        if ((ratio > 2.5 && INFLECT.test(w)) || ratio > 50) e = be;
      }
    }
    if (!e) {
      for (const s of stems(w)) {
        e = DATA.words[s] || (DATA.forms[s] && DATA.words[DATA.forms[s]]) || null;
        if (e) break;
      }
    }
    memo.set(w, e);
    return e;
  }

  /* ---- the marking decision -------------------------------------------- */
  function classify(word, level) {
    const e = entry(word);
    if (!e) return null;
    const mask = e[1], frq = e[2];
    if (frq > 0 && frq <= DATA.trivial) return null;          // the / can / is
    if (mask & DATA.levelBit[level]) return 'syll';
    if (mask & DATA.baseline[level]) return null;             // my level or easier
    if (mask === 0) {
      return (frq === 0 || frq > DATA.rare[level]) ? 'beyond' : null;
    }
    return 'beyond';                                          // tagged, but harder
  }

  /* ---- gloss helpers ---------------------------------------------------- */
  function fullGloss(word) {
    const e = entry(word);
    return e ? e[0] : '';
  }

  // "vt. 放弃；抛弃；遗弃" -> "放弃"   (what fits inline in the subtitle)
  function shortGloss(word, maxLen) {
    const g = fullGloss(word);
    if (!g) return '';
    let s = g.replace(/^((?:[a-z]{1,5}\.\s*)+)/i, '');
    s = s.split(/[；;,，]/)[0].trim();
    s = s.replace(/^[\s.、]+/, '').replace(/\.\.\./g, '');
    const lim = maxLen || 8;
    if (s.length > lim) s = s.slice(0, lim);
    return s;
  }

  // which exam lists claim this word (for the popover)
  const TAG_NAMES = [
    [1, '四级'], [2, '六级'], [4, '考研'], [8, '雅思'],
    [16, '托福'], [32, 'GRE'], [64, '中考'], [128, '高考'],
  ];
  function tagsOf(word) {
    const e = entry(word);
    if (!e) return [];
    return TAG_NAMES.filter(t => e[1] & t[0]).map(t => t[1]);
  }

  return { load, ready, entry, classify, fullGloss, shortGloss, tagsOf };
})();

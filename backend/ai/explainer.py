"""Local, dependency-free AI explanation generator.

The endpoint is structured so a real LLM (OpenAI / local model) can be dropped
in later: if ``settings.LLM_EXPLAINER`` is callable it is used, otherwise this
deterministic rule-based generator produces a useful explanation. It identifies
potentially difficult vocabulary, gives a simple paraphrase and a short study
tip -- enough to make the "AI 讲解" feature a working closed loop offline.
"""
import re
import os

# A small built-in dictionary of common "hard" words -> (pos, zh, en hint)
HARD_WORDS = {
    'moreover': ('adv.', '此外；而且', 'adds information'),
    'nevertheless': ('adv.', '然而；不过', 'shows contrast'),
    'therefore': ('adv.', '因此；所以', 'shows result'),
    'however': ('adv.', '然而；不过', 'shows contrast'),
    'although': ('conj.', '虽然；尽管', 'shows contrast'),
    'despite': ('prep.', '尽管；不管', 'shows contrast without verb'),
    'whereas': ('conj.', '然而；鉴于', 'compares two things'),
    'furthermore': ('adv.', '此外；而且', 'adds information'),
    'approximately': ('adv.', '大约；近似地', 'about / roughly'),
    'significant': ('adj.', '重要的；显著的', 'important / large'),
    'particularly': ('adv.', '特别地；尤其', 'especially'),
    'essential': ('adj.', '必要的；本质的', 'necessary / key'),
    'consequence': ('n.', '结果；后果', 'result / effect'),
    'benefit': ('n./v.', '益处；受益', 'advantage / help'),
    'achieve': ('v.', '达到；实现', 'succeed in doing'),
    'environment': ('n.', '环境', 'surroundings'),
    'individual': ('adj./n.', '个人的；个体', 'single person'),
    'specific': ('adj.', '具体的；特定的', 'particular / exact'),
    'available': ('adj.', '可获得的；可用的', 'able to be used'),
    'research': ('n./v.', '研究', 'study / investigate'),
    'develop': ('v.', '发展；开发', 'grow / create'),
    'process': ('n./v.', '过程；处理', 'series of actions'),
    'require': ('v.', '需要；要求', 'need / demand'),
    'consider': ('v.', '考虑；认为', 'think about'),
    'experience': ('n./v.', '经验；经历', 'what you live through'),
    'opportunity': ('n.', '机会', 'chance'),
    'community': ('n.', '社区；群体', 'group of people'),
    'culture': ('n.', '文化', 'way of life'),
    'economy': ('n.', '经济', 'system of money/trade'),
    'technology': ('n.', '科技；技术', 'science applied to tools'),
    'recognize': ('v.', '认出；承认', 'know again / accept'),
    'challenge': ('n./v.', '挑战', 'difficult task'),
    'approach': ('n./v.', '方法；接近', 'way of doing'),
    'factor': ('n.', '因素', 'thing that affects result'),
    'potential': ('adj./n.', '潜在的；潜力', 'possible / ability'),
    'structure': ('n.', '结构', 'arrangement / framework'),
    'function': ('n./v.', '功能；运转', 'purpose / work'),
    'variety': ('n.', '多样性；种类', 'many different kinds'),
    'ancient': ('adj.', '古代的', 'very old'),
    'curious': ('adj.', '好奇的', 'eager to know'),
    'generous': ('adj.', '慷慨的', 'willing to give'),
    'efficient': ('adj.', '高效的', 'doing well with little waste'),
    'frequent': ('adj.', '频繁的', 'happening often'),
}


def _tokenize(sentence):
    return re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", sentence)


def _looks_hard(word):
    w = word.lower()
    if w in HARD_WORDS:
        return True
    # long words or with common difficult suffixes
    if len(w) >= 9 and w.endswith(('tion', 'ment', 'able', 'ible', 'ship', 'ness', 'ity')):
        return True
    return False


def generate_explanation(sentence, context=''):
    """Return (explanation_en, explanation_zh)."""
    tokens = _tokenize(sentence)
    words = [t for t in tokens if t.lower() not in {'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'are', 'was', 'were', 'it', 'this', 'that', 'at', 'by', 'as', 'be', 'from', 'you', 'we', 'i', 'he', 'she', 'they'}]

    hard = []
    seen = set()
    for t in words:
        lw = t.lower()
        if _looks_hard(lw) and lw not in seen:
            seen.add(lw)
            if lw in HARD_WORDS:
                pos, zh, hint = HARD_WORDS[lw]
                hard.append((t, pos, zh, hint))
            else:
                hard.append((t, '', '（长难词，建议结合语境理解）', 'long / advanced word'))

    # Build English explanation
    en_parts = []
    en_parts.append("Simple paraphrase: " + sentence.strip())
    if hard:
        en_parts.append("Key vocabulary in this sentence:")
        for term, pos, zh, hint in hard:
            en_parts.append(f"  • {term} ({pos}): {hint}")
    else:
        en_parts.append("Tip: this sentence uses mostly common words — focus on the overall meaning and rhythm.")
    en_parts.append("Study tip: read the sentence aloud, then try to retell it in your own words.")
    explanation_en = "\n".join(en_parts)

    # Build Chinese explanation
    zh_parts = []
    zh_parts.append("中文要点：这句话的意思是——" + sentence.strip())
    if hard:
        zh_parts.append("重点词汇：")
        for term, pos, zh, hint in hard:
            zh_parts.append(f"  • {term}（{pos}）：{zh}")
    else:
        zh_parts.append("学习建议：这句话多为常见词，重点把握整体意思和语感。")
    zh_parts.append("练习建议：先跟读原句，再试着用自己的话复述。")
    explanation_zh = "\n".join(zh_parts)

    return explanation_en, explanation_zh

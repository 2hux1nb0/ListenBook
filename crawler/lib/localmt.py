"""Offline EN -> ZH translation using a CTranslate2 Marian model.

Why this exists
---------------
Every *online* free translation route proved unusable from this network:
  * translate.googleapis.com  -> blocked
  * Youdao demo endpoint      -> rate limits hard (measured 6/30 success at
                               1 request at a time, 0/30 with concurrency)
  * MyMemory                  -> ~1000 words/day anonymous cap
  * argostranslate package    -> drags in spacy + stanza + torch (~2.5 GB)

So we run a small Marian model (opus-mt-en-zh, ~77M params) locally on CPU via
ctranslate2, which the ASR path already needs. No rate limit, no network, free.

Model files are fetched from the HuggingFace mirror (hf-mirror.com, since
huggingface.co is blocked here) into MT_DIR. Layout is the standard
CTranslate2 + SentencePiece one:
    model.bin  config.json  shared_vocabulary.json  source.spm  target.spm

IMPORTANT — the target-language prefix
--------------------------------------
This checkpoint is a *multilingual* Marian model, not a plain bilingual one.
Without the `>>cmn_Hans<<` target token it degenerates badly:

    no prefix      -> 我已學英文三年三年,          (repetition + Traditional)
    >>cmn_Hans<<   -> 我学英语三年了                (correct, Simplified)

so TARGET_PREFIX is prepended to every source token list. Keep it in sync if
you swap the model.
"""
import os

_DIR = os.environ.get("LISTENBOOK_MT_DIR", "D:/models/opus-mt-en-zh-ct2-fp16")
# Punctuation-stripped target language token for Marian multilingual models.
TARGET_PREFIX = os.environ.get("LISTENBOOK_MT_PREFIX", ">>cmn_Hans<<")
_REQUIRED = ("model.bin", "source.spm", "target.spm", "shared_vocabulary.json")

_state = {"translator": None, "src": None, "tgt": None, "loaded": False}


def available():
    """True if the model files are on disk."""
    return all(os.path.exists(os.path.join(_DIR, f)) for f in _REQUIRED)


def _load(log=print):
    if _state["loaded"]:
        return True
    if not available():
        return False
    import ctranslate2
    import sentencepiece as spm

    threads = max(4, (os.cpu_count() or 8) - 2)
    log(f"   加载本地翻译模型（{threads} 线程）…")
    _state["translator"] = ctranslate2.Translator(
        _DIR, device="cpu", compute_type="float32",
        inter_threads=1, intra_threads=threads,
    )
    _state["src"] = spm.SentencePieceProcessor(model_file=os.path.join(_DIR, "source.spm"))
    _state["tgt"] = spm.SentencePieceProcessor(model_file=os.path.join(_DIR, "target.spm"))
    _state["loaded"] = True
    return True


def translate(texts, log=print, batch_size=32):
    """Translate a list of English sentences -> list of Chinese strings.

    Returns [] if the model is unavailable, so callers can fall back.
    """
    if not texts:
        return []
    if not _load(log=log):
        return []

    tr = _state["translator"]
    sp_src = _state["src"]
    sp_tgt = _state["tgt"]

    out = []
    for i in range(0, len(texts), batch_size):
        chunk = list(texts[i:i + batch_size])
        batch = [[TARGET_PREFIX] + sp_src.encode(t, out_type=str) for t in chunk]
        results = tr.translate_batch(
            batch,
            beam_size=2,
            max_batch_size=batch_size,
            # Guard against the repetition loops this family of models is prone
            # to when decoding with a narrow beam.
            repetition_penalty=1.15,
            no_repeat_ngram_size=3,
        )
        for r in results:
            toks = [t for t in r.hypotheses[0]
                    if t not in ("</s>", "<s>", "<pad>")]
            out.append(sp_tgt.decode(toks).strip())
    return out

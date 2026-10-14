"""Local speech-to-text with faster-whisper (CPU, int8).

Only used for episodes whose feed ships no official transcript -- that is the
"hybrid" strategy: official transcript first, ASR as the fallback.

Model choice is driven by size/speed: `small` in int8 on a modern CPU runs at
roughly 10x realtime, which keeps a daily batch of short learner episodes
inside a couple of minutes. Override with env ASR_MODEL.

Where the model comes from
--------------------------
huggingface.co is blocked on this machine, so we point HF at the mirror
(hf-mirror.com) AND prefer a manually-downloaded copy under LOCAL_DIR: the
HuggingFace cache itself is unreliable on Windows here (snapshot files ended up
as 0-byte stubs because symlink creation fails without privileges).

PyAV compatibility
------------------
faster-whisper 1.2.1 still calls ``av.open(..., metadata_errors="ignore")``,
but PyAV 19 dropped that keyword argument entirely (see
``av/container/core.py::open``). The result is a hard failure:

    TypeError: open() got an unexpected keyword argument 'metadata_errors'

Two independent defences, so a future version skew cannot break us again:

1. ``_patch_av()`` shims ``av.open`` so the legacy kwarg is folded into
   ``options={"metadata_errors": ...}``, which PyAV 19 does understand.
2. ``decode_audio_16k()`` decodes with PyAV ourselves and hands Whisper a
   float32 numpy array. ``WhisperModel.transcribe()`` accepts ndarray input and
   then never touches its own decoder, so the fragile code path is bypassed
   entirely on the hot path.
"""
import os

_MODEL = None
_MODEL_NAME = None
_AV_PATCHED = False

# Manually downloaded CTranslate2 whisper model (see crawler/README.md).
LOCAL_DIR = os.environ.get("LISTENBOOK_ASR_DIR", "D:/models/faster-whisper-small")
_LOCAL_FILES = ("model.bin", "config.json", "tokenizer.json", "vocabulary.txt")

# Whisper always wants 16 kHz mono float32 in [-1, 1].
SAMPLE_RATE = 16000


def _model_name():
    return os.environ.get("ASR_MODEL", "small")


def _local_ready():
    return all(os.path.exists(os.path.join(LOCAL_DIR, f)) for f in _LOCAL_FILES)


def _patch_av():
    """Make PyAV >= 15 tolerate the legacy ``metadata_errors`` kwarg."""
    global _AV_PATCHED
    if _AV_PATCHED:
        return
    try:
        import av
    except Exception:  # noqa: BLE001 - whisper import will complain later
        return

    orig_open = av.open

    def _open(file, mode=None, **kwargs):
        if "metadata_errors" in kwargs:
            legacy = kwargs.pop("metadata_errors")
            opts = dict(kwargs.get("options") or {})
            opts.setdefault("metadata_errors", legacy)
            kwargs["options"] = opts
        return orig_open(file, mode=mode, **kwargs)

    av.open = _open
    # Some modules did ``from av.container import open`` at import time; patch
    # the module attribute too so those references are covered.
    try:
        import av.container
        av.container.open = _open
    except Exception:  # noqa: BLE001
        pass
    _AV_PATCHED = True


def decode_audio_16k(path, sr=SAMPLE_RATE):
    """Decode any audio file to mono float32 @ ``sr`` using PyAV directly.

    Mirrors what ``faster_whisper.audio.decode_audio`` does (s16 -> float32
    /32768), without depending on its internals.
    """
    import av
    import numpy as np

    _patch_av()
    with av.open(str(path), mode="r") as container:
        stream = next((s for s in container.streams if s.type == "audio"), None)
        if stream is None:
            raise RuntimeError("音频文件中没有音频流")
        resampler = av.audio.resampler.AudioResampler(
            format="s16", layout="mono", rate=sr
        )
        chunks = []
        for frame in container.decode(stream):
            for resampled in resampler.resample(frame):
                chunks.append(resampled.to_ndarray())
        # Flush the resampler so the tail of the file is not dropped.
        for resampled in resampler.resample(None):
            chunks.append(resampled.to_ndarray())

    if not chunks:
        raise RuntimeError("解码后没有得到任何音频采样")
    raw = np.concatenate(chunks, axis=1).reshape(-1)
    return raw.astype(np.float32) / 32768.0


def available():
    try:
        import faster_whisper  # noqa: F401
        return True, ""
    except Exception as e:  # noqa: BLE001
        return False, str(e)


def ensure_model(name=None, log=print):
    """Load (and cache) the whisper model.

    Prefers the local model directory; otherwise falls back to downloading via
    the HuggingFace mirror into D:/hf-cache.
    """
    global _MODEL, _MODEL_NAME
    name = name or _model_name()
    if _MODEL is not None and _MODEL_NAME == name:
        return _MODEL
    from faster_whisper import WhisperModel

    _patch_av()  # must happen before any decode

    # Keep caches off C: -- the user is disk-space sensitive on C:.
    os.environ.setdefault("HF_ENDPOINT", os.environ.get("LISTENBOOK_HF_ENDPOINT",
                                                        "https://hf-mirror.com"))
    os.environ.setdefault("HF_HOME", os.environ.get("LISTENBOOK_HF_HOME", "D:/hf-cache"))

    threads = max(4, (os.cpu_count() or 8) - 2)
    if _local_ready():
        log(f"   加载 Whisper 模型（本地目录 {LOCAL_DIR}，{threads} 线程）")
        _MODEL = WhisperModel(LOCAL_DIR, device="cpu", compute_type="int8",
                              cpu_threads=threads)
    else:
        log(f"   加载 Whisper 模型 '{name}'（首次会经 hf-mirror 下载到 D:/hf-cache）")
        _MODEL = WhisperModel(name, device="cpu", compute_type="int8",
                              cpu_threads=threads, download_root="D:/hf-cache/whisper")
    _MODEL_NAME = name
    log("   模型就绪")
    return _MODEL


def transcribe(audio_path, log=print, language="en"):
    """Return [(start, end, text), ...] with sentence-ish granularity.

    ``audio_path`` may be a filesystem path (decoded here) or an already
    decoded float32 numpy array.

    vad_filter is only enabled when onnxruntime imported successfully (it is an
    optional path in some faster-whisper builds).
    """
    import numpy as np

    model = ensure_model(log=log)

    if isinstance(audio_path, np.ndarray):
        samples = audio_path
    else:
        samples = decode_audio_16k(audio_path)
    log(f"   音频时长 {samples.shape[0] / SAMPLE_RATE:.0f}s，开始转写 …")

    kwargs = dict(
        language=language,
        beam_size=1,
        condition_on_previous_text=False,
    )
    try:
        import onnxruntime  # noqa: F401
        kwargs["vad_filter"] = True
        kwargs["vad_parameters"] = {"min_silence_duration_ms": 500}
    except Exception:  # noqa: BLE001
        log("   （onnxruntime 不可用，跳过 VAD 静音切分）")

    segments, info = model.transcribe(samples, **kwargs)
    out = []
    for seg in segments:
        txt = (seg.text or "").strip()
        if txt:
            out.append((float(seg.start), float(seg.end), txt))
    log(f"   转写完成：{len(out)} 段，时长 {getattr(info, 'duration', 0):.0f}s")
    return out


def is_usable_audio(path, min_bytes=20000):
    """Reject error pages saved as .mp3 (some CDNs return HTML on failure)."""
    try:
        if os.path.getsize(path) < min_bytes:
            return False
        with open(path, "rb") as f:
            head = f.read(16)
        if head[:3] == b"ID3":
            return True
        if head[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
            return True
        if head[:4] == b"fLaC":
            return True
        if head[:4] == b"RIFF":
            return True
        if head[4:8] == b"ftyp":  # mp4/m4a
            return True
        return False
    except OSError:
        return False

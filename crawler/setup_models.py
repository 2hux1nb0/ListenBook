"""One-shot downloader for the two local models the crawler needs.

Why a script instead of letting the libraries fetch them:
  * huggingface.co is not reachable on this machine -> must go through
    hf-mirror.com (HF_ENDPOINT).
  * The HuggingFace *cache* writes 0-byte snapshot files on Windows here
    (symlink creation fails without privileges), which makes faster-whisper
    fail with "File model.bin is incomplete". Downloading to a plain directory
    and pointing the library at that path sidesteps it entirely.

Usage:  python setup_models.py            # both models
        python setup_models.py --mt       # translation model only
        python setup_models.py --asr      # speech model only
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lib import common  # noqa: E402

MIRROR = os.environ.get("HF_ENDPOINT", "https://hf-mirror.com")

JOBS = {
    "mt": {
        "repo": "ooeoeo/opus-mt-en-zh-ct2-float16",
        "dir": os.environ.get("LISTENBOOK_MT_DIR", "D:/models/opus-mt-en-zh-ct2-fp16"),
        "files": ["config.json", "model.bin", "shared_vocabulary.json",
                  "source.spm", "target.spm"],
        "desc": "英译中（CTranslate2 + SentencePiece，约 152MB）",
    },
    "asr": {
        "repo": "Systran/faster-whisper-small",
        "dir": os.environ.get("LISTENBOOK_ASR_DIR", "D:/models/faster-whisper-small"),
        "files": ["config.json", "tokenizer.json", "vocabulary.txt", "model.bin"],
        "desc": "语音转写 Whisper small（int8，约 484MB）",
    },
}


def fetch(repo, name, dest, log):
    if os.path.exists(dest) and os.path.getsize(dest) > 1024:
        log(f"    已存在，跳过 {name} ({os.path.getsize(dest) / 1048576:.1f} MB)")
        return True
    url = f"{MIRROR}/{repo}/resolve/main/{name}"
    log(f"    下载 {name} …")
    try:
        n = common.download(url, dest, timeout=7200)
    except Exception as e:  # noqa: BLE001
        log(f"    失败 {name}: {e}")
        return False
    log(f"    完成 {name} ({n / 1048576:.1f} MB)")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mt", action="store_true")
    ap.add_argument("--asr", action="store_true")
    args = ap.parse_args()
    which = [k for k in ("mt", "asr")
             if (args.mt or args.asr) and getattr(args, k)] or ["mt", "asr"]

    log = print
    log(f"镜像源: {MIRROR}")
    ok_all = True
    for key in which:
        job = JOBS[key]
        log(f"\n[{key}] {job['desc']}\n  目标目录: {job['dir']}")
        os.makedirs(job["dir"], exist_ok=True)
        for f in job["files"]:
            ok_all &= fetch(job["repo"], f, os.path.join(job["dir"], f), log)
    log("\n全部完成 ✅" if ok_all else "\n有文件下载失败，请重跑本脚本（已完成的会跳过）")
    return 0 if ok_all else 1


if __name__ == "__main__":
    sys.exit(main())

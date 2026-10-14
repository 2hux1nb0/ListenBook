# ListenBook 内容爬虫

从公开播客订阅源（RSS）抓取英语学习内容，生成**中英双语时间轴字幕**，写入 ListenBook 后端。

## 它做什么

```
订阅源(RSS) ─▶ 最新若干集 ─┬─▶ 官方字幕（有就直接用）
                            └─▶ 本地 Whisper 语音转写（没有才跑）
                                        │
                                        ├─▶ 本地 opus-mt 模型翻成中文（离线）
                                        └─▶ 入库（只写文本 + 官方直链）
```

- **音频不落地**：数据库只存官方 CDN 直链，浏览器直接拉流。零存储、零带宽成本。
- **封面也不落地**：存官方专辑图 URL（`Podcast.cover_url`）。
- **字幕格式**：`M:SS 句子`，一行一句。前端 `parseTranscript()` / `highlightTranscript()`
  会据此在播放时自动逐句高亮、滚动、点时间戳跳转 —— 这部分前端本来就有，无需改动。

## 快速开始

```bash
cd crawler

# 1. 看看哪些源在本机网络下可用（国际站点很多会被墙）
python discover.py

# 2. 干跑一遍，只抓取不入库，用来检查
python crawl.py --dry-run --source easy-english-everyday-conversations --limit 1

# 3. 正式跑（会写入线上数据库）
python crawl.py
```

需要语音转写时，用带 faster-whisper 的虚拟环境：

```bash
../.venv-crawler/Scripts/python.exe crawl.py
```

**Windows 下直接双击 `run_daily.bat`** 即可跑完整流程（抓取 → 补字幕两步，并自动设好
`HF_ENDPOINT` 与 `PYTHONIOENCODING`）。整轮约 30–40 分钟。

> 注：`run_daily.bat` 在沙箱环境里无法执行（不允许调 cmd），**逻辑与已在 Linux 侧验证过的
> 调用完全一致，但 .bat 本身未实测**。首次使用请留意窗口输出。

## 常用参数

| 参数 | 说明 |
|---|---|
| `--list` | 列出已配置的源 |
| `--dry-run` | 只抓取、不写库 |
| `--source a,b` | 只处理指定 slug（支持逗号分隔） |
| `--limit N` | 每个源本轮抓几集 |
| `--max-asr N` | 本轮最多转写几集（控制耗时） |
| `--no-asr` | 完全跳过语音识别（只用官方字幕） |
| `--no-translate` | 不做中文翻译 |
| `--backfill` | **补字幕模式**：给库里已存在但没字幕的剧集补上（此时 `--limit` 含义变成「每源最多补几集」） |

## 补字幕（为什么需要单独一条路径）

首次抓取时，如果某集官方没字幕、ASR 又没跑成（额度用完 / 音频超限 / 转写链路当时坏了），
它就会**以空字幕入库**。之后它既被 `state["done"]` 记成已完成、又被后端
`existing_audio_urls` 挡住，正常抓取流程再也不会碰它 —— 字幕就永远缺着：**播了没字幕**。

所以补录必须显式跑：

```bash
../.venv-crawler/Scripts/python.exe crawl.py --backfill                  # 全部源
../.venv-crawler/Scripts/python.exe crawl.py --backfill --source <slug>  # 只补某个源
../.venv-crawler/Scripts/python.exe crawl.py --backfill --dry-run        # 只看能补什么
```

报告写在 `logs/last_backfill.json`。已滚出订阅源的老剧集补不了（计入 `no_source`），
因为拿不到它的官方字幕地址。

## 几个踩过的逻辑坑（都已修）

1. **`asr_used` 跨轮累积**：它本意是「本轮额度」，但写进 `state.json` 后从不重置，
   于是第二轮起 `asr_used >= max_asr` 恒成立 —— 表现是**静默降级成无字幕入库**，
   不报错，极难发现。现在每轮开始显式清零。
2. **`existing_audio_urls` 打到了未鉴权的端点**：`/api/admin/episodes/` 是 admin-only，
   原来以 `auth=False` 调用只会拿到 401，于是「库中已有 N 集」永远是 0，后端去重实际失效
   （只剩本地 `state.json` 兜着，state 一丢就重复入库）。现在走鉴权并复用 `list_episodes()`。
3. **一个源出错会中断整轮**：`ensure_podcast()` 原来不在 try 里，遇到一次代理
   `502 Bad Gateway` 直接抛异常，把后面所有源全废掉。现在「建/查播客」「读已有剧集」
   「生成字幕」各自兜住异常，单源失败只影响自己；最外层还有一层兜底，异常会写
   `logs/CRASH.txt` 再退出（exit=3），不会只留一个看不懂的返回码。
4. **`max_audio_mb` 太紧会让长节目永远没字幕**：原来 45MB，把 47MB / 49.6MB 两集长节目
   挡在转写之外，入库即空字幕。已放宽到 90MB（约 60–90 分钟音频，ASR 约 5–8 分钟）。

## 配置

- `sources.json` —— 要抓的播客清单（含分类与难度分级）
- `config.json` —— 后端地址、账号、每轮抓取上限等（**含密码，已 gitignore**）
- `cache/` —— 翻译缓存、音频缓存、去重状态（已 gitignore）
- `logs/last_run.json` —— 最近一次抓取报告；`logs/last_backfill.json` —— 补字幕报告；
  万一有没预料到的异常，会写 `logs/CRASH.txt`

### 关键配置项

| 键 | 值 | 说明 |
|---|---|---|
| `per_source_limit` | 2 | 每源每轮抓几集 |
| `max_asr_per_run` | 20 | 每轮最多转写几集（**每轮开始清零**）。8源×2集=16，设 20 保证当天新内容都有字幕 |
| `max_audio_mb` | 90 | 单集超过就跳过转写。90MB ≈ 60–90 分钟音频 |
| `audio_cache_days` | 3 | 音频缓存保留天数。字幕入库后 mp3 就没用了，不清会以每月近 10GB 膨胀 |
| `backfill_limit` | 10 | `--backfill` 时每源最多补几集 |

## 本地模型

两个模型都放在 **D 盘**（C 盘空间敏感），由 `setup_models.py` 经 `hf-mirror.com` 下载：

| 用途 | 目录 | 说明 |
|---|---|---|
| 语音识别 | `D:/models/faster-whisper-small` | CTranslate2 格式，int8，CPU |
| 英译中 | `D:/models/opus-mt-en-zh-ct2-fp16` | CT2 float16 |

翻译模型是**多语种** Marian，必须带目标语前缀 `>>cmn_Hans<<`，否则会输出繁体甚至复读乱码
（见 `lib/localmt.py` 的 `TARGET_PREFIX`）。

## 环境依赖与坑（踩过的，别再踩）

1. **PyAV ≥ 15 删掉了 `av.open(metadata_errors=...)`，而 faster-whisper 1.2.1 仍在传它**，
   直接报 `TypeError: open() got an unexpected keyword argument 'metadata_errors'`。
   `lib/asr.py` 里做了两层防护：
   - `_patch_av()` —— 把旧关键字折进 `options={"metadata_errors": "ignore"}`；
   - `decode_audio_16k()` —— 自己用 PyAV 解码成 16 kHz 单声道 float32 ndarray 再交给模型，
     `WhisperModel.transcribe()` 接受 ndarray 时不会调用它自己的解码器，从根上绕开。
2. **HuggingFace 缓存在 Windows 上会生成 0 字节文件**（无权限创建软链），
   所以一律手动下载到 `D:/models/...`，再让 `WhisperModel` 指向该目录。
3. 装依赖走**清华镜像**：`pip install -i https://pypi.tuna.tsinghua.edu.cn/simple ...`。
   从 PyPI 直连装 `onnxruntime` 会卡 20 分钟以上，镜像只要几十秒。
4. 下载大文件（~460MB 模型）要带续传循环，`curl` 偶发静默中断。
5. **音频缓存绝不能被"半截文件"污染**（2026-10-02 踩到，已修）。
   症状：`转写失败：[WinError 10054] 远程主机强迫关闭了一个现有的连接`，
   下一轮却报 `音频时长 29s`（该集真实时长 829s），字幕只有开场几秒。
   原因：`common.download()` 原来直接流式写进目标文件，断连时残包留在原地；
   而 `asr_segments()` 用 `os.path.exists(dest)` 判断"已下载过" → 残包被当完整音频转写。
   判断残包的快捷办法：文件大小是 65536（读块大小）的整数倍，基本就是断包。
   修复：`download()` 改为写 `<dest>.part`，**校验 Content-Length + 断线续传（Range）+ 重试 3 次**，
   全部成功才 `os.replace` 到 `dest`；彻底失败则删掉 `.part` 并抛错，
   `dest` 保证不存在 → 下一轮会重新下载，而不是拿半截文件凑合。
   ⚠️ 若线上已混入这类"半截字幕"，光重跑 `--backfill` 没用（它只看字幕是否为空）：
   要先把该集 `subtitle_en/subtitle_zh` 清空 + 删掉对应缓存文件，再跑 `--backfill`。

## 已知限制

- 只收录**本机网络实测可达**的源。BBC / VOA / YouTube / `hls.ted.com` 在当前网络下不可达，
  所以抓不到；有条件加代理后，把源加进 `sources.json` 即可。
- 下载实测约 1.5 MB/s（15MB 一集约 8-10 秒），已不是瓶颈；瓶颈是 ASR 的 CPU 时间。
- 转写吞吐实测约 **11-12 倍速**（994 秒音频 → 84 秒出 281 段/237 句，18 线程）。
  `max_asr_per_run` 默认 20（覆盖 8 源 × 2 集 = 16 集/天），整轮约 **30-40 分钟**；
  期间会吃满 CPU，若嫌吵/卡就把 `max_asr_per_run` 调小，或把 `ASR_MODEL` 换成 `base`。
- 免费翻译接口（有道 demo / MyMemory）有频率与额度限制，已**降级为兜底**，主路径是本地模型。

## 版权说明

只通过**官方 RSS 订阅源**读取，并保留音频在原官方 CDN 播放（与播客客户端行为一致），
不下载转存、不再分发。`discover.py` 只收录公开订阅源。

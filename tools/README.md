# tools/ — 词库构建

播放详情页的"按英语水平标注生词"依赖 `data/dict.json`（约 3 MB）。这个文件是**生成物**，
需要时按下面步骤重建即可；它本身已经提交在仓库里，日常部署不需要重新生成。

## 1. 下载 ECDICT（约 64 MB，不入库）

数据源：[skywind3000/ECDICT](https://github.com/skywind3000/ECDICT) 的 `ecdict.csv`。
需要的列：`word / translation / tag / frq / exchange`（`tag` 是考纲归属，`frq` 是 COCA 词频排名）。

> **坑**：用 `raw.githubusercontent.com` 拉这个文件会被限速到 ~6 KB/s（要 3 小时）。
> 改用 GitHub 的 **blobs API**，实测 5.4 MB/s，十几秒就完了：

```bash
# 1) 取 blob sha
curl -s -H "User-Agent: ListenBook" \
  https://api.github.com/repos/skywind3000/ECDICT/contents/ecdict.csv?ref=master \
  | python -c "import sys,json;print(json.load(sys.stdin)['sha'])"

# 2) 用 sha 直接下 blob（把 <SHA> 换成上一步的结果），base64 解出 CSV
SHA=<SHA>
curl -s -H "User-Agent: ListenBook" \
  "https://api.github.com/repos/skywind3000/ECDICT/git/blobs/$SHA" \
  | python -c "
import sys, json, base64, io
d = json.load(sys.stdin)
io.open(r'_wip/ecdict.csv', 'w', encoding='utf-8', newline='').write(
    base64.b64decode(d['content']).decode('utf-8'))
print('bytes:', d['size'])
"
```

> 注意：raw.githubusercontent.com 不带 `User-Agent` 头会返回 200 但**空 body**，
> 不要据此判断文件不存在。

## 2. 生成词库

```bash
python tools/build_dict.py            # 读 _wip/ecdict.csv -> 写 data/dict.json
```

路径都可以用环境变量覆盖：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `ECDICT_CSV` | `_wip/ecdict.csv` | 输入词典 |
| `OUT_JSON` | `data/dict.json` | 输出（前端 `js/dict.js` 会 `fetch('data/dict.json')`） |
| `LB_SCRATCH` | `_wip/` | 临时目录（`ecdict.csv`、`corpus_wordfreq.json`） |

脚本结束时会打印体积、带考纲标签的词数，以及若干样例词的词条，便于肉眼核对。

## 3. 输出结构

```jsonc
{
  "v": 1,
  "levels":  ["cet4","cet6","ielts","toefl","kaoyan"],
  "levelBit": {"cet4":1,"cet6":2,"kaoyan":4,"ielts":8,"toefl":16},
  "baseline": {"cet4":193,...},   // 该水平的"已知词"标签位掩码并集
  "trivial": 400,                 // frq <= 400 的词永不标注（"the"/"can" 之类）
  "rare":    {"cet4":9000,...},   // 无考纲标签的词，词频低于此值才算生词
  "words":   {"abandon": ["放弃；抛弃", 20, 2200]},  // [中文释义, 标签位掩码, COCA 排名]
  "forms":   {"abandoned": "abandon"}                // 屈折形式 -> 原形
}
```

`js/dict.js` 的 `classify(word, level)` 就是靠这些字段判定 `syll`（本级考纲词）/
`beyond`（超纲生词）/ `null`（不标注）：

1. `frq > 0 && frq <= trivial` → 不标注；
2. 命中本级考纲位 → `syll`；
3. 命中本级 baseline（更低水平的词）→ 不标注；
4. 无任何考纲标签时，只有 `frq === 0 || frq > rare[level]` 才算 `beyond`；
5. 其余 → `beyond`。

## 4. 调参

想改"标注密度"，改 `tools/build_dict.py` 顶部的常量再重建：

- `TRIVIAL_FRQ` — 调高 → 更少标注（高频词更彻底地跳过）
- `RARE_BY_LEVEL` — 调低 → 无考纲标签的词更容易被判为超纲
- `MAX_ZH` — 单词后紧跟的中文释义长度上限（默认 48 字）

改完记得重建 `data/dict.json` 并重新部署前端。

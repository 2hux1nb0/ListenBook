@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo   ListenBook 内容爬虫 - 日常更新
echo ============================================
echo.

rem 优先用带语音识别依赖的虚拟环境
set "PY=..\.venv-crawler\Scripts\python.exe"
if not exist "%PY%" set "PY=..\.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo [ERROR] 找不到 Python 虚拟环境
  echo         期望路径: ..\.venv-crawler\Scripts\python.exe
  pause
  exit /b 1
)

rem 模型走国内镜像（huggingface.co 在本机网络不可达）
set "HF_ENDPOINT=https://hf-mirror.com"
set "PYTHONIOENCODING=utf-8"

echo 使用 Python : %PY%
echo 开始时间    : %date% %time%
echo.

echo [1/2] 抓取新内容 ...
"%PY%" -u crawl.py
set "RC=%ERRORLEVEL%"

echo.
echo [2/2] 补字幕兜底（给库里已有但没字幕的剧集补上）...
"%PY%" -u crawl.py --backfill

echo.
echo 结束时间 : %date% %time%  (抓取 exit=%RC%)
if exist "logs\last_run.json" (
  echo 抓取报告 : logs\last_run.json
)
if exist "logs\last_backfill.json" (
  echo 补字幕报告 : logs\last_backfill.json
)
echo.
pause
exit /b %RC%

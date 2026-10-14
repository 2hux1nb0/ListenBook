@echo off
chcp 65001 >nul
title 停止 ListenBook 服务
echo 正在向 WSL 中的 ListenBook 服务发送停止信号...
wsl -d Ubuntu-22.04 -e bash -c "pkill -f 'runserver 0.0.0.0:8000' && echo [OK] 已停止运行中的服务 || echo [提示] 未发现运行中的服务"
echo.
pause

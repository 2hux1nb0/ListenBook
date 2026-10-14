@echo off
chcp 65001 >nul
title ListenBook 开发服务器 (WSL Ubuntu-22.04)
cls
echo ============================================================
echo   ListenBook 开发服务器
echo   前端(index.html / css / js) + 后端(API) 均由 Django 在 WSL 托管
echo   访问地址: http://listenbook.local:8000/
echo   管理后台: http://listenbook.local:8000/admin/
echo   备用地址: http://localhost:8000/   (WSL IP 变化也可用)
echo   停止服务: 在此窗口按  Ctrl + C
echo ============================================================
echo.

REM 检查 8000 端口是否已有服务在运行，避免重复启动导致端口冲突
wsl -d Ubuntu-22.04 -e bash -c "curl -s -o /dev/null -m 2 http://127.0.0.1:8000/ && exit 0 || exit 1" >nul 2>&1
if %errorlevel%==0 (
    echo [提示] 8000 端口已有服务在运行，直接访问下列地址即可：
    echo         http://listenbook.local:8000/
    echo         按任意键退出本窗口（不会停止已运行的服务）...
    pause >nul
    exit /b
)

echo 正在 WSL (Ubuntu-22.04) 中启动服务，首次启动 WSL 需几秒，请稍候...
echo.
wsl -d Ubuntu-22.04 -e bash -lc "cd /mnt/d/ShiZhe/ListenBook/backend && python3 manage.py runserver 0.0.0.0:8000"
echo.
echo [已停止] 服务器已退出。按任意键关闭此窗口...
pause >nul

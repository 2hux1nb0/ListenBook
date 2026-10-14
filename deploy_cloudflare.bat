@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   ListenBook  -^>  Cloudflare Pages  deploy
echo ============================================
echo.

if not exist ".cf_deploy\token.txt" (
  echo [ERROR] .cf_deploy\token.txt not found.
  echo         Put your Cloudflare API token in that file ^(one line, no spaces^).
  goto :fail
)

set /p CF_TOKEN=<".cf_deploy\token.txt"
set "CLOUDFLARE_API_TOKEN=%CF_TOKEN%"
set "CLOUDFLARE_ACCOUNT_ID=b653e2067448c94684ccf32a780458b3"
set "npm_config_cache=D:\npm-cache"

rem ---- locate npx (newest first) ----
set "NPX="
for /f "delims=" %%i in ('dir /b /ad /o-n "C:\Users\13213\.workbuddy\binaries\node\versions" 2^>nul') do (
  if not defined NPX if exist "C:\Users\13213\.workbuddy\binaries\node\versions\%%i\npx.cmd" set "NPX=C:\Users\13213\.workbuddy\binaries\node\versions\%%i\npx.cmd"
)
if not defined NPX for %%i in (npx.cmd) do set "NPX=%%~$PATH:i"
if not defined NPX (
  echo [ERROR] npx not found. Node.js is required.
  echo         Install Node.js LTS ^(to drive D:^) then re-run this script.
  goto :fail
)
echo using npx: %NPX%
echo.

echo [1/3] Rebuilding dist\ ...
if exist dist rmdir /s /q dist
mkdir dist
if not exist index.html (
  echo [ERROR] index.html not found. Is this script in the project root?
  goto :fail
)
copy /y index.html dist\ >nul
for %%d in (css js images admin studio data) do (
  if exist "%%d" ( xcopy /e /i /q "%%d" "dist\%%d" >nul ) else ( echo       skip: %%d )
)
echo       done.
echo.

echo [2/3] Uploading to Cloudflare Pages ...
call "%NPX%" --yes wrangler pages deploy dist --project-name=listenbook --branch=main --commit-dirty=true
if errorlevel 1 goto :fail

echo.
echo [3/3] Deploy OK.
echo       Site : https://listenbook-ebj.pages.dev
echo       Panel: https://dash.cloudflare.com  -^>  Workers ^& Pages  -^>  listenbook
echo.
pause
exit /b 0

:fail
echo.
echo ---- DEPLOY FAILED ----
echo If the token is invalid or expired, create a new one at
echo   https://dash.cloudflare.com/profile/api-tokens
echo and put it into  .cf_deploy\token.txt
echo.
pause
exit /b 1

@echo off
chcp 65001 >nul
title WORLD.EXE — ProRes / H.264 影视级渲染导出
cd /d "%~dp0"

echo 正在启动离线渲染与 FFmpeg 压制流水线...
echo.
node render.js
pause

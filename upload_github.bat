@echo off
setlocal
title TGI Library - Automated GitHub Sync
cd /d "%~dp0"

echo ========================================================
echo        TGI LIBRARY - AUTOMATED GITHUB UPLOADER
echo ========================================================
echo.

node upload_github.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Upload failed with exit code %ERRORLEVEL%.
)

echo.
pause

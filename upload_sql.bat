@echo off
setlocal
cd /d "%~dp0"
echo ======================================================
echo    SUPABASE AUTOMATIC SQL FILE RUNNER
echo ======================================================
node upload_sql.js %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Script encountered an error. Press any key to exit.
    pause >nul
) else (
    echo.
    echo Done! Press any key to close.
    pause >nul
)

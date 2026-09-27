@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
    py -3 rule_manager.py
) else (
    python rule_manager.py
)
if errorlevel 1 pause
endlocal

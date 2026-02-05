@echo off
setlocal enabledelayedexpansion

:: FaxWare CLI - Simple command interface
:: Usage: faxware [command]
::   start   - Start FaxWare server and open browser
::   stop    - Stop FaxWare server
::   status  - Check if FaxWare is running
::   install - Install faxware command globally
::   help    - Show this help

set "FAXWARE_DIR=%~dp0"
set "FAXWARE_DIR=%FAXWARE_DIR:~0,-1%"

if "%1"=="" goto help
if "%1"=="start" goto start
if "%1"=="stop" goto stop
if "%1"=="status" goto status
if "%1"=="install" goto install
if "%1"=="help" goto help
goto help

:start
echo.
echo  ███████╗ █████╗ ██╗  ██╗██╗    ██╗ █████╗ ██████╗ ███████╗
echo  ██╔════╝██╔══██╗╚██╗██╔╝██║    ██║██╔══██╗██╔══██╗██╔════╝
echo  █████╗  ███████║ ╚███╔╝ ██║ █╗ ██║███████║██████╔╝█████╗  
echo  ██╔══╝  ██╔══██║ ██╔██╗ ██║███╗██║██╔══██║██╔══██╗██╔══╝  
echo  ██║     ██║  ██║██╔╝ ██╗╚███╔███╔╝██║  ██║██║  ██║███████╗
echo  ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
echo.
echo  Starting FaxWare OS...
echo.

:: Check if node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  ERROR: Node.js is not installed or not in PATH
    echo  Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: Check if already running
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8787.*LISTENING" 2^>nul') do (
    echo  FaxWare is already running on port 8787
    echo  Opening browser...
    start http://localhost:8787
    exit /b 0
)

:: Start server and open browser
start "FaxWare Server" /min cmd /c "cd /d "%FAXWARE_DIR%" && node server.js"
timeout /t 2 /nobreak >nul
start http://localhost:8787
echo  FaxWare started! Browser opening...
echo  Press Ctrl+C in the server window to stop.
exit /b 0

:stop
echo  Stopping FaxWare...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8787.*LISTENING" 2^>nul') do (
    taskkill /PID %%a /F >nul 2>nul
    echo  FaxWare stopped.
    exit /b 0
)
echo  FaxWare is not running.
exit /b 0

:status
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8787.*LISTENING" 2^>nul') do (
    echo  FaxWare is RUNNING on port 8787 (PID: %%a)
    exit /b 0
)
echo  FaxWare is NOT running.
exit /b 0

:install
echo  Installing FaxWare command globally...
powershell -ExecutionPolicy Bypass -File "%FAXWARE_DIR%\setup-faxware.ps1"
exit /b 0

:help
echo.
echo  FaxWare CLI
echo  ===========
echo.
echo  Usage: faxware [command]
echo.
echo  Commands:
echo    start    Start FaxWare and open browser
echo    stop     Stop FaxWare server
echo    status   Check if FaxWare is running
echo    install  Install 'faxware' command globally
echo    help     Show this help
echo.
echo  First time? Run: faxware install
echo  Then restart PowerShell and use: faxware start
echo.
exit /b 0

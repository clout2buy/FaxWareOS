@echo off
:: FaxWare One-Click Installer
:: Just double-click this file to install!

echo.
echo  FaxWare Installer
echo  =================
echo.
echo  This will install the 'faxware' command so you can
echo  start FaxWare from anywhere by typing: faxware start
echo.

:: Run the PowerShell setup script
powershell -ExecutionPolicy Bypass -File "%~dp0setup-faxware.ps1"

pause

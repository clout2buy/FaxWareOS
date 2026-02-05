@echo off
:: FaxWare OS - Build Installer
:: Double-click to create installer package

echo.
echo  ========================================
echo   FaxWare OS Installer Builder
echo  ========================================
echo.

cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "build-installer.ps1"

echo.
echo  Build complete! Check the dist folder.
echo.
pause

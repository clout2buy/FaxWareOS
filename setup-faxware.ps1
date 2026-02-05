# FaxWare Setup Script
# Installs the 'faxware' command globally so you can run it from anywhere

$ErrorActionPreference = "Stop"

# Get the directory where this script is located (FaxWare root)
$faxwareDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cmdSource = Join-Path $faxwareDir "faxware.cmd"

# Target directory for global commands
$binDir = Join-Path $env:USERPROFILE "bin"

Write-Host ""
Write-Host "  ███████╗ █████╗ ██╗  ██╗██╗    ██╗ █████╗ ██████╗ ███████╗" -ForegroundColor Cyan
Write-Host "  ██╔════╝██╔══██╗╚██╗██╔╝██║    ██║██╔══██╗██╔══██╗██╔════╝" -ForegroundColor Cyan
Write-Host "  █████╗  ███████║ ╚███╔╝ ██║ █╗ ██║███████║██████╔╝█████╗  " -ForegroundColor Cyan
Write-Host "  ██╔══╝  ██╔══██║ ██╔██╗ ██║███╗██║██╔══██║██╔══██╗██╔══╝  " -ForegroundColor Cyan
Write-Host "  ██║     ██║  ██║██╔╝ ██╗╚███╔███╔╝██║  ██║██║  ██║███████╗" -ForegroundColor Cyan
Write-Host "  ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  FaxWare Setup" -ForegroundColor White
Write-Host "  =============" -ForegroundColor Gray
Write-Host ""

# Check Node.js
Write-Host "  [1/4] Checking Node.js..." -NoNewline
try {
    $nodeVersion = node --version 2>$null
    Write-Host " OK ($nodeVersion)" -ForegroundColor Green
} catch {
    Write-Host " NOT FOUND" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Node.js is required. Please install from: https://nodejs.org" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Create bin directory
Write-Host "  [2/4] Creating bin directory..." -NoNewline
if (!(Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
    Write-Host " CREATED" -ForegroundColor Green
} else {
    Write-Host " EXISTS" -ForegroundColor Green
}

# Copy faxware.cmd to bin
Write-Host "  [3/4] Installing faxware command..." -NoNewline
$targetCmd = Join-Path $binDir "faxware.cmd"

# Create a wrapper that points to the actual location
$wrapperContent = @"
@echo off
call "$cmdSource" %*
"@
Set-Content -Path $targetCmd -Value $wrapperContent -Force
Write-Host " OK" -ForegroundColor Green

# Add to PATH if not already there
Write-Host "  [4/4] Adding to PATH..." -NoNewline
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$binDir*") {
    $newPath = $currentPath.TrimEnd(";") + ";" + $binDir
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Host " ADDED" -ForegroundColor Green
} else {
    Write-Host " ALREADY SET" -ForegroundColor Green
}

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Gray
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Gray
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    1. Close and reopen PowerShell" -ForegroundColor Gray
Write-Host "    2. Type: " -NoNewline -ForegroundColor Gray
Write-Host "faxware start" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Available commands:" -ForegroundColor White
Write-Host "    faxware start   - Start FaxWare and open browser" -ForegroundColor Gray
Write-Host "    faxware stop    - Stop FaxWare" -ForegroundColor Gray
Write-Host "    faxware status  - Check if running" -ForegroundColor Gray
Write-Host ""

# Offer to start now
$response = Read-Host "  Start FaxWare now? (y/n)"
if ($response -eq "y" -or $response -eq "Y") {
    Write-Host ""
    & $cmdSource start
}

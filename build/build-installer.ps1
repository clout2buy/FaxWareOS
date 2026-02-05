# =============================================================================
# FaxWare OS - Professional Installer Builder
# =============================================================================
# This script creates a professional Windows installer for FaxWare OS
# Requirements: Node.js, npm, Inno Setup (optional for .exe installer)
# =============================================================================

param(
    [switch]$SkipPkg,
    [switch]$SkipInno,
    [string]$Version = "1.0.0"
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot
$BUILD_DIR = Join-Path $ROOT "build"
$DIST_DIR = Join-Path $ROOT "dist"
$PKG_DIR = Join-Path $DIST_DIR "pkg"

Write-Host "Root: $ROOT" -ForegroundColor Gray

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  FaxWare OS Installer Builder v$Version" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# -----------------------------------------------------------------------------
# Step 1: Prepare directories
# -----------------------------------------------------------------------------
Write-Host "[1/5] Preparing directories..." -ForegroundColor Yellow

if (Test-Path $DIST_DIR) {
    Remove-Item $DIST_DIR -Recurse -Force
}
New-Item -ItemType Directory -Path $DIST_DIR -Force | Out-Null
New-Item -ItemType Directory -Path $PKG_DIR -Force | Out-Null

Write-Host "  Created dist directory" -ForegroundColor Green

# -----------------------------------------------------------------------------
# Step 2: Copy application files
# -----------------------------------------------------------------------------
Write-Host "[2/5] Copying application files..." -ForegroundColor Yellow

$filesToCopy = @(
    "server.js",
    "package.json",
    "faxware.cmd",
    "setup-faxware.ps1",
    "INSTALL.bat",
    "README.md"
)

$foldersToCopy = @(
    "web",
    "agent",
    "assets",
    "lib"
)

foreach ($file in $filesToCopy) {
    $src = Join-Path $ROOT $file
    if (Test-Path $src) {
        Copy-Item $src -Destination $PKG_DIR -Force
        Write-Host "  Copied $file" -ForegroundColor Gray
    } else {
        Write-Host "  Warning: $file not found at $src" -ForegroundColor Yellow
    }
}

foreach ($folder in $foldersToCopy) {
    $src = Join-Path $ROOT $folder
    if (Test-Path $src) {
        Copy-Item $src -Destination $PKG_DIR -Recurse
        Write-Host "  Copied $folder/" -ForegroundColor Gray
    }
}

# Create empty data directories
New-Item -ItemType Directory -Path (Join-Path $PKG_DIR "screenshots") -Force | Out-Null
Write-Host "  Created data directories" -ForegroundColor Green

# -----------------------------------------------------------------------------
# Step 3: Install dependencies
# -----------------------------------------------------------------------------
Write-Host "[3/5] Installing production dependencies..." -ForegroundColor Yellow

Push-Location $PKG_DIR
npm install --production --silent 2>$null
Pop-Location

Write-Host "  Dependencies installed" -ForegroundColor Green

# -----------------------------------------------------------------------------
# Step 4: Create standalone executable (optional)
# -----------------------------------------------------------------------------
if (-not $SkipPkg) {
    Write-Host "[4/5] Creating standalone executable..." -ForegroundColor Yellow
    
    # Check if pkg is installed
    $pkgInstalled = npm list -g pkg 2>$null | Select-String "pkg@"
    if (-not $pkgInstalled) {
        Write-Host "  Installing pkg globally..." -ForegroundColor Gray
        npm install -g pkg --silent
    }
    
    Push-Location $PKG_DIR
    
    # Check if package.json exists
    $pkgJsonPath = Join-Path $PKG_DIR "package.json"
    if (Test-Path $pkgJsonPath) {
        # Create pkg config in package.json
        $pkgJson = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
        
        # Add or update pkg configuration
        if (-not $pkgJson.pkg) {
            $pkgJson | Add-Member -NotePropertyName "pkg" -NotePropertyValue @{
                targets = @("node18-win-x64")
                outputPath = "."
                assets = @("web/**/*", "agent/**/*", "assets/**/*", "lib/**/*")
            } -Force
        }
        $pkgJson | ConvertTo-Json -Depth 10 | Set-Content $pkgJsonPath
        
        Write-Host "  Building with pkg..." -ForegroundColor Gray
        
        # Build executable
        try {
            pkg . --target node18-win-x64 --output "FaxWare.exe" 2>&1 | Out-Null
        } catch {
            Write-Host "  pkg build encountered an issue: $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  package.json not found in $PKG_DIR" -ForegroundColor Yellow
    }
    
    Pop-Location
    
    if (Test-Path (Join-Path $PKG_DIR "FaxWare.exe")) {
        Write-Host "  Created FaxWare.exe" -ForegroundColor Green
    } else {
        Write-Host "  Warning: Failed to create exe (pkg may not be available)" -ForegroundColor Yellow
    }
} else {
    Write-Host "[4/5] Skipping pkg build..." -ForegroundColor Gray
}

# -----------------------------------------------------------------------------
# Step 5: Create Inno Setup installer (optional)
# -----------------------------------------------------------------------------
if (-not $SkipInno) {
    Write-Host "[5/5] Creating installer..." -ForegroundColor Yellow
    
    $innoScript = @"
; FaxWare OS Installer Script
; Generated by build-installer.ps1

#define MyAppName "FaxWare OS"
#define MyAppVersion "$Version"
#define MyAppPublisher "FaxWare"
#define MyAppURL "https://github.com/clout2buy/FaxWareOS"
#define MyAppExeName "FaxWare.exe"

[Setup]
AppId={{B8A4F2D1-3E5C-4A7B-9F1D-8C2E6B4A9D3F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={autopf}\FaxWare
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=
OutputDir=$DIST_DIR
OutputBaseFilename=FaxWare-Setup-{#MyAppVersion}
SetupIconFile=$ROOT\assets\logo.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "addtopath"; Description: "Add FaxWare to PATH"; GroupDescription: "System Integration:"

[Files]
Source: "$PKG_DIR\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; NOTE: Don't use "Flags: ignoreversion" on any shared system files

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  Path: string;
begin
  if CurStep = ssPostInstall then
  begin
    if WizardIsTaskSelected('addtopath') then
    begin
      RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', Path);
      if Pos(ExpandConstant('{app}'), Path) = 0 then
      begin
        Path := Path + ';' + ExpandConstant('{app}');
        RegWriteStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', Path);
      end;
    end;
  end;
end;
"@

    $innoScriptPath = Join-Path $BUILD_DIR "faxware-installer.iss"
    $innoScript | Set-Content $innoScriptPath -Encoding UTF8
    
    # Check if Inno Setup is installed
    $innoCompiler = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    if (Test-Path $innoCompiler) {
        & $innoCompiler $innoScriptPath
        Write-Host "  Created FaxWare-Setup-$Version.exe" -ForegroundColor Green
    } else {
        Write-Host "  Inno Setup not found. Install from: https://jrsoftware.org/isdl.php" -ForegroundColor Yellow
        Write-Host "  Inno script saved to: $innoScriptPath" -ForegroundColor Gray
    }
} else {
    Write-Host "[5/5] Skipping Inno Setup..." -ForegroundColor Gray
}

# -----------------------------------------------------------------------------
# Create ZIP distribution
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "Creating ZIP distribution..." -ForegroundColor Yellow

$zipPath = Join-Path $DIST_DIR "FaxWare-$Version.zip"
Compress-Archive -Path "$PKG_DIR\*" -DestinationPath $zipPath -Force
Write-Host "  Created FaxWare-$Version.zip" -ForegroundColor Green

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Build Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Output files:" -ForegroundColor Cyan
Get-ChildItem $DIST_DIR -File | ForEach-Object {
    $size = "{0:N2} MB" -f ($_.Length / 1MB)
    Write-Host "  $($_.Name) ($size)" -ForegroundColor White
}
Write-Host ""
Write-Host "Distribution folder: $PKG_DIR" -ForegroundColor Gray
Write-Host ""

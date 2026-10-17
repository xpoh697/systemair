# deploy.ps1 - Automates deployment of the Systemair integration and Lovelace Card to Home Assistant server

$ErrorActionPreference = "Stop"

$SourceDir = "$PSScriptRoot\custom_components\systemair"
$DestDir = "\\192.168.100.5\config\custom_components\systemair"
$CardSource = "$PSScriptRoot\systemair-recuperator-card.js"
$CardDestDir = "\\192.168.100.5\config\www"
$HostIP = "192.168.100.5"

Write-Host "=== Starting Systemair Integration & Card Deployment ===" -ForegroundColor Cyan

# 1. Check destination folder accessibility
Write-Host "Checking accessibility of destination share: $DestDir..." -NoNewline
if (Test-Path $DestDir) {
    Write-Host " [OK]" -ForegroundColor Green
} else {
    Write-Host " [CREATING]" -ForegroundColor Yellow
    try {
        New-Item -Path $DestDir -ItemType Directory -Force | Out-Null
        Write-Host "Destination directory created." -ForegroundColor Green
    } catch {
        Write-Host " [FAILED]" -ForegroundColor Red
        Write-Error "Destination path $DestDir is not accessible. Please ensure SMB share is mounted and accessible."
    }
}

# 2. Synchronize integration files using robocopy
Write-Host "Synchronizing integration files from $SourceDir to $DestDir..." -ForegroundColor Yellow
$exitCode = 0
try {
    robocopy $SourceDir $DestDir /MIR /XD __pycache__ /R:3 /W:5 /NDL /NFL | Out-Null
    $exitCode = $LASTEXITCODE
} catch {
    $exitCode = 8
}

if ($exitCode -ge 8) {
    Write-Error "Robocopy failed during synchronization (exit code: $exitCode)."
} else {
    Write-Host "Integration synchronization completed successfully." -ForegroundColor Green
}

# 3. Clean remote __pycache__ directory
$RemoteCache = Join-Path $DestDir "__pycache__"
if (Test-Path $RemoteCache) {
    Write-Host "Cleaning remote __pycache__ on server..." -ForegroundColor Yellow
    Remove-Item -Path $RemoteCache -Recurse -Force
    Write-Host "Remote __pycache__ directory deleted." -ForegroundColor Green
} else {
    Write-Host "No remote __pycache__ directory found, skipping cleanup." -ForegroundColor Gray
}

# 4. Deploy Lovelace JS Card to www/
if (Test-Path $CardSource) {
    Write-Host "Deploying Lovelace Card to $CardDestDir..." -ForegroundColor Yellow
    if (!(Test-Path $CardDestDir)) {
        New-Item -Path $CardDestDir -ItemType Directory -Force | Out-Null
    }
    Copy-Item -Path $CardSource -Destination $CardDestDir -Force
    Write-Host "Lovelace card deployed to $CardDestDir\systemair-recuperator-card.js" -ForegroundColor Green
}

Write-Host "=== Deployment Completed Successfully ===" -ForegroundColor Green

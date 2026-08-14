# FinanceHot - Docker Desktop installer for Windows
#
# Purpose : Install Docker Desktop (with WSL2 backend) on this Windows machine.
#           Required for stage 02+ (PostgreSQL pgvector + Redis via docker compose).
#
# Usage   : Right-click this file -> "Run with PowerShell", OR
#           powershell -ExecutionPolicy Bypass -File .\scripts\install-docker.ps1
#
# Notes   : - The script auto-elevates to Administrator when it is not already admin.
#           - A reboot is REQUIRED after WSL / VirtualMachinePlatform features are enabled.
#           - After reboot, launch "Docker Desktop" once to finish first-run setup.

$ErrorActionPreference = 'Stop'

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# --- Elevate if needed -------------------------------------------------------
if (-not (Test-Admin)) {
    Write-Host "[info] Not running as Administrator. Requesting elevation (click Yes on the UAC prompt)..."
    Start-Process powershell -Verb RunAs -ArgumentList @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', ('"{0}"' -f $PSCommandPath)
    )
    exit 0
}

Write-Host "=== FinanceHot: Docker Desktop installer ==="

# --- 1. Already installed? ---------------------------------------------------
Write-Host "`n[1/5] Checking existing Docker..."
if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "Docker is already installed:"
    docker --version
    docker compose version
    exit 0
}

# --- 2. Enable Windows features (WSL2 + Virtual Machine Platform) ------------
Write-Host "`n[2/5] Enabling Windows features (WSL2 + VirtualMachinePlatform)..."
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart | Out-Null
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart | Out-Null
Write-Host "      Features requested (a reboot may be required)."

# --- 3. Install Docker Desktop -----------------------------------------------
Write-Host "`n[3/5] Installing Docker Desktop..."
$winget = Get-Command winget -ErrorAction SilentlyContinue
if ($winget) {
    Write-Host "      Using winget..."
    winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
} else {
    Write-Host "      winget not found. Downloading the official installer..."
    $url = 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe'
    $out = Join-Path $env:TEMP 'DockerDesktopInstaller.exe'
    Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
    Write-Host "      Running installer (quiet)..."
    Start-Process -FilePath $out -ArgumentList 'install', '--quiet', '--accept-license' -Wait
}

# --- 4. Ensure WSL kernel is up to date --------------------------------------
Write-Host "`n[4/5] Updating WSL kernel..."
try {
    wsl --update
} catch {
    Write-Host "      (wsl --update skipped: $_)"
}

# --- 5. Report next steps ----------------------------------------------------
Write-Host "`n[5/5] Done."
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. RESTART the computer (required after enabling WSL / VM platform)."
Write-Host "  2. Launch 'Docker Desktop' and finish the first-run wizard."
Write-Host "  3. Verify with:  docker --version   and   docker compose version"
Write-Host "  4. Back in the project:  docker compose up -d postgres redis"

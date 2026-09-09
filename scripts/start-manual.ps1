#Requires -Version 5.1
<#
.SYNOPSIS
  Chạy tay: Docker Compose + Cloudflare Tunnel (không dùng Task Scheduler).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-manual.ps1
#>

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Read-DotEnvValue {
    param([string]$Key)
    $envFile = Join-Path $Root ".env"
    if (-not (Test-Path $envFile)) { return $null }
    foreach ($line in Get-Content $envFile -Encoding utf8) {
        $t = $line.Trim()
        if ($t -eq "" -or $t.StartsWith("#")) { continue }
        if ($t -match "^${Key}=(.*)$") { return $Matches[1].Trim() }
    }
    return $null
}

Write-Host "=== Gas Store — start manually ===" -ForegroundColor Cyan
Write-Host "Directory: $Root"

Write-Host "`n[1/3] wait Docker Desktop..." -ForegroundColor Yellow
$deadline = (Get-Date).AddMinutes(15)
$dockerOk = $false
while ((Get-Date) -lt $deadline) {
    cmd /c "docker info >nul 2>&1"
    if ($LASTEXITCODE -eq 0) { $dockerOk = $true; break }
    Start-Sleep -Seconds 5
}
if (-not $dockerOk) {
    Write-Host "Docker is not ready. Open Docker Desktop and run the script again." -ForegroundColor Red
    exit 1
}
Write-Host "Docker OK." -ForegroundColor Green

Write-Host "`n[2/3] docker compose up -d --build ..." -ForegroundColor Yellow
cmd /c "docker compose up -d --build"
if ($LASTEXITCODE -ne 0) {
    Write-Host "docker compose failed (exit $LASTEXITCODE)" -ForegroundColor Red
    exit 1
}
Write-Host "Stack: web http://127.0.0.1:8686  api http://127.0.0.1:8000" -ForegroundColor Green

# Dọn image dangling (<none>) sinh ra sau mỗi lần build lại, tránh đầy ổ đĩa.
Write-Host "Cleanup: docker image prune -f ..." -ForegroundColor Yellow
cmd /c "docker image prune -f"

$token = Read-DotEnvValue -Key "CLOUDFLARE_TUNNEL_TOKEN"
if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "`n[3/3] Skip tunnel: CLOUDFLARE_TUNNEL_TOKEN is missing in .env" -ForegroundColor Yellow
    exit 0
}

$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
    Write-Host "`n[3/3] Install cloudflared: winget install Cloudflare.cloudflared" -ForegroundColor Red
    exit 1
}

$running = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "`n[3/3] cloudflared is running (PID $($running.Id -join ',')) — skip." -ForegroundColor Yellow
} else {
    Write-Host "`n[3/3] Start tunnel (hidden window, log: logs\cloudflared-tunnel.log)..." -ForegroundColor Yellow
    $logDir = Join-Path $Root "logs"
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
    $cfLog = Join-Path $logDir "cloudflared-tunnel.log"
    Start-Process -FilePath $cf.Source `
        -ArgumentList @("tunnel", "--no-autoupdate", "run", "--token", $token) `
        -WindowStyle Hidden `
        -RedirectStandardError $cfLog
    Start-Sleep -Seconds 3
    Write-Host "Tunnel started." -ForegroundColor Green
}

Write-Host "`nPublic:" -ForegroundColor Cyan
Write-Host "  https://app.gashuyhoang.io.vn"
Write-Host "  https://api.gashuyhoang.io.vn"
Write-Host "=== Xong ===" -ForegroundColor Cyan

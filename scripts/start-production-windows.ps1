#Requires -Version 5.1
<#
.SYNOPSIS
  Starts the Gas Store Docker stack and Cloudflare Tunnel on Windows.

.DESCRIPTION
  Intended for logon startup (see install-windows-startup.ps1). Waits for Docker,
  runs docker compose up -d, then starts cloudflared if not already running.
  Reads CLOUDFLARE_TUNNEL_TOKEN from the repo root .env file.
#>

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$LogDir = Join-Path $Root "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}
$RunLog = Join-Path $LogDir "startup-windows.log"

function Write-RunLog {
    param([string]$Message)
    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -Path $RunLog -Value $line -Encoding utf8
}

function Read-DotEnvValue {
    param([string]$Key)
    $envFile = Join-Path $Root ".env"
    if (-not (Test-Path $envFile)) {
        return $null
    }
    foreach ($line in Get-Content $envFile -Encoding utf8) {
        $trimmed = $line.Trim()
        if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
        if ($trimmed -match "^${Key}=(.*)$") {
            return $Matches[1].Trim()
        }
    }
    return $null
}

function Wait-DockerReady {
    param([int]$TimeoutSeconds = 180)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $null = docker info 2>&1
            if ($LASTEXITCODE -eq 0) {
                return $true
            }
        } catch {
            # Docker CLI not ready yet
        }
        Start-Sleep -Seconds 5
    }
    return $false
}

function Start-CloudflaredTunnel {
    param([string]$Token)
    $existing = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
    if ($existing) {
        Write-RunLog "cloudflared already running (PID $($existing.Id -join ','))"
        return
    }
    $cfLog = Join-Path $LogDir "cloudflared-tunnel.log"
    $cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
    if (-not $cloudflared) {
        Write-RunLog "ERROR: cloudflared not in PATH. Install: winget install Cloudflare.cloudflared"
        return
    }
    Start-Process -FilePath $cloudflared.Source `
        -ArgumentList @("tunnel", "--no-autoupdate", "run", "--token", $Token) `
        -WindowStyle Hidden `
        -RedirectStandardError $cfLog
    Write-RunLog "Started cloudflared tunnel (log: $cfLog)"
}

try {
    Write-RunLog "=== startup begin ==="

    if (-not (Wait-DockerReady)) {
        Write-RunLog "ERROR: Docker not ready within timeout"
        exit 1
    }
    Write-RunLog "Docker is ready"

    docker compose up -d 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-RunLog "ERROR: docker compose up failed (exit $LASTEXITCODE)"
        exit 1
    }
    Write-RunLog "docker compose up -d OK"

    $token = Read-DotEnvValue -Key "CLOUDFLARE_TUNNEL_TOKEN"
    if ([string]::IsNullOrWhiteSpace($token)) {
        Write-RunLog "WARN: CLOUDFLARE_TUNNEL_TOKEN missing in .env — skipping tunnel"
        exit 0
    }

    Start-Sleep -Seconds 5
    Start-CloudflaredTunnel -Token $token
    Write-RunLog "=== startup done ==="
} catch {
    Write-RunLog "ERROR: $($_.Exception.Message)"
    exit 1
}

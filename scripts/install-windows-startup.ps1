#Requires -Version 5.1
<#
.SYNOPSIS
  Registers a Windows Scheduled Task to run start-production-windows.ps1 at user logon.

.DESCRIPTION
  Task name: GasStore-Production. Run once after setting CLOUDFLARE_TUNNEL_TOKEN in .env.
  Does not require Administrator for the current user's logon trigger.
  To remove: .\scripts\uninstall-windows-startup.ps1
#>

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$StartScript = Join-Path $Root "scripts\start-production-windows.ps1"

if (-not (Test-Path $StartScript)) {
    throw "Missing script: $StartScript"
}

$TaskName = "GasStore-Production"
$PsExe = (Get-Command powershell.exe).Source
$Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartScript`""

$action = New-ScheduledTaskAction -Execute $PsExe -Argument $Arguments -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Gas Store: Docker Compose + Cloudflare Tunnel" `
    -Force | Out-Null

Write-Host "Registered scheduled task: $TaskName"
Write-Host "Runs at logon for user: $env:USERNAME"
Write-Host "Start script: $StartScript"
Write-Host ""
Write-Host "Test now:"
Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""

#Requires -Version 5.1
<#
.SYNOPSIS
  Removes the GasStore-Production Windows Scheduled Task.
#>

$TaskName = "GasStore-Production"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Removed scheduled task (if it existed): $TaskName"

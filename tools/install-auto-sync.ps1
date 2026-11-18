# Turns DJSinatra Auto Sync on (default) or off (-Uninstall).
# On = a Windows task that starts tools\auto-sync.ps1 hidden every time you sign in.
param([switch]$Uninstall)
$name = 'DJSinatra Auto Sync'

# stop any running copy
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -like '*auto-sync.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Auto Sync is OFF. Use 'Sync Songs.bat' to upload songs by hand." -ForegroundColor Yellow
  return
}

$script = Join-Path $PSScriptRoot 'auto-sync.ps1'
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
              -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $name -Description 'Uploads songs added to the instrumentals folder to DJSinatra on GitHub' `
  -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $name
Write-Host "Auto Sync is ON." -ForegroundColor Green
Write-Host "Add or delete songs in your instrumentals folder - about a minute later they upload by themselves"
Write-Host "and a pop-up tells you when your TV, phone and PC have them. It starts again whenever you sign in."

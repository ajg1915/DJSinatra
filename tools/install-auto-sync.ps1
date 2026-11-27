# Turns DJSinatra Auto Sync on (default) or off (-Uninstall).
# On = a shortcut in your Windows Startup folder that starts tools\auto-sync.ps1 hidden
# every time you sign in (no admin rights needed), and starts it right now.
# Plus a "DJSinatra Auto Sync Keep-Alive" task that checks every 10 minutes and restarts
# Auto Sync if it stopped (e.g. after sleep). If it's already running, the check does nothing.
param([switch]$Uninstall)

$startup = [Environment]::GetFolderPath('Startup')
$lnkPath = Join-Path $startup 'DJSinatra Auto Sync.lnk'
$script  = Join-Path $PSScriptRoot 'auto-sync.ps1'
$hidden  = Join-Path $PSScriptRoot 'run-hidden.vbs'
$keepAlive = 'DJSinatra Auto Sync Keep-Alive'
Unregister-ScheduledTask -TaskName $keepAlive -Confirm:$false -ErrorAction SilentlyContinue

# stop any running copy
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*\auto-sync.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
# clean up the older scheduled-task version, if it exists
Unregister-ScheduledTask -TaskName 'DJSinatra Auto Sync' -Confirm:$false -ErrorAction SilentlyContinue

if ($Uninstall) {
  if (Test-Path -LiteralPath $lnkPath) { Remove-Item -LiteralPath $lnkPath -Force }
  Write-Host "Auto Sync is OFF. Use 'Sync Songs.bat' to upload songs by hand." -ForegroundColor Yellow
  return
}

try {
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($lnkPath)
  $lnk.TargetPath = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  $lnk.Arguments  = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
  $lnk.WorkingDirectory = $PSScriptRoot
  $lnk.WindowStyle = 7   # minimized
  $lnk.Description = 'DJSinatra Auto Sync - uploads songs added to your instrumentals folder'
  $lnk.Save()
} catch {
  Write-Host "Couldn't add Auto Sync to Startup: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

try {
  $action   = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wscript.exe" -Argument "`"$hidden`" `"$script`""
  $every10  = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)
  $atLogon  = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
  $who      = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $keepAlive -Action $action -Trigger $every10, $atLogon -Settings $settings -Principal $who `
    -Description 'Restarts DJSinatra Auto Sync if it stopped. Does nothing when it is already running.' -ErrorAction Stop | Out-Null
} catch {
  Write-Host "Note: couldn't add the 10-minute keep-alive check ($($_.Exception.Message)). Auto Sync still starts at sign-in." -ForegroundColor Yellow
}

Start-Process -FilePath "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', "`"$script`"" -WindowStyle Hidden

Write-Host "Auto Sync is ON." -ForegroundColor Green
Write-Host "Add or delete songs in your instrumentals folder - about a minute later they upload by themselves"
Write-Host "and a pop-up tells you when your TV, phone and PC have them. It starts again whenever you sign in,"
Write-Host "and restarts itself within 10 minutes if it ever stops (for example after the PC sleeps)."

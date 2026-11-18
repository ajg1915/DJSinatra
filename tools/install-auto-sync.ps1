# Turns DJSinatra Auto Sync on (default) or off (-Uninstall).
# On = a shortcut in your Windows Startup folder that starts tools\auto-sync.ps1 hidden
# every time you sign in (no admin rights needed), and starts it right now.
param([switch]$Uninstall)

$startup = [Environment]::GetFolderPath('Startup')
$lnkPath = Join-Path $startup 'DJSinatra Auto Sync.lnk'
$script  = Join-Path $PSScriptRoot 'auto-sync.ps1'

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

Start-Process -FilePath "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', "`"$script`"" -WindowStyle Hidden

Write-Host "Auto Sync is ON." -ForegroundColor Green
Write-Host "Add or delete songs in your instrumentals folder - about a minute later they upload by themselves"
Write-Host "and a pop-up tells you when your TV, phone and PC have them. It starts again whenever you sign in."

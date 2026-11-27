# Shows whether DJSinatra Auto Sync is set up and running.
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'DJSinatra Auto Sync.lnk'
$procs = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*\auto-sync.ps1*' })
$log = Join-Path $env:LOCALAPPDATA 'DJSinatra\auto-sync.log'
Write-Host "Starts at sign-in : $(Test-Path -LiteralPath $lnk)"
Write-Host "Running now       : $($procs.Count -gt 0) $(($procs | ForEach-Object ProcessId) -join ',')"
$task = Get-ScheduledTask -TaskName 'DJSinatra Auto Sync Keep-Alive' -ErrorAction SilentlyContinue
Write-Host "Restarts if stopped: $([bool]$task)$(if ($task) { " (checks every 10 min)" })"
Write-Host "Last log lines:"
if (Test-Path $log) { Get-Content $log -Tail 4 | ForEach-Object { Write-Host "  $_" } } else { Write-Host "  (no log yet)" }

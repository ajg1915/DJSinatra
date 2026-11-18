# DJSinatra - Auto Sync
# Runs quietly in the background (started at Windows sign-in by the "DJSinatra Auto Sync" task).
# Watches your instrumentals folder; ~1 minute after you add, delete or rename songs it runs
# Sync Songs automatically and shows a pop-up when the upload is done.
param([int]$QuietSeconds = 60)

$app    = Split-Path $PSScriptRoot -Parent
$source = Split-Path $app -Parent
$sync   = Join-Path $PSScriptRoot 'sync-songs.ps1'
$logDir = Join-Path $env:LOCALAPPDATA 'DJSinatra'
$log    = Join-Path $logDir 'auto-sync.log'
New-Item -ItemType Directory -Force $logDir | Out-Null

# only one copy at a time
$mutex = New-Object Threading.Mutex($false, 'Local\DJSinatraAutoSync')
if (-not $mutex.WaitOne(0)) { exit 0 }

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$tray = New-Object Windows.Forms.NotifyIcon
$tray.Icon = [Drawing.SystemIcons]::Information
$tray.Text = 'DJSinatra Auto Sync'
$tray.Visible = $true
function Notify($title, $text) {
  $tray.BalloonTipTitle = $title; $tray.BalloonTipText = $text
  $tray.ShowBalloonTip(8000)
}
function Log($msg) { Add-Content -LiteralPath $log -Value "$(Get-Date -Format s)  $msg" -Encoding UTF8 }

function Run-Sync {
  Log 'sync started'
  $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $sync -Yes *>&1 | Out-String
  $ok = $LASTEXITCODE -eq 0
  Add-Content -LiteralPath $log -Value $out -Encoding UTF8
  $added   = ([regex]::Matches($out, '\+ added')).Count
  $removed = ([regex]::Matches($out, '- removed')).Count
  if (-not $ok) {
    Notify 'DJSinatra: upload failed' 'Check your internet. It will try again on the next change (log: %LOCALAPPDATA%\DJSinatra).'
  } elseif ($added -or $removed) {
    $parts = @(); if ($added) { $parts += "$added added" }; if ($removed) { $parts += "$removed removed" }
    Notify 'DJSinatra songs uploaded' ("$($parts -join ', '). Your TV, phone and PC update in about a minute.")
  }
  Log "sync finished ok=$ok added=$added removed=$removed"
}

$audio = '\.(mp3|wav|m4a|mp4|flac|aac|ogg|wma)$'
$watcher = New-Object IO.FileSystemWatcher $source
$watcher.IncludeSubdirectories = $false
$watcher.NotifyFilter = [IO.NotifyFilters]'FileName, Size, LastWrite'
$watcher.EnableRaisingEvents = $true
$evts = 'Created', 'Deleted', 'Renamed', 'Changed' | ForEach-Object {
  Register-ObjectEvent $watcher $_ -SourceIdentifier "djs-$_"
}

Log "watching $source"
Run-Sync   # catch anything added while the PC was off

$pending = $false; $lastChange = Get-Date
try {
  while ($true) {
    $e = Wait-Event -Timeout 5
    if ($e) {
      $name = $e.SourceEventArgs.Name
      Remove-Event -EventIdentifier $e.EventIdentifier
      if ($name -match $audio) { $pending = $true; $lastChange = Get-Date }
      continue
    }
    # wait until files have stopped changing (big copies / downloads) before syncing
    if ($pending -and ((Get-Date) - $lastChange).TotalSeconds -ge $QuietSeconds) {
      $pending = $false
      Run-Sync
      # our own MP3 conversions trigger events too; ignore those
      Get-Event | Remove-Event
    }
  }
} finally {
  $tray.Visible = $false; $tray.Dispose()
  $mutex.ReleaseMutex()
}

# DJSinatra - Sync Songs
# Keeps your instrumentals folder, the app and GitHub in step:
#   1. Pulls anything you uploaded on the GitHub website and copies it into your folder
#   2. Converts WAV / M4A / MP4 / FLAC / AAC / OGG / WMA to 320k MP3 (originals are kept)
#   3. Adds new MP3s to the app, removes ones you deleted from the folder
#   4. Rebuilds the song list and uploads to GitHub (site + TV app update in ~1 minute)
param(
  [string]$Source,          # folder with your songs (default: the folder that contains DJSinatra)
  [switch]$Yes,             # don't ask before removing songs
  [switch]$NoPush           # sync locally only
)
$ErrorActionPreference = 'Stop'
$app    = Split-Path $PSScriptRoot -Parent
if (-not $Source) { $Source = Split-Path $app -Parent }
$tracks = Join-Path $app 'tracks'
$stateFile = Join-Path $PSScriptRoot 'last-sync.txt'   # songs present after the previous sync
$convertExt = '.wav', '.m4a', '.mp4', '.flac', '.aac', '.ogg', '.wma'
$maxBytes = 95MB   # GitHub refuses files over 100 MB

function Say($msg, $color = 'Gray') { Write-Host $msg -ForegroundColor $color }
function Find-Tool($name, $searchRoot) {
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  if ($searchRoot -and (Test-Path $searchRoot)) {
    $f = Get-ChildItem $searchRoot -Recurse -Filter "$name.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($f) { return $f.FullName }
  }
  return $null
}
function Test-Mp3($path) {
  $fs = [IO.File]::OpenRead($path)
  try { $b = New-Object byte[] 3; [void]$fs.Read($b, 0, 3) } finally { $fs.Close() }
  return (($b[0] -eq 0x49 -and $b[1] -eq 0x44 -and $b[2] -eq 0x33) -or ($b[0] -eq 0xFF -and ($b[1] -band 0xE0) -eq 0xE0))
}

Say "`n=== DJSinatra: Sync Songs ===" Yellow
Say "Songs folder: $Source"
New-Item -ItemType Directory -Force $tracks | Out-Null
$git = Find-Tool 'git' 'C:\Program Files\Git\cmd'

# ---------- 1. get uploads made on the GitHub website ----------
if (-not $NoPush -and $git) {
  Push-Location $app
  try {
    Say "Checking GitHub for songs uploaded on the website..."
    & $git pull -q --no-rebase --no-edit -X theirs origin main
    if ($LASTEXITCODE -ne 0) { throw "Couldn't download changes from GitHub (check your internet)." }
  } finally { Pop-Location }
}
$lastSync = if (Test-Path $stateFile) { @(Get-Content -LiteralPath $stateFile -Encoding UTF8 | Where-Object { $_ }) } else { $null }

# Songs in the app that aren't in your folder and weren't there last sync = uploaded on the website.
foreach ($f in Get-ChildItem -LiteralPath $tracks -File) {
  $inFolder = Test-Path -LiteralPath (Join-Path $Source $f.Name)
  $isNew    = $lastSync -ne $null -and $lastSync -notcontains $f.Name
  if ($f.Extension -ne '.mp3') {
    # non-MP3 uploaded on the website: move it to your folder so it gets converted below
    if (-not $inFolder) { Copy-Item -LiteralPath $f.FullName (Join-Path $Source $f.Name) }
    Remove-Item -LiteralPath $f.FullName -Force
    Say "  < from GitHub (will convert): $($f.Name)" Cyan
  } elseif (-not $inFolder -and $isNew) {
    Copy-Item -LiteralPath $f.FullName (Join-Path $Source $f.Name)
    Say "  < from GitHub: $($f.Name)" Cyan
  }
}

# ---------- 2. convert other audio formats to MP3 ----------
$toConvert = Get-ChildItem -LiteralPath $Source -File | Where-Object {
  $convertExt -contains $_.Extension.ToLower() -and
  -not (Test-Path -LiteralPath (Join-Path $Source ($_.BaseName + '.mp3')))
}
if ($toConvert) {
  $ffmpeg = Find-Tool 'ffmpeg' "$env:LOCALAPPDATA\Microsoft\WinGet\Packages"
  if (-not $ffmpeg) {
    Say "Skipping $(@($toConvert).Count) non-MP3 file(s): FFmpeg isn't installed. Install it with:  winget install Gyan.FFmpeg" Red
  } else {
    foreach ($f in $toConvert) {
      $out = Join-Path $Source ($f.BaseName + '.mp3')
      Say "Converting to MP3: $($f.Name)" Cyan
      & $ffmpeg -hide_banner -loglevel error -y -i $f.FullName -vn -map_metadata 0 -codec:a libmp3lame -b:a 320k -ar 44100 $out
      if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $out)) {
        Say "  could not convert $($f.Name)" Red
        if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Force }
      }
    }
  }
}

# ---------- 3. mirror MP3s into the app ----------
$srcMp3 = @(Get-ChildItem -LiteralPath $Source -File -Filter *.mp3)
if ($srcMp3.Count -eq 0) { Say "No MP3s found in $Source - nothing synced (safety stop)." Red; exit 1 }

$added = @(); $updated = @(); $skipped = @()
foreach ($f in $srcMp3) {
  if ($f.Length -gt $maxBytes) { $skipped += "$($f.Name) (too big for GitHub: $([math]::Round($f.Length/1MB)) MB)"; continue }
  if (-not (Test-Mp3 $f.FullName)) { $skipped += "$($f.Name) (not a real MP3)"; continue }
  $dest = Join-Path $tracks $f.Name
  if (-not (Test-Path -LiteralPath $dest)) { Copy-Item -LiteralPath $f.FullName $dest; $added += $f.Name }
  elseif ((Get-Item -LiteralPath $dest).Length -ne $f.Length) { Copy-Item -LiteralPath $f.FullName $dest -Force; $updated += $f.Name }
}
$srcNames = $srcMp3 | ForEach-Object Name
$gone = @(Get-ChildItem -LiteralPath $tracks -File -Filter *.mp3 | Where-Object { $srcNames -notcontains $_.Name })
if ($gone.Count) {
  Say "`nThese songs are no longer in your folder and will be REMOVED from the app:" Yellow
  $gone | ForEach-Object { Say "  - $($_.Name)" Yellow }
  $ok = $Yes -or ((Read-Host "Remove them? (y/n)") -match '^(y|yes)$')
  if ($ok) { $gone | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force } } else { $gone = @(); Say "Kept them." }
}

foreach ($n in $added)   { Say "  + added    $n" Green }
foreach ($n in $updated) { Say "  ~ updated  $n" Cyan }
foreach ($n in $gone)    { Say "  - removed  $($n.Name)" Yellow }
foreach ($n in $skipped) { Say "  ! skipped  $n" Red }

# ---------- 4. rebuild song list + upload ----------
& (Join-Path $PSScriptRoot 'update-tracks.ps1') -BaseUrl 'https://ajg1915.github.io/DJSinatra' | Out-Null
$names = @(Get-ChildItem -LiteralPath $tracks -File -Filter *.mp3 | Sort-Object Name | ForEach-Object Name)
[IO.File]::WriteAllLines($stateFile, [string[]]$names, (New-Object Text.UTF8Encoding $false))
$count = $names.Count
if ($NoPush) { Say "`nSynced locally (not uploaded). $count songs." Green; exit 0 }
if (-not $git) { Say "Git isn't installed - can't upload." Red; exit 1 }

Push-Location $app
try {
  & $git add -A -- tracks tracks.json playlist.m3u tools/last-sync.txt
  $changes = @(& $git diff --cached --name-status -- tracks)
  $staged  = @(& $git diff --cached --name-only)
  $ahead   = & $git rev-list --count '@{u}..HEAD'
  if (-not $staged.Count -and -not [int]$ahead) {
    Say "`nEverything is already on GitHub. ($count songs)" Green
    exit 0
  }
  $nAdd = @($changes | Where-Object { $_ -match '^A' }).Count
  $nMod = @($changes | Where-Object { $_ -match '^M' }).Count
  $nDel = @($changes | Where-Object { $_ -match '^D' }).Count
  $msg = "Sync songs: +$nAdd added, $nMod updated, -$nDel removed ($count songs)"
  if ($staged.Count) { & $git commit -q -m $msg }
  Say "`nUploading to GitHub... (big batches can take a few minutes)" Cyan
  & $git push -q origin main
  if ($LASTEXITCODE -ne 0) { throw "Upload failed - check your internet and run Sync Songs again." }
  Say "`nDone! $count songs on GitHub." Green
  Say "Your website and TV app will show the changes in about a minute." Green
} finally { Pop-Location }

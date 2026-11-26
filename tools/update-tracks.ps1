# Rebuilds tracks.json and playlist.m3u from the MP3s in /tracks (for local testing).
# On GitHub this is done automatically by .github/workflows/deploy.yml.
param([string]$BaseUrl = 'http://localhost:8080')

$root = Split-Path $PSScriptRoot -Parent
$dir  = Join-Path $root 'tracks'
New-Item -ItemType Directory -Force $dir | Out-Null

$files = Get-ChildItem $dir -File -Filter *.mp3 | Sort-Object Name

# When each song was added: the commit that added it to tracks/ (same as the GitHub build);
# songs not committed yet use the file's date.
$added = @{}
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git -and (Test-Path 'C:\Program Files\Git\cmd\git.exe')) { $git = Get-Command 'C:\Program Files\Git\cmd\git.exe' }
if ($git) {
  $prevEnc = [Console]::OutputEncoding
  try {
    [Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
    $t = $null
    foreach ($line in (& $git.Source -C $root -c core.quotepath=off log --diff-filter=A --format='@%ct' --name-only -- tracks 2>$null)) {
      if ($line -like '@*') { $t = [long]$line.Substring(1) }
      elseif ($line -and $t) { $n = $line -replace '^tracks/', ''; if (-not $added.ContainsKey($n)) { $added[$n] = $t } }
    }
  } catch {} finally { [Console]::OutputEncoding = $prevEnc }
}
$items = @($files | ForEach-Object {
  $when = if ($added.ContainsKey($_.Name)) { $added[$_.Name] } else { [DateTimeOffset]::new($_.LastWriteTimeUtc).ToUnixTimeSeconds() }
  [ordered]@{ file = $_.Name; size = $_.Length; added = $when }
})
$json  = if ($items.Count) { ConvertTo-Json -InputObject $items -Depth 3 } else { '[]' }
[IO.File]::WriteAllText((Join-Path $root 'tracks.json'), $json, (New-Object Text.UTF8Encoding $false))

$lines = @('#EXTM3U')
foreach ($f in $files) {
  $lines += "#EXTINF:-1,$($f.BaseName)"
  $lines += "$BaseUrl/tracks/$([Uri]::EscapeDataString($f.Name))"
}
[IO.File]::WriteAllText((Join-Path $root 'playlist.m3u'), ($lines -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
Write-Host "tracks.json + playlist.m3u written ($($files.Count) MP3 files)"

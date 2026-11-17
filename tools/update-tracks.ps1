# Rebuilds tracks.json and playlist.m3u from the MP3s in /tracks (for local testing).
# On GitHub this is done automatically by .github/workflows/deploy.yml.
param([string]$BaseUrl = 'http://localhost:8080')

$root = Split-Path $PSScriptRoot -Parent
$dir  = Join-Path $root 'tracks'
New-Item -ItemType Directory -Force $dir | Out-Null

$files = Get-ChildItem $dir -File -Filter *.mp3 | Sort-Object Name
$items = @($files | ForEach-Object { [ordered]@{ file = $_.Name; size = $_.Length } })
$json  = if ($items.Count) { ConvertTo-Json -InputObject $items -Depth 3 } else { '[]' }
[IO.File]::WriteAllText((Join-Path $root 'tracks.json'), $json, (New-Object Text.UTF8Encoding $false))

$lines = @('#EXTM3U')
foreach ($f in $files) {
  $lines += "#EXTINF:-1,$($f.BaseName)"
  $lines += "$BaseUrl/tracks/$([Uri]::EscapeDataString($f.Name))"
}
[IO.File]::WriteAllText((Join-Path $root 'playlist.m3u'), ($lines -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
Write-Host "tracks.json + playlist.m3u written ($($files.Count) MP3 files)"

# Tiny local web server for testing DJSinatra on this PC: http://localhost:8080
# (supports Range requests so you can seek inside MP3s)
param([int]$Port = 8080)

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css'; '.js'='text/javascript'; '.json'='application/json';
            '.webmanifest'='application/manifest+json'; '.svg'='image/svg+xml'; '.png'='image/png';
            '.mp3'='audio/mpeg'; '.m3u'='audio/x-mpegurl' }
$listener = New-Object Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "DJSinatra running at http://localhost:$Port/  (Ctrl+C to stop)"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request; $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
    if ($path -eq '' -or $path.EndsWith('/')) { $path += 'index.html' }
    $full = [IO.Path]::GetFullPath((Join-Path $root $path))
    if (-not $full.StartsWith($root) -or -not (Test-Path $full -PathType Leaf)) {
      $res.StatusCode = 404; $res.Close(); continue
    }
    $ext = [IO.Path]::GetExtension($full).ToLower()
    $res.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
    $res.AddHeader('Accept-Ranges', 'bytes')
    $res.AddHeader('Cache-Control', 'no-cache')
    $fs = [IO.File]::OpenRead($full)
    try {
      $len = $fs.Length; $start = 0; $end = $len - 1
      if ($req.Headers['Range'] -match 'bytes=(\d*)-(\d*)') {
        if ($matches[1]) { $start = [long]$matches[1] }
        if ($matches[2]) { $end = [Math]::Min([long]$matches[2], $len - 1) }
        $res.StatusCode = 206
        $res.AddHeader('Content-Range', "bytes $start-$end/$len")
      }
      $res.ContentLength64 = $end - $start + 1
      if ($req.HttpMethod -ne 'HEAD') {
        $fs.Position = $start
        $buf = New-Object byte[] 65536; $left = $end - $start + 1
        while ($left -gt 0) {
          $n = $fs.Read($buf, 0, [Math]::Min($buf.Length, $left)); if ($n -le 0) { break }
          $res.OutputStream.Write($buf, 0, $n); $left -= $n
        }
      }
    } finally { $fs.Close() }
  } catch { } finally { try { $res.Close() } catch { } }
}

# Small local web server for previewing the site (no Python or Node needed).
# Usage: powershell -ExecutionPolicy Bypass -File tools\serve.ps1 [-Root .] [-Port 8123]
param([string]$Root = ".", [int]$Port = 8123)
$Root = (Resolve-Path $Root).Path
$types = @{ ".html"="text/html; charset=utf-8"; ".css"="text/css"; ".js"="application/javascript"; ".json"="application/json"; ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".gif"="image/gif"; ".webp"="image/webp"; ".svg"="image/svg+xml"; ".ico"="image/x-icon"; ".mp4"="video/mp4" }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Serving $Root on http://localhost:$Port/"
while ($l.IsListening) {
  $ctx = $l.GetContext()
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($path -eq "" -or $path.EndsWith("/")) { $path += "index.html" }
    $file = Join-Path $Root $path
    if (Test-Path $file -PathType Leaf) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $ctx.Response.ContentType = $(if ($types[$ext]) { $types[$ext] } else { "application/octet-stream" })
      $ctx.Response.Headers.Add("Cache-Control", "no-store")
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
  } catch { Write-Host $_ }
  finally { $ctx.Response.Close() }
}

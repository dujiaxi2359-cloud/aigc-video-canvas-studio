$root = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $root "server"
$node = "C:\Program Files\nodejs\node.exe"
$tsx = Join-Path $root "node_modules\tsx\dist\cli.mjs"
$entry = Join-Path $serverDir "src\index.ts"
$arguments = "`"$tsx`" `"$entry`""

Start-Process `
  -FilePath $node `
  -ArgumentList $arguments `
  -WorkingDirectory $serverDir `
  -WindowStyle Hidden

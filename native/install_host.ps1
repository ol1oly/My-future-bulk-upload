# Registers the McGill Student Toolkit native messaging host for the current Windows user (Chrome and Edge).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File native\install_host.ps1
# Undo:  powershell -NoProfile -ExecutionPolicy Bypass -File native\install_host.ps1 -Uninstall
param([switch] $Uninstall)
$ErrorActionPreference = "Stop"
$name = "com.mcgill_student_toolkit.bridge"
$extensionId = "jgipagacoahkppcenahkhhjceiigglag"   # fixed by the "key" in manifest.json
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$keys = @("HKCU:\Software\Google\Chrome\NativeMessagingHosts\$name", "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$name")

if ($Uninstall) {
  foreach ($key in $keys) { if (Test-Path $key) { Remove-Item $key -Force } }
  Remove-Item (Join-Path $dir "$name.json"), (Join-Path $dir "mst_bridge.bat") -ErrorAction SilentlyContinue
  "uninstalled"; return
}

$python = (Get-Command python -ErrorAction Stop).Source
$bat = Join-Path $dir "mst_bridge.bat"
Set-Content -LiteralPath $bat -Encoding ASCII -Value "@echo off`r`n`"$python`" -I -u `"%~dp0mst_bridge.py`" %*"
$manifest = [ordered]@{
  name = $name
  description = "McGill Student Toolkit local bridge"
  path = $bat
  type = "stdio"
  allowed_origins = @("chrome-extension://$extensionId/")
}
$manifestPath = Join-Path $dir "$name.json"
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))  # Chrome rejects a BOM
foreach ($key in $keys) {
  New-Item -Path $key -Force | Out-Null
  Set-Item -Path $key -Value $manifestPath
}
$home_ = Join-Path $env:USERPROFILE ".mst"
New-Item -ItemType Directory -Force -Path (Join-Path $home_ "out") | Out-Null
"installed $name -> $manifestPath (extension $extensionId)"

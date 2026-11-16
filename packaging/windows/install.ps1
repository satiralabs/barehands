# Barehands (new engine) - per-user install for Windows.
# Copies the app to %LOCALAPPDATA%\BarehandsNew and creates a
# Start Menu shortcut (plus a Desktop shortcut). No admin needed.
# Needs Python 3 from python.org (tick "Add python.exe to PATH").
$ErrorActionPreference = "Stop"
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$app = Join-Path $env:LOCALAPPDATA "BarehandsNew"
$keepDir = Join-Path $env:TEMP "barehands-new-keep"

# Keep an existing config and board state across a reinstall.
if (Test-Path $keepDir) { Remove-Item $keepDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $keepDir | Out-Null
foreach ($name in @("barehands.json", "state")) {
    $p = Join-Path $app $name
    if (Test-Path $p) { Copy-Item $p (Join-Path $keepDir $name) -Recurse -Force }
}

New-Item -ItemType Directory -Force -Path $app | Out-Null
Copy-Item -Path (Join-Path $src "barehands-new\*") -Destination $app -Recurse -Force
foreach ($name in @("barehands.json", "state")) {
    $saved = Join-Path $keepDir $name
    if (Test-Path $saved) { Copy-Item $saved (Join-Path $app $name) -Recurse -Force }
}
Remove-Item $keepDir -Recurse -Force

$shell = New-Object -ComObject WScript.Shell
$targets = @(
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"),
    [Environment]::GetFolderPath("Desktop")
)
foreach ($dir in $targets) {
    $lnk = Join-Path $dir "Barehands (New Engine).lnk"
    $sc = $shell.CreateShortcut($lnk)
    $sc.TargetPath = Join-Path $app "run.bat"
    $sc.WorkingDirectory = $app
    $icon = Join-Path $app "packaging\icon.ico"
    if (Test-Path $icon) { $sc.IconLocation = $icon }
    $sc.Description = "Barehands gesture board - new engine build"
    $sc.Save()
}
Write-Host "Installed to $app"
Write-Host "Launch 'Barehands (New Engine)' from the Start Menu or Desktop."

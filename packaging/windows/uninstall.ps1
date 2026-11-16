# Remove the per-user Barehands (new engine) install on Windows.
# Your board state and config inside the app folder go too; copy
# barehands.json and the state folder out first to keep them.
$app = Join-Path $env:LOCALAPPDATA "BarehandsNew"
Get-CimInstance Win32_Process -Filter "Name like 'python%'" |
    Where-Object { $_.CommandLine -like "*BarehandsNew*server.py*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Remove-Item $app -Recurse -Force -ErrorAction SilentlyContinue
foreach ($dir in @(
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"),
    [Environment]::GetFolderPath("Desktop"))) {
    Remove-Item (Join-Path $dir "Barehands (New Engine).lnk") -Force -ErrorAction SilentlyContinue
}
Write-Host "Barehands (new engine) removed."

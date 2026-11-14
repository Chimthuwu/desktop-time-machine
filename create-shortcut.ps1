# Creates (or refreshes) the Desktop Time Machine shortcut on the real Windows
# desktop. Launches Electron directly against this folder so no console window
# flashes at startup.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'

if (-not (Test-Path $electron)) {
    Write-Error "Electron is not installed. Run 'npm install' in $root first."
    exit 1
}

$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$s = $ws.CreateShortcut("$desktop\Desktop Time Machine.lnk")
$s.TargetPath = $electron
$s.Arguments = '.'
$s.WorkingDirectory = $root
$icon = Join-Path $root 'assets\desktop-time-machine.ico'
if (-not (Test-Path $icon)) { $icon = "$electron,0" }
$s.IconLocation = $icon
$s.Description = 'Desktop Time Machine (SkinsOS) - multi-era retro desktop simulator'
$s.Save()
Write-Host "Shortcut created at $desktop\Desktop Time Machine.lnk"

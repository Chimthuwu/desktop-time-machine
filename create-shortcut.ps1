$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$s = $ws.CreateShortcut("$desktop\Desktop Time Machine.lnk")
$s.TargetPath = "Z:\github\skinsos\launch-dtm.bat"
$s.WorkingDirectory = "Z:\github\skinsos"
$s.Description = "Desktop Time Machine - Multi-Environment Retro Desktop Simulator"
$s.Save()
Write-Host "Shortcut created at $desktop\Desktop Time Machine.lnk"
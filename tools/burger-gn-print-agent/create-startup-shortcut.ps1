$dir = Join-Path $env:LOCALAPPDATA 'BurgerGN\print-agent'
$startupDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$startup = Join-Path $startupDir 'BurgerGN-Print-Agent.lnk'
$w = New-Object -ComObject WScript.Shell
$s = $w.CreateShortcut($startup)
$s.TargetPath = 'wscript.exe'
$s.Arguments = '//B "' + $dir + '\start-hidden.vbs"'
$s.WindowStyle = 7
$s.WorkingDirectory = $dir
$s.Save()

$arg = '//B "' + $dir + '\start-hidden.vbs"'
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument $arg
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
try {
  Register-ScheduledTask -TaskName 'BurgerGN Print Agent' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
} catch {
  Write-Host "Aviso: tarefa ONLOGON via PowerShell nao criada ($($_.Exception.Message))"
}

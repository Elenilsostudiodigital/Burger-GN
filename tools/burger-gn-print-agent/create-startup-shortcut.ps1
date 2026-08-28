$dir = Join-Path $env:LOCALAPPDATA 'BurgerGN\print-agent'
$vbs = Join-Path $dir 'start-hidden.vbs'
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'

$startupDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$startup = Join-Path $startupDir 'BurgerGN-Print-Agent.lnk'
$w = New-Object -ComObject WScript.Shell
$s = $w.CreateShortcut($startup)
$s.TargetPath = $wscript
$s.Arguments = '//B "' + $vbs + '"'
$s.WindowStyle = 7
$s.WorkingDirectory = $dir
$s.Save()

function New-AgentTaskSettings {
  try {
    return New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -ExecutionTimeLimit ([TimeSpan]::Zero) `
      -Hidden
  } catch {
    return New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -ExecutionTimeLimit ([TimeSpan]::Zero)
  }
}

function Register-HiddenWscriptTask {
  param(
    [string]$Name,
    $Trigger
  )
  $action = New-ScheduledTaskAction -Execute $wscript -Argument ("//B `"$vbs`"") -WorkingDirectory $dir
  $settings = New-AgentTaskSettings
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $Name -Action $action -Trigger $Trigger -Settings $settings -Principal $principal -Force | Out-Null
}

try {
  Register-HiddenWscriptTask -Name 'BurgerGN Print Agent' -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME)
} catch {
  Write-Host "Aviso: tarefa ONLOGON nao criada ($($_.Exception.Message))"
}

try {
  $repeat = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
  Register-HiddenWscriptTask -Name 'BurgerGN Print Agent Watch' -Trigger $repeat
} catch {
  $tr = 'wscript.exe //B "' + $vbs + '"'
  cmd.exe /c "schtasks /Create /TN `"BurgerGN Print Agent Watch`" /SC MINUTE /MO 1 /F /TR `"$tr`"" | Out-Null
}

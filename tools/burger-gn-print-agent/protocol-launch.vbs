' burgergn-print:// — same as hidden start (watchdog is single-instance).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = dir & "\run-watchdog.cmd"
If fso.FileExists(cmd) Then
  sh.Run """" & cmd & """", 0, False
Else
  sh.Run "cmd /c cd /d """ & dir & """ && node watchdog.mjs", 0, False
End If

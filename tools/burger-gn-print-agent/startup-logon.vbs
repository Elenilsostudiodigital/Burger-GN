' Burger GN — logon launcher for the Windows Startup folder.
' Copied by install-autostart.bat. Does not create shortcuts or tasks.
' Hidden start: wscript.exe window style 0 (no CMD).
Option Explicit
Dim sh, fso, vbs
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
vbs = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\BurgerGN\print-agent\start-hidden.vbs"
If fso.FileExists(vbs) Then
  sh.Run "wscript.exe //B """ & vbs & """", 0, False
End If

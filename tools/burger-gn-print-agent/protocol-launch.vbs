' burgergn-print:// — same hidden launcher (no cmd.exe).
Option Explicit
Dim sh, fso, dir
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "wscript.exe //B """ & dir & "\start-hidden.vbs""", 0, False

' Burger GN — unique hidden launcher (no cmd.exe window).
' Window style 0 = SW_HIDE. wscript.exe is a GUI host, so nothing is shown.
Option Explicit
Dim sh, fso, dir, node, nodeFile, line, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
node = "node.exe"
nodeFile = dir & "\node-path.txt"
If fso.FileExists(nodeFile) Then
  line = Trim(fso.OpenTextFile(nodeFile, 1).ReadLine)
  If Len(line) > 0 Then node = line
End If
If Not fso.FileExists(node) Then
  If fso.FileExists("C:\Program Files\nodejs\node.exe") Then
    node = "C:\Program Files\nodejs\node.exe"
  ElseIf fso.FileExists("C:\Program Files (x86)\nodejs\node.exe") Then
    node = "C:\Program Files (x86)\nodejs\node.exe"
  End If
End If
sh.CurrentDirectory = dir
cmd = """" & node & """ """ & dir & "\watchdog.mjs"""
sh.Run cmd, 0, False

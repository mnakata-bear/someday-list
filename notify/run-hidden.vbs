' タスクスケジューラ用: 黒い窓を出さずに run.cmd を起動する
Set sh = CreateObject("WScript.Shell")
dir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
args = ""
For Each a In WScript.Arguments
  args = args & " " & a
Next
sh.Run "cmd /c """ & dir & "run.cmd""" & args, 0, True

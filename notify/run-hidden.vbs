' For Task Scheduler: start run.cmd without showing a console window.
' Output of the last run goes to %TEMP%\someday-notify.log (for troubleshooting).
' (ASCII only: wscript reads this file in the ANSI code page.)
Set sh = CreateObject("WScript.Shell")
dir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
args = ""
For Each a In WScript.Arguments
  args = args & " " & a
Next
logf = sh.ExpandEnvironmentStrings("%TEMP%") & "\someday-notify.log"
sh.Run "cmd /c """"" & dir & "run.cmd""" & args & " > """ & logf & """ 2>&1""", 0, True

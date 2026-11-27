' Starts a PowerShell script with no window at all (used by the "DJSinatra Auto Sync" task).
' Usage: wscript.exe run-hidden.vbs "C:\path\to\script.ps1"
If WScript.Arguments.Count > 0 Then
  CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & WScript.Arguments(0) & """", 0, False
End If

# 毎日 10:00・15:00・18:00 に「いつかやること」通知を出すタスクを登録する(ログオン中のユーザーで対話的に実行)。
#   .\install-task.ps1                      登録(既にあれば置き換え)
#   .\install-task.ps1 -Time 09:30,13:00    時刻を変えて登録(カンマ区切りで複数可)
#   .\install-task.ps1 -QuietIfEmpty        未完了が 0 件の日は何も出さない
#   .\install-task.ps1 -WhatIf              登録せずに、登録する内容だけ表示(ドライラン)
[CmdletBinding(SupportsShouldProcess)]
param([string[]]$Time = @('10:00', '15:00', '18:00'), [switch]$QuietIfEmpty, [string]$TaskName = 'SomedayListNotify')
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $here 'run-hidden.vbs'
if (-not (Test-Path $vbs)) { throw "run-hidden.vbs が見つかりません: $vbs" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'node が見つかりません。Node.js をインストールして PATH を通してください。' }
if (-not (Test-Path (Join-Path $here 'node_modules\firebase-admin'))) { Write-Warning 'notify フォルダで npm install をまだ実行していないようです。' }
$ats = @($Time | ForEach-Object { [datetime]::ParseExact($_.Trim(), 'HH:mm', $null) })
$timeText = ($Time | ForEach-Object { $_.Trim() }) -join '・'

$arg = '//B //Nologo "{0}"' -f $vbs
if ($QuietIfEmpty) { $arg += ' --quiet-if-empty' }
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument $arg -WorkingDirectory $here
$trigger = @($ats | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ })
# 指定時刻に電源が入っていなかった/スリープだった場合は、起動後に1回実行する。バッテリー駆動でも実行する
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
$user = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

Write-Host "タスク名 : $TaskName"
Write-Host "時刻     : 毎日 $timeText"
Write-Host "ユーザー : $user (ログオン中のみ・対話的)"
Write-Host "実行     : wscript.exe $arg"

if ($PSCmdlet.ShouldProcess($TaskName, "タスクスケジューラに登録(毎日 $timeText)")) {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description 'いつかやること: 未完了タスクの通知(10時・15時・18時)' -Force | Out-Null
  Write-Host '登録しました。今すぐ試すには: Start-ScheduledTask -TaskName' $TaskName
}

# 「いつかやること」通知のタスクを解除する。  .\uninstall-task.ps1 [-WhatIf]
[CmdletBinding(SupportsShouldProcess)]
param([string]$TaskName = 'SomedayListNotify')
$ErrorActionPreference = 'Stop'
if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) { Write-Host "タスク '$TaskName' は登録されていません。"; return }
if ($PSCmdlet.ShouldProcess($TaskName, 'タスクスケジューラから解除')) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "解除しました: $TaskName"
}

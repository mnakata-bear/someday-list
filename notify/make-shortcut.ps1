# スタートメニュー(とデスクトップ)に「いつかやること」のショートカットを作る。
# 作ったショートカットを右クリック →「タスクバーにピン留めする」で、タスクバーから開けるようになる。
#   .\make-shortcut.ps1            スタートメニューとデスクトップに作成
#   .\make-shortcut.ps1 -NoDesktop スタートメニューだけ
param([switch]$NoDesktop)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$targets = @([Environment]::GetFolderPath('Programs'))
if (-not $NoDesktop) { $targets += [Environment]::GetFolderPath('Desktop') }
$sh = New-Object -ComObject WScript.Shell
foreach ($dir in $targets) {
  $lnk = $sh.CreateShortcut((Join-Path $dir 'いつかやること.lnk'))
  $lnk.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $lnk.Arguments = '//B //Nologo "' + (Join-Path $here 'run-hidden.vbs') + '"'
  $lnk.WorkingDirectory = $here
  $lnk.IconLocation = (Join-Path $here 'assets\icon.ico') + ',0'
  $lnk.Description = 'いつかやること(未完了タスクを表示)'
  $lnk.Save()
  Write-Host "作成: $($lnk.FullName)"
}

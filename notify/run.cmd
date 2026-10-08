@echo off
rem いつかやること通知を今すぐ表示する(動作確認用)。引数はそのまま index.mjs に渡る(例: run.cmd --demo)
cd /d "%~dp0"
node index.mjs %*

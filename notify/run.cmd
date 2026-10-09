@echo off
rem Show the "someday" notification now. Arguments are passed to index.mjs (e.g. run.cmd --demo).
rem (ASCII only: cmd.exe reads this file in the ANSI code page.)
cd /d "%~dp0"
node index.mjs %*

@echo off
cd /d "%~dp0..\server"
"C:\Program Files\nodejs\node.exe" "..\node_modules\tsx\dist\cli.mjs" "src\index.ts"

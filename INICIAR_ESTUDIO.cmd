@echo off
cd /d "%~dp0"
echo Comprobando el estudio local...
node scripts/opencut-dev.mjs
pause

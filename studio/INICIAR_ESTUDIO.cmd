@echo off
setlocal
cd /d "%~dp0"
if not exist "scripts\launch.mjs" (
  echo Extrae todo el ZIP a una carpeta y vuelve a abrir este archivo desde esa carpeta.
  goto failed
)
where node.exe >nul 2>nul || goto node_missing
node -e "if (Number(process.versions.node.split('.')[0]) < 24) process.exit(1)" || goto node_missing
echo Abriendo Elite Editor Studio...
node scripts/launch.mjs %*
if errorlevel 1 goto failed
exit /b 0

:node_missing
echo Instala Node.js 24 o posterior, abre una nueva terminal y vuelve a intentar.
:failed
echo Si el problema persiste, revisa logs\inicio.log en la carpeta del estudio.
if /I "%~1"=="--no-browser" exit /b 1
pause
exit /b 1

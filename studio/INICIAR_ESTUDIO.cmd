@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul || goto node_missing
node -e "if (Number(process.versions.node.split('.')[0]) < 24) process.exit(1)" || goto node_missing
where npm.cmd >nul 2>nul || goto node_missing
where ffmpeg.exe >nul 2>nul || goto ffmpeg_missing
where ffprobe.exe >nul 2>nul || goto ffmpeg_missing
if not exist "node_modules\vite\bin\vite.js" (
  echo Instalando dependencias de Elite Editor. La primera vez necesitas Internet.
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto failed
)
call npm run setup
if errorlevel 1 goto failed
echo Estudio: http://127.0.0.1:5173/?workspace=automatic
call npm run dev
if errorlevel 1 goto failed
pause
exit /b 0

:node_missing
echo Instala Node.js 24 o posterior, abre una nueva terminal y vuelve a ejecutar este archivo.
goto failed
:ffmpeg_missing
echo Instala FFmpeg y ffprobe y agrega ambos a PATH. Abre una nueva terminal y vuelve a intentarlo.
:failed
pause
exit /b 1

@echo off
setlocal
set "DIR=%~dp0"
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"
set "TARGET=%DIR%\iniciar-koala.vbs"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LINK=%STARTUP%\Koala Desk Monitor.lnk"

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%LINK%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%TARGET%\"'; $s.WorkingDirectory = '%DIR%'; $s.Description = 'Inicia Koala Desk Monitor en segundo plano'; $s.Save()"

if exist "%LINK%" (
  echo.
  echo [OK] Koala Desk Monitor quedara activo automaticamente al iniciar Windows.
  echo      Acceso directo creado en: %LINK%
  echo.
  echo Iniciando en segundo plano ahora mismo...
  start "" wscript.exe "%TARGET%"
) else (
  echo [ERROR] No se pudo crear el acceso directo en Inicio de Windows.
)
echo.
pause

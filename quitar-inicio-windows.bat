@echo off
setlocal
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Koala Desk Monitor.lnk"

if exist "%LINK%" (
  del "%LINK%"
  echo [OK] Se quito Koala Desk Monitor del inicio automatico de Windows.
) else (
  echo [INFO] No habia acceso directo en Inicio de Windows.
)
echo.
pause

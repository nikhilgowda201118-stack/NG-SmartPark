@echo off
setlocal
cd /d "%~dp0"
echo ===============================================
echo  NG SmartPark - Built by Nithin Gowda
echo ===============================================
py app.py
if errorlevel 1 (
  echo.
  echo Could not start NG SmartPark. Make sure Python is installed.
  pause
)
endlocal

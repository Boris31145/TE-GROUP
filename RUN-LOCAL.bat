@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Локальный сайт: http://127.0.0.1:8000/
echo Каталог загружается из доступных источников. Остановка: Ctrl+C.
where py >nul 2>nul
if %errorlevel% equ 0 (py -3 -m backend.server) else (python -m backend.server)
pause

@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Проверка полного сценария на тестовых машинах: http://127.0.0.1:8000/
echo ТЕСТОВЫЕ ДАННЫЕ. Реальной продажи и оплаты нет.
where py >nul 2>nul
if %errorlevel% equ 0 (py -3 -m backend.server --sandbox) else (python -m backend.server --sandbox)
pause

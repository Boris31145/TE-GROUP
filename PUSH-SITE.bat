@echo off
chcp 65001 >nul
cd /d "C:\Users\games\Desktop\Ford\Oli\Код\TE"
echo === TE GROUP Website Push ===
echo.
git add -A
git status
echo.
git commit -m "feat: calculator overhaul (risk indicators, preparation comparison, price ranges), favicon.ico for Yandex/Google, save-chip modal redesign"
git push origin main
echo.
echo === Done! ===
pause

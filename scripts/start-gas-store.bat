@echo off
REM Chay khi dang nhap Windows: copy shortcut vao Startup folder (xem docs/deploy/windows.md)
cd /d "%~dp0.."

REM Cho Docker Desktop khoi dong (tang neu may cham: 90 hoac 120)
timeout /t 45 /nobreak >nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-manual.ps1"

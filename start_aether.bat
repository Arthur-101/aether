@echo off
title Launching Aether
echo ==============================================
echo   Launching Project Aether (Backend + UI)
echo ==============================================
cd /d "%~dp0"

echo [1/2] Starting Python Backend Daemon...
start "Aether Backend" cmd /k "cd /d "%~dp0" && py -3.12 -m backend.main"

timeout /t 2 /nobreak >nul

echo [2/2] Starting Frontend UI...
start "Aether Frontend" cmd /k "cd /d "%~dp0\frontend" && npm run dev"

timeout /t 2 /nobreak >nul
echo Opening Aether Desktop Interface at http://localhost:1420...
start http://localhost:1420

echo Aether is running!

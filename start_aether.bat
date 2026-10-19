@echo off
title Launching Aether
echo ==============================================
echo   Launching Project Aether (Native Overlay)
echo ==============================================
cd /d "%~dp0"

echo [1/2] Starting Python Backend Daemon...
start "Aether Backend" /D "%~dp0" cmd /k py -3.12 -m backend.main

timeout /t 2 /nobreak >nul

echo [2/2] Starting Transparent Tauri Overlay...
start "Aether Overlay" /D "%~dp0\frontend" cmd /k npm run tauri dev

echo Aether native overlay is starting. No browser will open.

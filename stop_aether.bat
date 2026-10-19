@echo off
title Stop Aether Services
echo ==============================================
echo   Stopping Aether Services and Freeing Ports
echo ==============================================

:: Free ports 8765 (FastAPI), 1420 (Vite), and 8089 (llama-server)
for %%P in (8765 1420 8089) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%P ^| findstr LISTENING') do (
        echo Closing port %%P (PID: %%a)...
        taskkill /F /PID %%a >nul 2>&1
    )
)

:: Ensure llama-server is closed to release VRAM
taskkill /F /IM llama-server.exe >nul 2>&1

echo All Aether ports (8765, 1420, 8089) are now closed and freed!
timeout /t 2 >nul

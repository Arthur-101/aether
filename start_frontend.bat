@echo off
title Aether Overlay
cd /d "%~dp0\frontend"
echo Starting Aether transparent Tauri overlay...
npm run tauri dev
pause

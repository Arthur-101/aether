@echo off
title Aether Backend Daemon
cd /d "%~dp0"
echo Starting Aether Backend Daemon on port 8765...
py -3.12 -m backend.main
pause

"""PyInstaller entry point for the frozen Aether daemon sidecar.

The source tree runs ``python -m backend.main``. That cannot be the frozen
entry script because ``backend/main.py`` uses relative imports, so this tiny
wrapper imports the package and starts the same daemon.
"""

from backend.main import run_daemon

if __name__ == "__main__":
    run_daemon()

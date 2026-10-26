# Creates the isolated Phonon-2 speech-to-text runtime.
# Torch and Transformers stay out of the backend environment.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$venv = Join-Path $root "bin\stt-runtime"
$python = Join-Path $venv "Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-Host "Creating STT runtime at $venv"
    py -3.12 -m venv $venv
    if ($LASTEXITCODE -ne 0) {
        throw "Could not create the Python 3.12 virtual environment."
    }
}

& $python -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed." }

& $python -m pip install -r (Join-Path $root "backend\requirements-stt.txt")
if ($LASTEXITCODE -ne 0) { throw "Phonon-2 runtime installation failed." }

Write-Host "Phonon-2 runtime ready at $venv"

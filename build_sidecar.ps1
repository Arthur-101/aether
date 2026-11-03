# Builds the frozen Python daemon that ships inside the Aether installer.
#
# Output: dist/aether-backend/aether-backend.exe (+ _internal/). The Tauri
# bundle copies that folder to <install dir>\aether-backend\ and the overlay
# starts it on launch. Torch is excluded on purpose: the isolated STT runtime
# owns it, so the sidecar stays small and the daemon never imports it.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Push-Location $root
try {
    if (-not (Test-Path "backend\main.py")) {
        throw "Run build_sidecar.ps1 from the Aether repo root."
    }

    # The checked-in spec carries the analysis options (datas, excludes,
    # hidden imports) so local builds and CI produce the same tree.
    $arguments = @(
        "-m", "PyInstaller",
        "--noconfirm", "--clean",
        "--distpath", "dist",
        "--workpath", "build",
        "aether-backend.spec"
    )

    # CI exports AETHER_PYTHON so the build runs on the same interpreter that
    # `pip install` populated; the `py -3.12` launcher is the dev default.
    $python = $env:AETHER_PYTHON
    if ($python) {
        & $python @arguments
    } else {
        & py -3.12 @arguments
    }
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller failed with exit code $LASTEXITCODE"
    }

    $exe = Join-Path $root "dist\aether-backend\aether-backend.exe"
    if (-not (Test-Path $exe)) {
        throw "The sidecar executable was not produced: $exe"
    }
    Write-Host "Built $exe"
}
finally {
    Pop-Location
}

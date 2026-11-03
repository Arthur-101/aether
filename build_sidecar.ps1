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

    # LiteLLM loads these by path at runtime; PyInstaller only ships a data file
    # if the spec's pattern matches its package-relative path. A too-narrow
    # pattern builds cleanly and then dies with FileNotFoundError on a request,
    # so fail the build here instead. Keep this list in step with
    # aether-backend.spec.
    $litellmData = @(
        "litellm\model_prices_and_context_window_backup.json",
        "litellm\containers\endpoints.json",
        "litellm\llms\openai_like\providers.json",
        "litellm\router_strategy\complexity_router\fuse_presets.json",
        "litellm\litellm_core_utils\tokenizers\anthropic_tokenizer.json"
    )
    $internal = Join-Path $root "dist\aether-backend\_internal"
    $missing = $litellmData | Where-Object { -not (Test-Path (Join-Path $internal $_)) }
    if ($missing) {
        throw "The sidecar is missing LiteLLM data files: $($missing -join ', ')"
    }

    Write-Host "Built $exe"
    Write-Host "Verified $($litellmData.Count) LiteLLM data files under _internal\"

    # tiktoken finds its encodings by pkgutil.iter_modules() over the frozen
    # tiktoken_ext namespace package, so its only plugin has to be embedded in
    # the PYZ (see hiddenimports in aether-backend.spec). It is imported
    # dynamically, so a missing entry builds cleanly and then fails every cloud
    # request with "Unknown encoding cl100k_base".
    $pyzToc = Join-Path $root "build\aether-backend\PYZ-00.toc"
    if (Test-Path $pyzToc) {
        if (-not (Select-String -Path $pyzToc -Pattern "tiktoken_ext\.openai_public" -Quiet)) {
            throw "tiktoken_ext.openai_public is missing from the PYZ; cloud requests will fail to tokenize."
        }
        Write-Host "Verified tiktoken_ext.openai_public in the PYZ"
    }
}
finally {
    Pop-Location
}

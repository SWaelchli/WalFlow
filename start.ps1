# To start type ".\start.ps1" in your terminal, when in the same folder as this file.

# 1. Set the temporary Path for Node.js
# This allows 'node' and 'npm' to work in this session
$NODE_PATH = "C:\Users\c563871\.node"
$env:Path = "$NODE_PATH;" + $env:Path

Write-Host "✅ Node.js path configured." -ForegroundColor Cyan

# 2. Activate the Python Virtual Environment
if (Test-Path ".\.venv\Scripts\Activate.ps1") {
    # Using 'dot sourcing' to keep the environment active in the current shell
    . .\.venv\Scripts\Activate.ps1
    Write-Host "✅ Python Virtual Environment activated." -ForegroundColor Green
} else {
    Write-Host "⚠️ Warning: Python .venv not found." -ForegroundColor Yellow
}

# 3. Final check of versions
$nodeVer = node -v
Write-Host "🚀 Ready to go! (Node: $nodeVer)" -ForegroundColor Magenta

$rootDir = $PSScriptRoot
if (-not $rootDir) { $rootDir = (Get-Location).Path }

# 4. Start the backend in a new window
Write-Host "Starting Backend in a new window..." -ForegroundColor Green
# Disable WebSocket authentication requirement for local development guest simulations
$env:WALFLOW_REQUIRE_WS_AUTH = "false"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir'; if (Test-Path '.\.venv\Scripts\Activate.ps1') { . .\.venv\Scripts\Activate.ps1 }; `$env:WALFLOW_REQUIRE_WS_AUTH='false'; Set-Location '$rootDir\backend'; python main.py"

# 5. Start the frontend in a new window
Write-Host "Starting Frontend in a new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir\frontend'; npm run dev"
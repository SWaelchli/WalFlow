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
Write-Host "---"
Write-Host "To start the frontend: cd frontend; npm run dev"
Write-Host "---"
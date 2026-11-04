# To start type ".\start.ps1" in your terminal, when in the same folder as this file.

# 1. Check or configure Node.js Path
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    if (Test-Path "$env:USERPROFILE\.node") {
        $env:Path = "$env:USERPROFILE\.node;" + $env:Path
    }
}

if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVer = node -v
    Write-Host "✅ Node.js detected ($nodeVer)." -ForegroundColor Cyan
} else {
    Write-Host "⚠️ Warning: Node.js not found in PATH." -ForegroundColor Yellow
}

# 2. Activate the Python Virtual Environment
if (Test-Path ".\.venv\Scripts\Activate.ps1") {
    # Using 'dot sourcing' to keep the environment active in the current shell
    . .\.venv\Scripts\Activate.ps1
    Write-Host "✅ Python Virtual Environment activated." -ForegroundColor Green
} else {
    Write-Host "⚠️ Warning: Python .venv not found." -ForegroundColor Yellow
}

$rootDir = $PSScriptRoot
if (-not $rootDir) { $rootDir = (Get-Location).Path }

# 3. Ensure Antigravity (.agents) bridges to .claude skills and agents
$agentsDir = Join-Path $rootDir ".agents"
$claudeDir = Join-Path $rootDir ".claude"

if (Test-Path $claudeDir) {
    if (-not (Test-Path $agentsDir)) {
        New-Item -ItemType Directory -Path $agentsDir -Force | Out-Null
    }

    # Ensure skills.json manifest exists for Antigravity engine discovery
    $skillsJson = Join-Path $agentsDir "skills.json"
    if (-not (Test-Path $skillsJson)) {
        Set-Content -Path $skillsJson -Value '{"entries":[{"path":".claude/skills"}]}'
    }

    $skillCount = (Get-ChildItem -Directory -Path (Join-Path $claudeDir "skills") -ErrorAction SilentlyContinue | Measure-Object).Count
    $agentCount = (Get-ChildItem -File -Path (Join-Path $claudeDir "agents") -Filter "*.md" -ErrorAction SilentlyContinue | Measure-Object).Count
    Write-Host "✅ Antigravity bridge active ($skillCount skills, $agentCount agents configured)." -ForegroundColor Green
}

# 4. Start the backend in a new window
Write-Host "Starting Backend in a new window..." -ForegroundColor Green
$env:WALFLOW_REQUIRE_WS_AUTH = "false"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir'; if (Test-Path '.\.venv\Scripts\Activate.ps1') { . .\.venv\Scripts\Activate.ps1 }; `$env:WALFLOW_REQUIRE_WS_AUTH='false'; uvicorn main:app --app-dir backend --reload --port 8000"

# 5. Start the frontend in a new window
Write-Host "Starting Frontend in a new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$rootDir\frontend'; npm run dev"

param(
  [switch]$Tests,
  [switch]$Release
)

$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$tauriDir = Join-Path $root "src-tauri"
$frontendDir = Join-Path $root "frontend"

function Step($name) {
  Write-Host "`n=== $name ===" -ForegroundColor Cyan
}

function Show-Versions {
  Step "versions"
  rustc --version
  cargo --version
  node --version
  npm --version
}

function Build-Frontend {
  Step "frontend build"
  Push-Location $frontendDir
  try {
    npm ci
    npm run build
  } finally {
    Pop-Location
  }
}

function Build-Rust {
  Step "rust build"
  Stop-Process -Name "lcars-shell" -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  $profile = if ($Release) { "--release" } else { "" }
  if ($profile) {
    cargo build --manifest-path "$tauriDir\Cargo.toml" --release --features custom-protocol
  } else {
    cargo build --manifest-path "$tauriDir\Cargo.toml"
  }
  cargo check --manifest-path "$tauriDir\Cargo.toml"
}

function Test-All {
  Step "tests"
  cargo test --manifest-path "$tauriDir\Cargo.toml"
  Push-Location $frontendDir
  try {
    npm test -- --watch=false --browsers=ChromeHeadless
  } finally {
    Pop-Location
  }
}

function Test-Cli {
  Step "cli smoke"
  $bin = if ($Release) {
    Join-Path $tauriDir "target\release\lcars-shell.exe"
  } else {
    Join-Path $tauriDir "target\debug\lcars-shell.exe"
  }
  if (-not (Test-Path $bin)) {
    throw "binary not found: $bin"
  }

  $args = @("hide", "show", "toggle", "alert --mode red", "notify --title LCARS --body pipeline", "info", "ping", "bogus")
  Start-Process -FilePath $bin -WindowStyle Hidden
  try {
    for ($i = 0; $i -lt 15; $i++) {
      Start-Sleep -Seconds 1
      $ready = & $bin status 2>$null
      if ($ready | Select-String '"ok": true') {
        break
      }
    }
    foreach ($a in $args) {
      $out = & $bin $a.Split(" ")
      if ($LASTEXITCODE -eq 2) {
        throw "cli '$a' could not reach the daemon"
      }
      if (-not ($out | Select-String '"ok": true')) {
        if ($a -eq "bogus") {
          Write-Host "cli '$a' correctly reported an error" -ForegroundColor Yellow
        } else {
          throw "cli '$a' failed: $out"
        }
      } else {
        Write-Host "cli '$a' ok" -ForegroundColor Green
      }
    }
  } finally {
    Stop-Process -Name "lcars-shell" -Force -ErrorAction SilentlyContinue
  }
}

Show-Versions
Build-Frontend
Build-Rust
if ($Tests) {
  Test-All
}
Test-Cli

Write-Host "`nPIPELINE OK" -ForegroundColor Green

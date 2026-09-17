# Enables the Windows features Docker Desktop needs on Windows 11 Home, then installs the WSL2
# kernel. Must run elevated. Safe to re-run: every step is idempotent.
#
#   Right-click > Run with PowerShell (as Administrator), or from an admin prompt:
#     powershell -ExecutionPolicy Bypass -File scripts\enable-docker-prereqs.ps1
#
# A reboot is required afterwards if either feature was newly enabled; the script says so.

$ErrorActionPreference = 'Stop'

# An elevated process gets a fresh console, so transcript to a known file for the caller to read.
$logPath = Join-Path $env:TEMP 'itmc-docker-prereqs.log'
try { Start-Transcript -Path $logPath -Force | Out-Null } catch { }

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
        ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error 'This script must be run as Administrator.'
    exit 1
}

$rebootNeeded = $false

foreach ($feature in 'VirtualMachinePlatform', 'Microsoft-Windows-Subsystem-Linux') {
    $state = (Get-WindowsOptionalFeature -Online -FeatureName $feature).State
    if ($state -eq 'Enabled') {
        Write-Host "[ok]   $feature already enabled"
    } else {
        Write-Host "[work] enabling $feature ..."
        $result = Enable-WindowsOptionalFeature -Online -FeatureName $feature -All -NoRestart
        if ($result.RestartNeeded) { $rebootNeeded = $true }
        Write-Host "[ok]   $feature enabled"
    }
}

Write-Host '[work] installing the WSL2 kernel (no Linux distribution needed; Docker ships its own) ...'
try {
    wsl.exe --install --no-distribution
    Write-Host '[ok]   WSL requested'
} catch {
    Write-Warning "wsl --install reported: $_"
    Write-Warning 'If this failed because the features were only just enabled, reboot and re-run this script.'
}

try { wsl.exe --set-default-version 2 } catch { }

Write-Host ''
if ($rebootNeeded) {
    Write-Host 'REBOOT REQUIRED. Restart Windows, then start Docker Desktop once and accept the licence.' -ForegroundColor Yellow
} else {
    Write-Host 'No reboot flagged. Start Docker Desktop once and accept the licence, then run: docker version' -ForegroundColor Green
}

try { Stop-Transcript | Out-Null } catch { }

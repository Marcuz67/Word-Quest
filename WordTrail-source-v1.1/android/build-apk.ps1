$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$apkPath = Join-Path $projectRoot "app\build\outputs\apk\debug\app-debug.apk"
$deliveryPath = Join-Path (Split-Path -Parent $projectRoot) "WordTrail.apk"

if (-not $env:ANDROID_HOME) {
    throw "Set ANDROID_HOME to your Android SDK folder before building."
}

Push-Location -LiteralPath $projectRoot
try {
    & (Join-Path $projectRoot "gradlew.bat") :app:assembleDebug
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle could not build the debug APK."
    }
} finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $apkPath)) {
    throw "The APK was not created at the expected output path."
}

Copy-Item -LiteralPath $apkPath -Destination $deliveryPath -Force
Write-Output "APK created at $deliveryPath"

param(
    [string]$OutputName = "",
    [int]$VersionCode = 13,
    [string]$VersionName = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AndroidDir = $PSScriptRoot
$StageRoot = Join-Path $env:TEMP "huaan-zhikong-apk"
$BuildDir = Join-Path $StageRoot "build"
$StageAndroidDir = Join-Path $StageRoot "android"
$OutputDir = Join-Path $ProjectRoot "outputs"
$PackageMetadata = Get-Content -LiteralPath (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json
if (-not $VersionName) { $VersionName = [string]$PackageMetadata.version }
if (-not $OutputName) { $OutputName = "HuaAnZhiKong-v$VersionName-debug.apk" }

function Find-ExistingPath([string[]]$Candidates) {
    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    return $null
}

$LocalSdk = $null
$LocalJava = $null
$LocalPropertiesPath = Join-Path $AndroidDir "local.properties"
if (Test-Path -LiteralPath $LocalPropertiesPath) {
    foreach ($line in Get-Content -LiteralPath $LocalPropertiesPath) {
        if ($line -match '^\s*sdk\.dir\s*=\s*(.+?)\s*$') { $LocalSdk = $Matches[1] }
        if ($line -match '^\s*java\.home\s*=\s*(.+?)\s*$') { $LocalJava = $Matches[1] }
    }
}

$SdkCandidates = @($env:ANDROID_SDK_ROOT, $env:ANDROID_HOME, $LocalSdk)
if ($env:LOCALAPPDATA) { $SdkCandidates += (Join-Path $env:LOCALAPPDATA "Android\Sdk") }
$SdkRoot = Find-ExistingPath $SdkCandidates
if (-not $SdkRoot) { throw "Android SDK not found. Set ANDROID_SDK_ROOT." }

$JavaCandidates = @($env:JAVA_HOME, $LocalJava)
if ($env:ProgramFiles) { $JavaCandidates += (Join-Path $env:ProgramFiles "Android\Android Studio\jbr") }
if ($env:LOCALAPPDATA) { $JavaCandidates += (Join-Path $env:LOCALAPPDATA "Programs\Android Studio\jbr") }
$JavaHome = Find-ExistingPath $JavaCandidates
if (-not $JavaHome) { throw "JDK not found. Set JAVA_HOME." }

$BuildToolsDir = Get-ChildItem -LiteralPath (Join-Path $SdkRoot "build-tools") -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "aapt2.exe") } |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1 -ExpandProperty FullName
$PlatformDir = Get-ChildItem -LiteralPath (Join-Path $SdkRoot "platforms") -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "android.jar") } |
    Sort-Object { [version]($_.Name -replace '^android-', '') } -Descending |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $BuildToolsDir -or -not $PlatformDir) { throw "Android SDK platform or build-tools are incomplete." }

$Aapt2 = Join-Path $BuildToolsDir "aapt2.exe"
$Aapt = Join-Path $BuildToolsDir "aapt.exe"
$D8 = Join-Path $BuildToolsDir "d8.bat"
$ZipAlign = Join-Path $BuildToolsDir "zipalign.exe"
$ApkSigner = Join-Path $BuildToolsDir "apksigner.bat"
$AndroidJar = Join-Path $PlatformDir "android.jar"
$Javac = Join-Path $JavaHome "bin\javac.exe"
$Keytool = Join-Path $JavaHome "bin\keytool.exe"

Push-Location $ProjectRoot
try {
    # Rebuild the packaged SQLite database from the checked-in source before
    # compiling the WebView bundle so Android cannot silently ship stale safety data.
    & npm.cmd run db:build
    if ($LASTEXITCODE -ne 0) { throw "Chemical database build failed." }
    & npm.cmd run build:android-web
    if ($LASTEXITCODE -ne 0) { throw "Mobile web build failed." }
} finally {
    Pop-Location
}

if (Test-Path -LiteralPath $StageRoot) {
    $ResolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path.TrimEnd('\')
    $ResolvedStage = (Resolve-Path -LiteralPath $StageRoot).Path
    if (-not $ResolvedStage.StartsWith($ResolvedTemp + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean staging directory outside TEMP: $ResolvedStage"
    }
    Remove-Item -LiteralPath $StageRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $StageAndroidDir | Out-Null
Copy-Item -LiteralPath (Join-Path $AndroidDir "AndroidManifest.xml") -Destination $StageAndroidDir
Copy-Item -LiteralPath (Join-Path $AndroidDir "res") -Destination $StageAndroidDir -Recurse
Copy-Item -LiteralPath (Join-Path $AndroidDir "src") -Destination $StageAndroidDir -Recurse

$ClassesDir = New-Item -ItemType Directory -Force -Path (Join-Path $BuildDir "classes")
$DexDir = New-Item -ItemType Directory -Force -Path (Join-Path $BuildDir "dex")
$GeneratedDir = New-Item -ItemType Directory -Force -Path (Join-Path $BuildDir "generated")
$AssetsRoot = New-Item -ItemType Directory -Force -Path (Join-Path $BuildDir "assets")
$AssetsDir = New-Item -ItemType Directory -Force -Path (Join-Path $AssetsRoot "www")
Copy-Item -Path (Join-Path $ProjectRoot "dist-android\*") -Destination $AssetsDir -Recurse -Force
$NativeAssetsDir = Join-Path $AndroidDir "assets"
if (Test-Path -LiteralPath $NativeAssetsDir) {
    Copy-Item -Path (Join-Path $NativeAssetsDir "*") -Destination $AssetsRoot -Recurse -Force
}

$CompiledResources = Join-Path $BuildDir "resources.zip"
& $Aapt2 compile --dir (Join-Path $StageAndroidDir "res") -o $CompiledResources
if ($LASTEXITCODE -ne 0) { throw "Android resource compilation failed." }

$UnsignedApk = Join-Path $BuildDir "unsigned.apk"
& $Aapt2 link -o $UnsignedApk --manifest (Join-Path $StageAndroidDir "AndroidManifest.xml") `
    -I $AndroidJar --java $GeneratedDir `
    --min-sdk-version 23 --target-sdk-version 36 --version-code $VersionCode --version-name $VersionName `
    --auto-add-overlay $CompiledResources
if ($LASTEXITCODE -ne 0) { throw "APK resource linking failed." }

# aapt2 on Windows preserves backslashes when recursively adding an asset
# directory. Add each file with an explicit URL-style path so WebView can find
# file:///android_asset/www/mobile/index.html and its relative resources.
Push-Location $BuildDir
try {
    $AssetFiles = Get-ChildItem -LiteralPath (Join-Path $BuildDir "assets") -Recurse -File
    foreach ($AssetFile in $AssetFiles) {
        $RelativeAssetPath = $AssetFile.FullName.Substring($BuildDir.Length + 1).Replace('\', '/')
        & $Aapt add -f $UnsignedApk $RelativeAssetPath
        if ($LASTEXITCODE -ne 0) { throw "Adding asset failed: $RelativeAssetPath" }
    }
} finally {
    Pop-Location
}

$JavaSources = @(
    (Join-Path $StageAndroidDir "src\com\huaan\zhikong\MainActivity.java"),
    (Join-Path $GeneratedDir "com\huaan\zhikong\R.java")
)
& $Javac -encoding UTF-8 --release 8 -classpath $AndroidJar -d $ClassesDir @JavaSources
if ($LASTEXITCODE -ne 0) { throw "Java compilation failed." }

$ClassFiles = Get-ChildItem -LiteralPath $ClassesDir -Recurse -Filter *.class | Select-Object -ExpandProperty FullName
& $D8 --lib $AndroidJar --min-api 23 --output $DexDir @ClassFiles
if ($LASTEXITCODE -ne 0) { throw "DEX compilation failed." }

Push-Location $DexDir
try {
    & $Aapt add -f $UnsignedApk "classes.dex"
    if ($LASTEXITCODE -ne 0) { throw "Adding classes.dex failed." }
} finally {
    Pop-Location
}

$AlignedApk = Join-Path $BuildDir "aligned.apk"
& $ZipAlign -f -p 4 $UnsignedApk $AlignedApk
if ($LASTEXITCODE -ne 0) { throw "APK alignment failed." }

$Keystore = Join-Path $StageRoot "debug.keystore"
$PersistentKeystore = Join-Path $AndroidDir "debug.keystore"
if (Test-Path -LiteralPath $PersistentKeystore) {
    Copy-Item -LiteralPath $PersistentKeystore -Destination $Keystore
} else {
    & $Keytool -genkeypair -v -keystore $Keystore -storepass android -alias androiddebugkey `
        -keypass android -keyalg RSA -keysize 2048 -validity 10000 `
        -dname "CN=Android Debug,O=Android,C=US"
    if ($LASTEXITCODE -ne 0) { throw "Debug keystore generation failed." }
    Copy-Item -LiteralPath $Keystore -Destination $PersistentKeystore
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$FinalApk = Join-Path $OutputDir $OutputName
$StagedFinalApk = Join-Path $StageRoot "signed.apk"
& $ApkSigner sign --ks $Keystore --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android `
    --out $StagedFinalApk $AlignedApk
if ($LASTEXITCODE -ne 0) { throw "APK signing failed." }

& $ApkSigner verify --verbose --print-certs $StagedFinalApk
if ($LASTEXITCODE -ne 0) { throw "APK signature verification failed." }
& $Aapt dump badging $StagedFinalApk | Select-Object -First 4
Copy-Item -LiteralPath $StagedFinalApk -Destination $FinalApk -Force

$Hash = Get-FileHash -LiteralPath $FinalApk -Algorithm SHA256
Write-Output "APK=$FinalApk"
Write-Output "SIZE=$((Get-Item -LiteralPath $FinalApk).Length)"
Write-Output "SHA256=$($Hash.Hash)"

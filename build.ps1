$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$setup = Join-Path $PSScriptRoot 'pulsesync-rollback\Yandex_Music_x64_5.127.0.exe'
$sig = Get-AuthenticodeSignature -LiteralPath $setup
if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch '^CN=YANDEX LLC,') { throw 'Official installer signature failed' }
node build-studio.cjs
if ($LASTEXITCODE) { throw 'Mod build failed' }
node build-launcher.cjs
if ($LASTEXITCODE) { throw 'Package build failed' }
$net = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$wpf = Join-Path $net 'WPF'
New-Item -Path bin -ItemType Directory -Force | Out-Null
& (Join-Path $net 'csc.exe') /nologo /target:winexe /platform:x64 /optimize+ /codepage:65001 /out:bin\Sonora-Launcher.exe "/reference:$wpf\PresentationFramework.dll" "/reference:$wpf\PresentationCore.dll" "/reference:$wpf\WindowsBase.dll" "/reference:$wpf\UIAutomationTypes.dll" /reference:System.Xaml.dll "/resource:$setup,music.setup" /resource:music.archive.gz,music.archive /resource:sonora.archive.gz,mod.archive SonoraLauncher.cs SonoraInstaller.cs SonoraPackage.cs
if ($LASTEXITCODE) { throw 'Launcher build failed' }

param([string]$Action)

$ErrorActionPreference = 'Stop'

function Send-VolumeKey([byte]$vk) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class WinVolKey {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
  # 0x0001 = KEYEVENTF_EXTENDEDKEY, 0x0002 = KEYEVENTF_KEYUP
  [WinVolKey]::keybd_event($vk, 0, 1, [UIntPtr]::Zero)
  [WinVolKey]::keybd_event($vk, 0, 3, [UIntPtr]::Zero)
}

if ($Action -eq 'volUp')   { Send-VolumeKey 0xAF; exit 0 }
if ($Action -eq 'volDown') { Send-VolumeKey 0xAE; exit 0 }
if ($Action -eq 'mute')    { Send-VolumeKey 0xAD; exit 0 }

# Para Play/Pause, Next y Prev usamos la sesión GSMTC directa (funciona incluso con juegos en pantalla completa)
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

  function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
  }

  [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
  $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  $s = if ($mgr) { $mgr.GetCurrentSession() } else { $null }

  if ($s) {
    if ($Action -eq 'playPause') { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]); exit 0 }
    if ($Action -eq 'next')      { $null = Await ($s.TrySkipNextAsync()) ([bool]); exit 0 }
    if ($Action -eq 'prev')      { $null = Await ($s.TrySkipPreviousAsync()) ([bool]); exit 0 }
  }
} catch {
  # Respaldo con teclas multimedia si GSMTC no respondió
}

if ($Action -eq 'playPause') { Send-VolumeKey 0xB3; exit 0 }
if ($Action -eq 'next')      { Send-VolumeKey 0xB0; exit 0 }
if ($Action -eq 'prev')      { Send-VolumeKey 0xB1; exit 0 }

param([string]$Action)

$ErrorActionPreference = 'Stop'

function Send-KeyChar([int]$code) {
  $ws = New-Object -ComObject WScript.Shell
  $ws.SendKeys([char]$code)
}

if ($Action -eq 'volUp')   { Send-KeyChar 175; exit 0 }
if ($Action -eq 'volDown') { Send-KeyChar 174; exit 0 }
if ($Action -eq 'mute')    { Send-KeyChar 173; exit 0 }

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

if ($Action -eq 'playPause') { Send-KeyChar 179; exit 0 }
if ($Action -eq 'next')      { Send-KeyChar 176; exit 0 }
if ($Action -eq 'prev')      { Send-KeyChar 177; exit 0 }

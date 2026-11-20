param([string]$Action)

$ErrorActionPreference = 'Stop'

function Invoke-CoreAudio([string]$Op) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr pNotify);
  int UnregisterControlChangeNotify(IntPtr pNotify);
  int GetChannelCount(out uint pnChannelCount);
  int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int GetMasterVolumeLevel(out float pfLevelDB);
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
  int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
  int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
  int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid iid, uint dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject { }

public static class CoreAudioVol {
  public static string Run(string op) {
    var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice device;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    object obj;
    Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out obj));
    var vol = (IAudioEndpointVolume)obj;

    float level;
    bool muted;
    Marshal.ThrowExceptionForHR(vol.GetMasterVolumeLevelScalar(out level));
    Marshal.ThrowExceptionForHR(vol.GetMute(out muted));

    if (op == "volUp") {
      level = Math.Min(1.0f, level + 0.05f);
      Marshal.ThrowExceptionForHR(vol.SetMute(false, Guid.Empty));
      Marshal.ThrowExceptionForHR(vol.SetMasterVolumeLevelScalar(level, Guid.Empty));
    } else if (op == "volDown") {
      level = Math.Max(0.0f, level - 0.05f);
      Marshal.ThrowExceptionForHR(vol.SetMasterVolumeLevelScalar(level, Guid.Empty));
    } else if (op == "mute") {
      muted = !muted;
      Marshal.ThrowExceptionForHR(vol.SetMute(muted, Guid.Empty));
    }

    Marshal.ThrowExceptionForHR(vol.GetMasterVolumeLevelScalar(out level));
    Marshal.ThrowExceptionForHR(vol.GetMute(out muted));
    return Math.Round(level * 100) + "%" + (muted ? " (muted)" : "");
  }
}
"@
  [CoreAudioVol]::Run($Op)
}

if ($Action -eq 'volUp' -or $Action -eq 'volDown' -or $Action -eq 'mute' -or $Action -eq 'volGet') {
  Invoke-CoreAudio $Action
  exit 0
}

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
  exit 1
}

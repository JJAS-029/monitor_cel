'use strict';
// Controles multimedia y de volumen en Windows usando SendInput / keybd_event nativo vía PowerShell (sin dependencias).

const { execFile } = require('child_process');

// Virtual-Key codes de Windows para teclas multimedia
const TECLAS = {
  playPause: 0xB3, // VK_MEDIA_PLAY_PAUSE
  next: 0xB0,      // VK_MEDIA_NEXT_TRACK
  prev: 0xB1,      // VK_MEDIA_PREV_TRACK
  volUp: 0xAF,     // VK_VOLUME_UP
  volDown: 0xAE,   // VK_VOLUME_DOWN
  mute: 0xAD,      // VK_VOLUME_MUTE
};

function enviarTecla(accion) {
  return new Promise((resolver) => {
    const vk = TECLAS[accion];
    if (!vk) return resolver({ ok: false, error: 'Acción desconocida' });
    if (process.platform !== 'win32') return resolver({ ok: false, error: 'Solo soportado en Windows' });

    const script = [
      'Add-Type -TypeDefinition @"',
      'using System.Runtime.InteropServices;',
      'public class MediaKey {',
      '  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, System.UIntPtr dwExtraInfo);',
      '}',
      '"@',
      `[MediaKey]::keybd_event(${vk}, 0, 0, [System.UIntPtr]::Zero)`,
      `[MediaKey]::keybd_event(${vk}, 0, 2, [System.UIntPtr]::Zero)`,
    ].join('\n');

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 5000, windowsHide: true },
      (err) => resolver({ ok: !err, error: err ? err.message : null })
    );
  });
}

module.exports = { enviarTecla, TECLAS };

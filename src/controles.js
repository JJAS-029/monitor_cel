'use strict';
// Controles multimedia y lectura de "Now Playing" (GSMTC) en Windows vía PowerShell (sin dependencias).

const path = require('path');
const { execFile } = require('child_process');

const MEDIA_SCRIPT = path.join(__dirname, 'media-info.ps1');

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

let leyendoMedia = false;
function leerMediaActual() {
  if (process.platform !== 'win32' || leyendoMedia) return Promise.resolve(undefined);
  leyendoMedia = true;
  return new Promise((resolver) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', MEDIA_SCRIPT],
      { timeout: 6000, windowsHide: true },
      (err, stdout) => {
        leyendoMedia = false;
        if (err || !stdout) return resolver(null);
        const txt = stdout.trim();
        if (!txt || txt === 'null') return resolver(null);
        try {
          const obj = JSON.parse(txt);
          if (!obj || (!obj.title && !obj.artist)) return resolver(null);
          resolver({
            titulo: String(obj.title || '').trim(),
            artista: String(obj.artist || '').trim(),
            album: String(obj.album || '').trim(),
            estado: String(obj.status || '').trim(), // Playing, Paused, etc.
            app: String(obj.app || '').replace(/\.exe$/i, '').split('!')[0],
          });
        } catch (e) {
          resolver(null);
        }
      }
    );
  });
}

module.exports = { enviarTecla, leerMediaActual, TECLAS };

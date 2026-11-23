'use strict';
// Controles multimedia (GSMTC + WScript.Shell) y lectura de "Now Playing" en Windows vía PowerShell.

const path = require('path');
const { execFile } = require('child_process');

const MEDIA_INFO_SCRIPT = path.join(__dirname, 'media-info.ps1');
const MEDIA_ACTION_SCRIPT = path.join(__dirname, 'media-action.ps1');

const ACCIONES = new Set(['playPause', 'next', 'prev', 'volUp', 'volDown', 'mute']);

function enviarTecla(accion) {
  return new Promise((resolver) => {
    if (!ACCIONES.has(accion)) return resolver({ ok: false, error: 'Acción desconocida' });
    if (process.platform !== 'win32') return resolver({ ok: false, error: 'Solo soportado en Windows' });

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', MEDIA_ACTION_SCRIPT, '-Action', accion],
      { timeout: 6000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return resolver({ ok: false, error: (stderr || err.message || '').trim() });
        resolver({ ok: true });
      }
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
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', MEDIA_INFO_SCRIPT],
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
            estado: String(obj.status || '').trim(),
            app: String(obj.app || '').replace(/\.exe$/i, '').split('!')[0],
          });
        } catch (e) {
          resolver(null);
        }
      }
    );
  });
}

function bloquearPC() {
  return new Promise((resolver) => {
    if (process.platform !== 'win32') return resolver({ ok: false, error: 'Solo soportado en Windows' });
    execFile(
      'rundll32.exe',
      ['user32.dll,LockWorkStation'],
      { timeout: 4000, windowsHide: true },
      (err) => resolver({ ok: !err, error: err ? err.message : null })
    );
  });
}

module.exports = { enviarTecla, leerMediaActual, bloquearPC };

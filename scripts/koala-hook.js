'use strict';
// Hook oficial de Antigravity para Koala Desk Monitor (y compatible con koala_monitor en VS Code).
// Uso: node scripts/koala-hook.js trabajando|descanso
// Escribe ~/.claude/koala-estado-antigravity.json (independiente de Claude Code) y refleja en
// ~/.claude/koala-estado.json solo si Claude Code no está activo, para no pisar su estado.

const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = path.join(os.homedir(), '.claude');
const RUTA_AGY = path.join(DIR, 'koala-estado-antigravity.json');
const RUTA_CLAUDE = path.join(DIR, 'koala-estado.json');
const TURNO_MAXIMO_MS = 15 * 60 * 1000;
const estado = process.argv[2] || 'trabajando';

function leerJson(ruta) {
  try { return JSON.parse(fs.readFileSync(ruta, 'utf8')) || {}; } catch (e) { return {}; }
}
function escribirAtomico(ruta, datos) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const tmp = `${ruta}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(datos));
  fs.renameSync(tmp, ruta);
}

try {
  const ahora = Date.now();
  const previo = leerJson(RUTA_AGY);
  const datos = {
    estado,
    ts: ahora,
    inicio: previo.inicio || null,
    fuente: 'antigravity',
  };

  if (estado === 'trabajando' && (!datos.inicio || previo.estado === 'descanso')) {
    datos.inicio = ahora;
  }
  if (estado === 'descanso' && previo.inicio) {
    datos.duracion = Math.max(0, ahora - previo.inicio);
  }

  escribirAtomico(RUTA_AGY, datos);

  // Reflejar a VS Code (koala-estado.json) solo si Claude Code no está trabajando activamente
  const claude = leerJson(RUTA_CLAUDE);
  const claudeActivo = claude.fuente !== 'antigravity' &&
    (claude.estado === 'trabajando' || claude.estado === 'necesita') &&
    (ahora - (claude.ts || 0) < TURNO_MAXIMO_MS);
  if (!claudeActivo) {
    escribirAtomico(RUTA_CLAUDE, datos);
  }
} catch (e) {
  // Nunca bloquear al agente
}

process.stdout.write('{}\n');
process.exit(0);

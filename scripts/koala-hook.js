'use strict';
// Hook oficial de Antigravity (y compatible con Claude Code) para Koala Desk Monitor.
// Uso: node scripts/koala-hook.js trabajando|descanso
// Escribe ~/.claude/koala-estado.json y siempre devuelve {} en stdout sin bloquear nunca al agente.

const fs = require('fs');
const os = require('os');
const path = require('path');

const RUTA = path.join(os.homedir(), '.claude', 'koala-estado.json');
const estado = process.argv[2] || 'trabajando';

function leerPrevio() {
  try {
    return JSON.parse(fs.readFileSync(RUTA, 'utf8')) || {};
  } catch (e) {
    return {};
  }
}

try {
  const ahora = Date.now();
  const previo = leerPrevio();
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

  fs.mkdirSync(path.dirname(RUTA), { recursive: true });
  const tmp = `${RUTA}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(datos));
  fs.renameSync(tmp, RUTA);
} catch (e) {
  // Nunca bloquear al agente
}

process.stdout.write('{}\n');
process.exit(0);

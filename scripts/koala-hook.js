'use strict';
// Hook oficial de Antigravity para Koala Desk Monitor (y compatible con koala_monitor en VS Code).
// Uso: node scripts/koala-hook.js trabajando|descanso
// Escribe solo ~/.claude/koala-estado-antigravity.json: el servidor y el koala de VS Code (desde la 1.9.0) lo leen
// directo. Ya no se copia a ~/.claude/koala-estado.json, que es de Claude Code (la copia le movía la hora de inicio).

const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = path.join(os.homedir(), '.claude');
const RUTA_AGY = path.join(DIR, 'koala-estado-antigravity.json');
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

} catch (e) {
  // Nunca bloquear al agente
}

process.stdout.write('{}\n');
process.exit(0);

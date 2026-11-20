'use strict';
// Instala el hook "koala-monitor" en ~/.gemini/config/hooks.json (global para Antigravity)
// haciendo respaldo previo y respetando cualquier otro hook existente.

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_DIR = path.join(os.homedir(), '.gemini', 'config');
const HOOKS_FILE = path.join(CONFIG_DIR, 'hooks.json');
const HOOK_SCRIPT = path.resolve(__dirname, 'koala-hook.js');

const cmdTrabajando = `node "${HOOK_SCRIPT}" trabajando`;
const cmdDescanso = `node "${HOOK_SCRIPT}" descanso`;

fs.mkdirSync(CONFIG_DIR, { recursive: true });

let hooks = {};
if (fs.existsSync(HOOKS_FILE)) {
  const raw = fs.readFileSync(HOOKS_FILE, 'utf8');
  fs.writeFileSync(`${HOOKS_FILE}.bak`, raw);
  try {
    hooks = JSON.parse(raw) || {};
  } catch (e) {
    console.error('Error: ~/.gemini/config/hooks.json tiene JSON inválido. Se guardó respaldo en hooks.json.bak');
    process.exit(1);
  }
}

hooks['koala-monitor'] = {
  enabled: true,
  PreInvocation: [
    { type: 'command', command: cmdTrabajando, timeout: 5 },
  ],
  PostToolUse: [
    {
      matcher: '*',
      hooks: [
        { type: 'command', command: cmdTrabajando, timeout: 5 },
      ],
    },
  ],
  Stop: [
    { type: 'command', command: cmdDescanso, timeout: 5 },
  ],
};

fs.writeFileSync(HOOKS_FILE, JSON.stringify(hooks, null, 2) + '\n');
console.log('[OK] Hook "koala-monitor" instalado en:', HOOKS_FILE);
console.log('     Script:', HOOK_SCRIPT);

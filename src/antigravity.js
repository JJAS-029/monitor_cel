'use strict';
// Monitor de cuotas de Antigravity usando exclusivamente el CLI oficial `agy`.
// Comando documentado: `agy -p /usage --output-format json`

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

function buscarBinarioAgy() {
  if (process.env.AGY_BIN && fs.existsSync(process.env.AGY_BIN)) return process.env.AGY_BIN;
  const candidatos = process.platform === 'win32'
    ? [
        path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'agy', 'bin', 'agy.exe'),
        path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'agy', 'agy.exe'),
        path.join(os.homedir(), '.local', 'bin', 'agy.exe'),
      ]
    : [
        path.join(os.homedir(), '.local', 'bin', 'agy'),
        '/usr/local/bin/agy',
        '/opt/homebrew/bin/agy',
      ];
  for (const c of candidatos) {
    if (fs.existsSync(c)) return c;
  }
  return 'agy'; // probar en PATH
}

function normalizarPorcentaje(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // Si viene como fracción 0..1 (ej. 0.72), escalar a 0..100
  if (n > 0 && n <= 1) return Math.round(n * 100);
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizarReinicio(v) {
  if (!v) return null;
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  const parsed = Date.parse(String(v));
  return Number.isFinite(parsed) ? parsed : String(v);
}

// Intenta extraer modelos/cuotas de cualquier estructura JSON o texto que devuelva `agy -p /usage`.
function parsearSalidaAgy(stdout) {
  const texto = String(stdout || '').trim();
  if (!texto) return { modelos: [], resumen: null, raw: '' };

  let json = null;
  try {
    json = JSON.parse(texto);
  } catch (e) {
    // A veces el CLI imprime líneas antes/después del JSON
    const m = texto.match(/\{[\s\S]*\}/);
    if (m) {
      try { json = JSON.parse(m[0]); } catch (_) { /* texto plano */ }
    }
  }

  const modelos = [];
  let plan = null;

  const extraerLista = (arr) => {
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const nombre = item.model || item.modelName || item.displayName || item.name || item.label || item.id || item.bucket;
      const restanteFrac = item.remainingFraction ?? item.remaining_fraction ?? item.remainingPct ?? item.remaining_pct ?? item.remainingPercent ?? item.remaining;
      const usadoFrac = item.usedFraction ?? item.used_fraction ?? item.usedPct ?? item.used_pct ?? item.utilization ?? item.usedPercent ?? item.used;

      let restantePct = normalizarPorcentaje(restanteFrac);
      let usadoPct = normalizarPorcentaje(usadoFrac);
      if (restantePct == null && usadoPct != null) restantePct = 100 - usadoPct;
      if (usadoPct == null && restantePct != null) usadoPct = 100 - restantePct;

      if (nombre && (restantePct != null || usadoPct != null)) {
        modelos.push({
          nombre: String(nombre),
          restantePct,
          usadoPct,
          reinicio: normalizarReinicio(item.resetTime || item.reset_time || item.resetsAt || item.resets_at || item.resetAt),
          estado: item.status || item.state || null,
        });
      }
    }
  };

  if (json && typeof json === 'object') {
    plan = json.plan || json.tier || json.planName || (json.account && json.account.plan) || null;

    // Formato oficial de `agy -p /usage --output-format json`: command.data.groups[].buckets[]
    const grupos = json.command && json.command.data && Array.isArray(json.command.data.groups)
      ? json.command.data.groups
      : (Array.isArray(json.groups) ? json.groups : null);

    if (grupos) {
      const etiquetaVentana = (w, nombreBucket) => {
        if (w === '5h') return '5 h';
        if (w === 'weekly') return 'Sem.';
        if (/5-?hour|five hour/i.test(nombreBucket || '')) return '5 h';
        if (/weekly/i.test(nombreBucket || '')) return 'Sem.';
        return w || nombreBucket || '';
      };
      const nombreCortoGrupo = (raw) => {
        const s = String(raw || 'Antigravity').replace(/\s+models$/i, '').trim();
        if (/claude\s+and\s+gpt/i.test(s)) return 'Claude y GPT';
        if (/gemini\s*4\s*argon/i.test(s)) return 'Argon';
        return s;
      };
      for (const g of grupos) {
        if (!g || !Array.isArray(g.buckets)) continue;
        const grupoNombre = nombreCortoGrupo(g.name);
        // Ordenar 5h primero y luego weekly para lectura rápida
        const ordenados = g.buckets.slice().sort((a, b) => (a.window === '5h' ? -1 : b.window === '5h' ? 1 : 0));
        for (const b of ordenados) {
          const rest = normalizarPorcentaje(b.remaining_fraction ?? b.remainingFraction);
          if (rest == null) continue;
          const vent = etiquetaVentana(b.window, b.name);
          modelos.push({
            nombre: vent ? `${grupoNombre} · ${vent}` : grupoNombre,
            grupo: g.name || grupoNombre,
            ventana: b.window || null,
            restantePct: rest,
            usadoPct: 100 - rest,
            reinicio: normalizarReinicio(b.reset_time || b.resetTime),
            estado: b.description || null,
          });
        }
      }
    }

    if (!modelos.length) {
      const posiblesArrays = [
        json.models, json.quotas, json.buckets, json.usage, json.limits,
        json.data && json.data.models, json.data && json.data.quotas,
        json.result && json.result.models, json.result && json.result.quotas,
      ].filter(Array.isArray);
      for (const arr of posiblesArrays) extraerLista(arr);
    }

    // Si `result` o `response` o `text` trae texto formateado con porcentajes
    const textoInterno = typeof json.response === 'string' ? json.response
      : typeof json.result === 'string' ? json.result
      : typeof json.text === 'string' ? json.text
      : typeof json.output === 'string' ? json.output
      : null;

    if (!modelos.length && textoInterno) {
      extraerDesdeTexto(textoInterno, modelos);
    }
  } else {
    extraerDesdeTexto(texto, modelos);
  }

  return {
    modelos,
    plan,
    raw: texto.slice(0, 4000),
  };
}

function extraerDesdeTexto(texto, salida) {
  const lineas = String(texto).split(/\r?\n/);
  for (const linea of lineas) {
    // Busca líneas tipo: "Gemini 2.5 Pro   82% remaining (resets in 3h 20m)" o "Claude Sonnet: 40% used"
    const m = /^\s*[-•*]?\s*([A-Za-z0-9 ._()/-]{3,42}?)\s*[:|–—\t ]+\s*(\d{1,3}(?:\.\d+)?)\s*%\s*(remaining|left|restante|disponible|used|usado|utilizado)?(.*)$/i.exec(linea);
    if (!m) continue;
    const nombre = m[1].trim();
    const val = Math.max(0, Math.min(100, Math.round(Number(m[2]))));
    const etiqueta = (m[3] || '').toLowerCase();
    const esUsado = etiqueta === 'used' || etiqueta === 'usado' || etiqueta === 'utilizado';
    const restantePct = esUsado ? 100 - val : val;
    const usadoPct = esUsado ? val : 100 - val;
    const extra = (m[4] || '').trim();
    const resetMatch = /(?:resets?|reinicia|en|in)\s+([^()|]+?)(?:\)|$)/i.exec(extra);
    salida.push({
      nombre,
      restantePct,
      usadoPct,
      reinicio: resetMatch ? resetMatch[1].trim() : null,
      estado: null,
    });
  }
}

function consultarAntigravity() {
  return new Promise((resolver) => {
    const bin = buscarBinarioAgy();
    execFile(
      bin,
      ['-p', '/usage', '--output-format', 'json'],
      { timeout: 20000, windowsHide: true, env: { ...process.env, NO_COLOR: '1' } },
      (err, stdout, stderr) => {
        if (err) {
          if (err.code === 'ENOENT') {
            return resolver({
              estado: 'no_instalado',
              error: 'CLI `agy` no encontrado',
              modelos: [],
              actualizado: Date.now(),
            });
          }
          const detalle = String(stderr || stdout || err.message || '').trim();
          const sinSesion = /login|sign in|auth|unauthenticated|credential/i.test(detalle);
          return resolver({
            estado: sinSesion ? 'sin_sesion' : 'error',
            error: sinSesion ? 'Inicia sesión en el CLI `agy` primero' : (detalle.slice(0, 180) || 'Error al consultar agy'),
            modelos: [],
            raw: detalle.slice(0, 1000),
            actualizado: Date.now(),
          });
        }
        const parsed = parsearSalidaAgy(stdout);
        resolver({
          estado: parsed.modelos.length ? 'ok' : 'sin_datos',
          plan: parsed.plan,
          modelos: parsed.modelos,
          raw: parsed.raw,
          error: parsed.modelos.length ? null : 'Respuesta recibida sin cuotas reconocidas (revisa /api/antigravity/raw)',
          actualizado: Date.now(),
        });
      }
    );
  });
}

module.exports = { consultarAntigravity, buscarBinarioAgy, parsearSalidaAgy };

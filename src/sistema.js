'use strict';
// Mediciones del sistema (CPU, RAM, discos, GPU NVIDIA via nvidia-smi), clima (Open-Meteo) y servicios HTTP.

const os = require('os');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { execFile } = require('child_process');

let cpuPrevio = null;
function usoCpu() {
  const t = os.cpus().reduce((a, c) => {
    const tot = Object.values(c.times).reduce((x, y) => x + y, 0);
    return { ocupado: a.ocupado + tot - c.times.idle, total: a.total + tot };
  }, { ocupado: 0, total: 0 });
  let pct = null;
  if (cpuPrevio && t.total > cpuPrevio.total) {
    pct = (100 * (t.ocupado - cpuPrevio.ocupado)) / (t.total - cpuPrevio.total);
  }
  cpuPrevio = t;
  return pct;
}

function memoria() {
  const total = os.totalmem();
  let libre = os.freemem();
  try {
    const m = /MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'));
    if (m) libre = Number(m[1]) * 1024;
  } catch (e) { /* Windows/macOS */ }
  return { total, usada: total - libre, pct: (100 * (total - libre)) / total };
}

async function disco(ruta) {
  if (!fs.promises.statfs) return null;
  try {
    const s = await fs.promises.statfs(ruta);
    const total = s.blocks * s.bsize;
    const libre = s.bavail * s.bsize;
    return { ruta, total, usada: total - libre, pct: (100 * (total - libre)) / total };
  } catch (e) {
    return null;
  }
}

function leerGpuNvidia() {
  return new Promise((resolver) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
      { timeout: 3000, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolver(null);
        const linea = stdout.trim().split(/\r?\n/)[0];
        if (!linea) return resolver(null);
        const partes = linea.split(',').map((s) => s.trim());
        if (partes.length < 5) return resolver(null);
        const uso = Number(partes[1]);
        const temp = Number(partes[2]);
        const vramUsada = Number(partes[3]);
        const vramTotal = Number(partes[4]);
        resolver({
          nombre: partes[0],
          uso: Number.isFinite(uso) ? Math.round(uso) : null,
          temperatura: Number.isFinite(temp) ? Math.round(temp) : null,
          vramUsada: Number.isFinite(vramUsada) ? Math.round(vramUsada) : null,
          vramTotal: Number.isFinite(vramTotal) ? Math.round(vramTotal) : null,
          vramPct: Number.isFinite(vramUsada) && vramTotal > 0 ? Math.round((100 * vramUsada) / vramTotal) : null,
        });
      }
    );
  });
}

let discosCache = [];
let discosTs = 0;

async function leerSistema() {
  const ahora = Date.now();
  if (ahora - discosTs > 60000 || !discosCache.length) {
    const rutas = process.platform === 'win32' ? ['C:\\'] : ['/', os.homedir()];
    const vistos = new Set();
    const lista = [];
    for (const r of rutas) {
      const d = await disco(r);
      if (!d) continue;
      const clave = `${d.total}:${d.usada}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      lista.push(d);
    }
    discosCache = lista;
    discosTs = ahora;
  }
  const gpu = await leerGpuNvidia();
  return {
    host: os.hostname(),
    cpu: usoCpu(),
    nucleos: os.cpus().length,
    carga: os.loadavg()[0],
    memoria: memoria(),
    discos: discosCache,
    encendido: os.uptime(),
    temperatura: gpu ? gpu.temperatura : null,
    gpu,
  };
}

// ---------- Clima (Open-Meteo) ----------
let lugarClima = null;
function pedirJson(url) {
  return new Promise((resolver) => {
    const req = https.get(url, { timeout: 8000, headers: { 'User-Agent': 'koala-desk-monitor' } }, (res) => {
      let txt = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { if (txt.length < 100000) txt += d; });
      res.on('end', () => { try { resolver(res.statusCode === 200 ? JSON.parse(txt) : null); } catch (e) { resolver(null); } });
    });
    req.on('timeout', () => { req.destroy(); resolver(null); });
    req.on('error', () => resolver(null));
  });
}

async function buscarCiudades(texto, lang = 'es') {
  const g = await pedirJson(`https://geocoding-api.open-meteo.com/v1/search?count=8&language=${lang}&name=${encodeURIComponent(String(texto).trim())}`);
  return ((g && g.results) || []).map((r) => ({
    nombre: r.name,
    region: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

async function clima(lugar) {
  if (lugar && typeof lugar === 'object' && Number.isFinite(lugar.lat)) {
    lugarClima = { ciudad: `${lugar.lat},${lugar.lon}`, lat: lugar.lat, lon: lugar.lon, nombre: lugar.nombre };
    lugar = lugarClima.ciudad;
  }
  const ciudad = String(lugar || '').trim();
  if (!ciudad) return null;
  if (!lugarClima || lugarClima.ciudad !== ciudad) {
    const [nombre, ...resto] = ciudad.split(',').map((t) => t.trim()).filter(Boolean);
    const region = resto.join(' ').toLowerCase();
    let opciones = await buscarCiudades(nombre);
    if (!opciones.length) return { error: `No encontré "${nombre}"`, reintentar: true };
    const r = (region && opciones.find((o) => region.includes((o.region.split(',')[0] || '').toLowerCase()))) || opciones[0];
    lugarClima = { ciudad, lat: r.lat, lon: r.lon, nombre: r.nombre };
  }
  const d = await pedirJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${lugarClima.lat}&longitude=${lugarClima.lon}` +
    '&current=temperature_2m,weather_code,is_day,precipitation&timezone=auto'
  );
  if (!d || !d.current) return { error: 'Sin respuesta del clima', nombre: lugarClima.nombre, reintentar: true };
  const c = d.current.weather_code;
  const tipo = c >= 95 ? 'tormenta' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'nieve'
    : (c >= 51 && c <= 67) || (c >= 80 && c <= 82) ? 'lluvia' : c >= 45 && c <= 48 ? 'niebla' : c >= 2 ? 'nublado' : 'despejado';
  return { nombre: lugarClima.nombre, temp: Math.round(d.current.temperature_2m), tipo, codigo: c, ts: Date.now() };
}

// ---------- Servicios HTTP ----------
function sondear(url, ms) {
  return new Promise((resolver) => {
    const inicio = Date.now();
    let mod;
    try { mod = new URL(url).protocol === 'https:' ? https : http; } catch (e) { return resolver({ ok: false, detalle: 'URL inválida' }); }
    const req = mod.get(url, { timeout: ms, rejectUnauthorized: false }, (res) => {
      res.resume();
      const ok = res.statusCode < 500;
      resolver({ ok, codigo: res.statusCode, ms: Date.now() - inicio, detalle: ok ? `${res.statusCode}` : `error ${res.statusCode}` });
    });
    req.on('timeout', () => { req.destroy(); resolver({ ok: false, detalle: 'no responde' }); });
    req.on('error', (e) => resolver({ ok: false, detalle: e.code === 'ECONNREFUSED' ? 'apagado' : (e.code || 'error') }));
  });
}

async function revisarServicios(lista) {
  return Promise.all((lista || []).filter((s) => s && s.url).map(async (s) => ({
    nombre: s.nombre || s.url,
    url: s.url,
    ...(await sondear(s.url, 5000)),
  })));
}

module.exports = { leerSistema, buscarCiudades, clima, revisarServicios };

'use strict';
// Koala Desk Monitor — Servidor local para celular Android (Moto G06)
// Corre independiente de VS Code y sincroniza estado con ~/.claude/koala/compartido.json

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { crearCompartido, crearLider } = require('./koala-core/compartido');
const { crearConsumo, ventanaVigente, HORA } = require('./koala-core/consumo');
const anthropic = require('./koala-core/anthropic');
const { crearPomodoro } = require('./koala-core/pomodoro');
const { crearAlarmas } = require('./koala-core/alarmas');
const { crearRutina } = require('./koala-core/rutina');
const idioma = require('./koala-core/idioma');
const sistemaMod = require('./sistema');
const antigravityMod = require('./antigravity');
const controlesMod = require('./controles');

const PORT = Number(process.env.PORT || 4747);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const CONFIG_LOCAL_PATH = path.join(__dirname, '..', 'config.json');

const DIR_CLAUDE = path.join(os.homedir(), '.claude');
const RUTA_ESTADO_CLAUDE = path.join(DIR_CLAUDE, 'koala-estado.json');
const RUTA_USO = path.join(DIR_CLAUDE, 'koala-uso.json');
const DIR_PROYECTOS = path.join(DIR_CLAUDE, 'projects');
const RUTA_COMPARTIDO = path.join(DIR_CLAUDE, 'koala', 'compartido.json');
const RUTA_LIDER = path.join(DIR_CLAUDE, 'koala', 'lider.json');
const TURNO_MAXIMO_MS = 15 * 60 * 1000;

const CLAVE_ESTADO = 'koala.estado';
const CLAVES_RUTINA = ['koala.dia', 'koala.logros', 'koala.contadores', 'koala.ultimoError'];
const CLAVES_COMPARTIDAS = [
  CLAVE_ESTADO, 'koala.pomodoro', 'koala.alarmas', 'koala.carruseles', 'koala.lugarClima',
  'koala.ajustes', 'koala.monitorAceptado', ...CLAVES_RUTINA,
];

// ---------- Configuración local persistente ----------
const CONFIG_DEFECTO = {
  idioma: 'es',
  avisarEnPorcentaje: 90,
  usoDesdeAnthropic: false,
  minutosEntreConsultas: 5,
  minutosEntreConsultasAgy: 5,
  aguaMlPorWh: 2,
  costoPlanMensualUSD: 0,
  temporada: 'auto',
  cumpleanos: '',
  'clima.ciudad': '',
  metaAgua: 8,
  minutosParaSiesta: 20,
  minutosParaTreparse: 120,
  minutosPausaActiva: 90,
  visitantes: true,
  sonidos: true,
  'pomodoro.minutosEnfoque': 25,
  'pomodoro.minutosDescanso': 5,
  'pomodoro.minutosDescansoLargo': 15,
  'pomodoro.antesDeDescansoLargo': 4,
  servicios: [],
};

let cfgLocal = { ...CONFIG_DEFECTO };
function cargarConfigLocal() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_LOCAL_PATH, 'utf8'));
    cfgLocal = { ...CONFIG_DEFECTO, ...raw };
  } catch (e) { /* primera vez */ }
}
function guardarConfigLocal() {
  try { fs.writeFileSync(CONFIG_LOCAL_PATH, JSON.stringify(cfgLocal, null, 2)); } catch (e) { /* */ }
}
cargarConfigLocal();

let compartido = null;
const config = () => ({
  get: (k, d) => {
    const compAj = compartido ? (compartido.get('koala.ajustes') || {}) : {};
    if (k in cfgLocal && cfgLocal[k] !== CONFIG_DEFECTO[k]) return cfgLocal[k];
    if (k in compAj) return compAj[k];
    return k in cfgLocal ? cfgLocal[k] : d;
  },
});

idioma.configurarIdioma(config().get('idioma', 'es'), 'es');

// ---------- GlobalState en memoria + compartido.json ----------
const mem = new Map();
const globalStateBase = {
  get: (k, d) => (mem.has(k) ? mem.get(k) : d),
  update: async (k, v) => { if (v === undefined) mem.delete(k); else mem.set(k, v); },
  keys: () => [...mem.keys()],
  setKeysForSync() {},
};

const clientesSSE = new Set();
function emitir(payload) {
  const linea = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clientesSSE) {
    try { res.write(linea); } catch (e) { clientesSSE.delete(res); }
  }
}
function animar(accion, datos) {
  emitir({ tipo: 'accion', accion, datos });
}
function notificar(texto) {
  emitir({ tipo: 'notificacion', texto, ts: Date.now() });
}

compartido = crearCompartido({
  ruta: RUTA_COMPARTIDO,
  globalState: globalStateBase,
  claves: CLAVES_COMPARTIDAS,
  alCambiar(claves) {
    if (claves.includes(CLAVE_ESTADO)) recargarEstado();
    if (claves.includes('koala.pomodoro') && pomodoro) pomodoro.recargar();
    if (claves.includes('koala.alarmas') && alarmas) alarmas.recargar();
    if (claves.some((k) => CLAVES_RUTINA.includes(k)) && rutina) rutina.recargar();
    if (claves.includes('koala.lugarClima')) medirClima().then(enviarEstado);
    enviarEstado();
  },
});

// En el servidor de escritorio nunca robamos liderazgo a VS Code si VS Code está abierto y enfocado,
// pero si VS Code está cerrado (>12 s sin latido) asumimos el liderazgo automáticamente.
const lider = crearLider({
  ruta: RUTA_LIDER,
  id: `desk-${process.pid}`,
  enfocado: () => false,
});

const contexto = { globalState: compartido };

// ---------- Estado del Koala ----------
const limitar = (v) => Math.max(0, Math.min(100, v));
let necesidades = { saciedad: 80, animo: 80, energia: 80 };
let durmiendo = false;
let ultimoTick = Date.now();
let claudeTrabajando = false;
let claudeNecesita = null;
let ultimoTsClaude = 0;
let temporizadorClaude = null;

let usoOficial = null;
let usoApi = null;
let estadoApi = { activo: false, error: null, ultima: null };
let proximaConsultaApi = 0;

let antigravityData = { estado: 'cargando', modelos: [], error: null, actualizado: null };
let proximaConsultaAgy = 0;

let sistema = null;
let servicios = [];
let serviciosCaidos = new Set();
let climaActual = null;
const inicioServidor = Date.now();

const consumo = crearConsumo({
  dirProyectos: DIR_PROYECTOS,
  oficial: () => oficial(),
  alActualizar: () => actualizarConsumo(),
});

function oficial() {
  const base = usoOficial || {};
  if (usoApi && (!base.actualizado || usoApi.actualizado >= base.actualizado)) {
    return { ...base, five_hour: usoApi.five_hour, seven_day: usoApi.seven_day, actualizado: usoApi.actualizado, fuente: 'anthropic' };
  }
  return base.actualizado ? { ...base, fuente: 'statusline' } : base;
}

function energiaDeSesion() {
  const v = ventanaVigente(oficial().five_hour);
  if (!v) return null;
  return v.reiniciada ? 100 : limitar(100 - v.pct);
}
function sincronizarEnergia() {
  const e = energiaDeSesion();
  if (e === null) return false;
  necesidades.energia = e;
  return true;
}

function cargarEstado() {
  const g = contexto.globalState.get(CLAVE_ESTADO);
  if (g) {
    necesidades = Object.assign(necesidades, g.necesidades || {});
    durmiendo = !!g.durmiendo;
  }
  ultimoTick = Date.now();
}
function recargarEstado() {
  const g = contexto.globalState.get(CLAVE_ESTADO);
  if (!g) return;
  necesidades = Object.assign(necesidades, g.necesidades || {});
  durmiendo = !!g.durmiendo;
  ultimoTick = g.ts || Date.now();
}
function guardarEstado() {
  contexto.globalState.update(CLAVE_ESTADO, { necesidades, durmiendo, ts: Date.now() });
}

function tick() {
  if (!lider.esLider()) { enviarEstado(); return; }
  const ahora = Date.now();
  const horas = (ahora - ultimoTick) / HORA;
  ultimoTick = ahora;
  necesidades.saciedad = limitar(necesidades.saciedad - 10 * horas);
  const hambre = necesidades.saciedad < 30;
  necesidades.animo = limitar(necesidades.animo - (hambre ? 10 : 7) * horas);
  if (!sincronizarEnergia()) {
    if (durmiendo) necesidades.energia = limitar(necesidades.energia + 600 * horas);
    else necesidades.energia = limitar(necesidades.energia - (claudeTrabajando ? 12 : 6) * horas);
  }
  const ligada = energiaDeSesion() !== null;
  const despierta = ligada
    ? necesidades.energia >= 60 || claudeTrabajando || pomodoro.fase() === 'enfoque'
    : necesidades.energia >= 100 || (claudeTrabajando && necesidades.energia >= 50);
  if (durmiendo && despierta) durmiendo = false;
  else if (!durmiendo && necesidades.energia < 22 && !claudeTrabajando && !pomodoro.fase()) durmiendo = true;
  guardarEstado();
  enviarEstado();
}

// ---------- Pomodoro, Alarmas y Rutina ----------
function minutosDe(fase) {
  const c = config();
  if (fase === 'enfoque') return c.get('pomodoro.minutosEnfoque', 25);
  if (fase === 'descansoLargo') return c.get('pomodoro.minutosDescansoLargo', 15);
  return c.get('pomodoro.minutosDescanso', 5);
}

const pomodoro = crearPomodoro({
  contexto,
  minutos: minutosDe,
  antesDeLargo: () => config().get('pomodoro.antesDeDescansoLargo', 4),
  alCambiar: () => enviarEstado(),
  alTerminarEnfoque: (hoy, descanso) => {
    rutina.alPomodoro(hoy);
    necesidades.animo = limitar(necesidades.animo + 10);
    guardarEstado();
    animar('festejarPomodoro');
    notificar(`🧪 ¡Experimento terminado! Llevas ${hoy} hoy. Descansa ${descanso} min.`);
  },
  alTerminarDescanso: () => {
    notificar('☕ Se acabó el descanso. ¿Otro experimento?');
  },
});

const alarmas = crearAlarmas({
  contexto,
  alSonar: (a) => {
    animar('alarma', { hora: a.hora, mensaje: a.mensaje });
    notificar(`⏰ ${a.hora} — ${a.mensaje}`);
    enviarEstado();
  },
});

const rutina = crearRutina({
  contexto,
  animar,
  notificar,
  config,
});

// ---------- Lectura de Claude Code ----------
function leerEstadoClaude() {
  let datos = null;
  try { datos = JSON.parse(fs.readFileSync(RUTA_ESTADO_CLAUDE, 'utf8')); } catch (e) { return; }
  const nuevo = datos.ts && datos.ts !== ultimoTsClaude;
  const primera = ultimoTsClaude === 0;
  ultimoTsClaude = datos.ts || ultimoTsClaude;
  const fresco = Date.now() - (datos.ts || 0) < TURNO_MAXIMO_MS;

  const necesita = datos.estado === 'necesita' && fresco ? { mensaje: datos.mensaje || '', ts: datos.ts } : null;
  if (necesita && nuevo && !primera) {
    animar('pedirAtencion', necesita);
    notificar(`🐨✋ Claude te necesita${necesita.mensaje ? ': ' + necesita.mensaje : ''}`);
  }
  if (!!necesita !== !!claudeNecesita) { claudeNecesita = necesita; enviarEstado(); }

  clearTimeout(temporizadorClaude);
  const vigente = (datos.estado === 'trabajando' || datos.estado === 'necesita') && fresco;
  if (vigente) {
    temporizadorClaude = setTimeout(() => { claudeTrabajando = false; enviarEstado(); }, TURNO_MAXIMO_MS - (Date.now() - datos.ts));
  }
  if (vigente !== claudeTrabajando) { claudeTrabajando = vigente; enviarEstado(); }
}

function leerUsoOficial() {
  try { usoOficial = JSON.parse(fs.readFileSync(RUTA_USO, 'utf8')); } catch (e) { usoOficial = null; }
  actualizarConsumo();
}

function datosSesion() {
  const s = usoOficial && usoOficial.sesion;
  if (!s || !s.ts || Date.now() - s.ts * 1000 > 6 * HORA) return null;
  return { ...s, ts: s.ts * 1000 };
}

function resumenUso() {
  const of = oficial();
  return {
    cinco: ventanaVigente(of.five_hour),
    semana: ventanaVigente(of.seven_day),
    modelo: of.model || '',
    actualizado: of.actualizado ? of.actualizado * 1000 : null,
    local: consumo.usoLocal(),
    ritmo: consumo.calcularRitmo(ventanaVigente(of.five_hour)),
    sesion: datosSesion(),
    fuente: of.fuente || null,
    extras: usoApi && of.fuente === 'anthropic' ? usoApi.extras : [],
    api: estadoApi,
  };
}

function actualizarConsumo() {
  consumo.calcularUsoLocal();
  sincronizarEnergia();
  enviarEstado();
}

async function consultarAnthropic(forzar) {
  estadoApi.activo = !!config().get('usoDesdeAnthropic', false);
  if (!estadoApi.activo) return;
  if (!forzar && Date.now() < proximaConsultaApi) return;
  proximaConsultaApi = Date.now() + Math.max(2, config().get('minutosEntreConsultas', 5)) * 60000;
  const r = await anthropic.consultarUso(DIR_CLAUDE);
  if (r.uso) {
    usoApi = r.uso;
    estadoApi.error = null;
    estadoApi.ultima = Date.now();
  } else {
    estadoApi.error = r.error;
    if (r.esperarMin) proximaConsultaApi = Date.now() + r.esperarMin * 60000;
  }
  actualizarConsumo();
}

// ---------- Consulta de Antigravity (CLI oficial `agy`) ----------
let consultandoAgy = false;
async function consultarAntigravity(forzar) {
  if (consultandoAgy) return;
  if (!forzar && Date.now() < proximaConsultaAgy) return;
  consultandoAgy = true;
  proximaConsultaAgy = Date.now() + Math.max(2, config().get('minutosEntreConsultasAgy', 5)) * 60000;
  try {
    antigravityData = await antigravityMod.consultarAntigravity();
  } finally {
    consultandoAgy = false;
  }
  enviarEstado();
}

// ---------- Sistema, Clima y Servicios ----------
async function medirSistema() {
  sistema = await sistemaMod.leerSistema();
  enviarEstado();
}

async function medirServicios() {
  servicios = await sistemaMod.revisarServicios(config().get('servicios', []));
  const caidos = new Set(servicios.filter((s) => !s.ok).map((s) => s.url));
  for (const s of servicios) {
    if (!s.ok && !serviciosCaidos.has(s.url)) {
      notificar(`🚨 ${s.nombre} no responde (${s.detalle})`);
      animar('servicioCaido', { nombre: s.nombre, detalle: s.detalle });
    }
    if (s.ok && serviciosCaidos.has(s.url)) {
      notificar(`✅ ${s.nombre} volvió a responder`);
      animar('servicioVuelve', { nombre: s.nombre });
    }
  }
  serviciosCaidos = caidos;
  enviarEstado();
}

async function medirClima() {
  const ciudad = String(config().get('clima.ciudad', '') || '').trim();
  const elegido = contexto.globalState.get('koala.lugarClima');
  if (!ciudad && !elegido) { climaActual = null; return; }
  climaActual = await sistemaMod.clima(elegido && (!ciudad || elegido.etiqueta === ciudad) ? elegido : ciudad);
}

// ---------- Temporada ----------
function temporada() {
  const t = config().get('temporada', 'auto');
  if (t !== 'auto') return t;
  const d = new Date();
  const mes = d.getMonth() + 1, dia = d.getDate();
  const diaDelAnio = Math.round((new Date(d.getFullYear(), mes - 1, dia) - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const cumple = /^(\d{1,2})[/-](\d{1,2})$/.exec(String(config().get('cumpleanos', '')).trim());
  if (cumple && Number(cumple[1]) === dia && Number(cumple[2]) === mes) return 'cumple';
  if ((mes === 12 && dia === 31) || (mes === 1 && dia === 1)) return 'anionuevo';
  if (mes === 1 && dia === 6) return 'reyes';
  if (mes === 2 && dia === 2) return 'marmota';
  if (mes === 2 && dia === 14) return 'sanvalentin';
  if (mes === 3 && dia === 14) return 'pi';
  if (mes === 3 && (dia === 20 || dia === 21)) return 'primavera';
  if (mes === 4 && dia === 30) return 'nino';
  if (mes === 5 && dia === 10) return 'madres';
  if (diaDelAnio === 256) return 'programador';
  if (mes === 10 && dia === 12) return 'pluricultural';
  if ((mes === 10 && dia >= 28) || (mes === 11 && dia <= 2)) return 'muertos';
  if (mes === 12 || (mes === 1 && dia <= 6)) return 'navidad';
  if (mes === 9 && dia >= 13 && dia <= 16) return 'patrias';
  return 'ninguna';
}

function calcularAlertas(u) {
  const a = [];
  const umbral = config().get('avisarEnPorcentaje', 90);
  const max = Math.max(u.cinco && !u.cinco.reiniciada ? u.cinco.pct : 0, u.semana && !u.semana.reiniciada ? u.semana.pct : 0);
  if (max >= umbral) a.push({ nivel: 3, texto: `¡Claude Code al ${Math.round(max)} %!` });
  for (const m of antigravityData.modelos || []) {
    if (m.restantePct != null && m.restantePct <= 15) {
      a.push({ nivel: 3, texto: `Antigravity ${m.nombre}: solo ${m.restantePct} % restante` });
    }
  }
  for (const s of servicios) if (!s.ok) a.push({ nivel: 3, texto: `${s.nombre} no responde (${s.detalle})` });
  if (sistema) {
    if (sistema.gpu && sistema.gpu.temperatura >= 83) a.push({ nivel: 3, texto: `GPU a ${sistema.gpu.temperatura} °C` });
    if (sistema.memoria && sistema.memoria.pct >= 90) a.push({ nivel: 2, texto: `RAM al ${Math.round(sistema.memoria.pct)} %` });
  }
  return a.sort((x, y) => y.nivel - x.nivel);
}

function construirEstado() {
  const uso = resumenUso();
  return {
    tipo: 'estado',
    necesidades,
    durmiendo,
    trabajando: claudeTrabajando,
    claude: claudeTrabajando,
    uso,
    antigravity: {
      estado: antigravityData.estado,
      plan: antigravityData.plan || null,
      modelos: antigravityData.modelos || [],
      error: antigravityData.error || null,
      actualizado: antigravityData.actualizado || null,
    },
    umbral: config().get('avisarEnPorcentaje', 90),
    energiaLigada: energiaDeSesion() !== null,
    pomodoro: pomodoro.estado(),
    hoy: consumo.resumenHoy(),
    sistema,
    servicios,
    alertas: calcularAlertas(uso),
    costos: consumo.resumenCostos({
      aguaMlPorWh: config().get('aguaMlPorWh', 2),
      planUsd: config().get('costoPlanMensualUSD', 0),
    }),
    claudeNecesita,
    inactivoMin: claudeTrabajando ? 0 : Math.floor((Date.now() - inicioServidor) / 60000),
    minutosSiesta: config().get('minutosParaSiesta', 20),
    minutosTreparse: config().get('minutosParaTreparse', 120),
    temporada: temporada(),
    clima: climaActual,
    rutina: rutina.estado(),
    alarmas: alarmas.lista(),
    sonidos: config().get('sonidos', true),
    visitantes: config().get('visitantes', true),
    lider: lider.esLider(),
  };
}

function enviarEstado() {
  if (!clientesSSE.size) return;
  emitir(construirEstado());
}

// ---------- Acciones desde el celular ----------
const EFECTOS = { comer: ['saciedad', 35], jugar: ['animo', 25], mimar: ['animo', 10] };

async function manejarMensaje(msg) {
  if (!msg || typeof msg !== 'object') return { ok: true };
  if (msg.tipo === 'accion') {
    if (msg.accion === 'dormir') {
      durmiendo = !durmiendo;
      guardarEstado();
      enviarEstado();
    } else {
      if (durmiendo && msg.accion !== 'mimar') { durmiendo = false; guardarEstado(); }
      enviarEstado();
      animar(msg.accion);
    }
  } else if (msg.tipo === 'efecto') {
    const ef = EFECTOS[msg.accion];
    if (ef) {
      necesidades[ef[0]] = limitar(necesidades[ef[0]] + ef[1]);
      guardarEstado();
      enviarEstado();
    }
  } else if (msg.tipo === 'pomodoro') {
    if (msg.op === 'detener') pomodoro.detener();
    else pomodoro.alternar();
  } else if (msg.tipo === 'agua') {
    rutina.agua();
    enviarEstado();
  } else if (msg.tipo === 'visita') {
    rutina.alVisita();
  } else if (msg.tipo === 'crearAlarma') {
    try { alarmas.crear(msg); } catch (e) { return { ok: false, error: e.message }; }
    enviarEstado();
  } else if (msg.tipo === 'alternarAlarma') {
    alarmas.alternar(msg.id);
    enviarEstado();
  } else if (msg.tipo === 'borrarAlarma') {
    alarmas.borrar(msg.id);
    enviarEstado();
  } else if (msg.tipo === 'consultarApi') {
    consultarAnthropic(true);
  } else if (msg.tipo === 'activarApi') {
    cfgLocal.usoDesdeAnthropic = !cfgLocal.usoDesdeAnthropic;
    guardarConfigLocal();
    if (cfgLocal.usoDesdeAnthropic) consultarAnthropic(true);
    else { estadoApi.activo = false; enviarEstado(); }
  } else if (msg.tipo === 'consultarAntigravity') {
    consultarAntigravity(true);
  } else if (msg.tipo === 'media') {
    return controlesMod.enviarTecla(msg.accion);
  } else if (msg.tipo === 'setCiudad') {
    cfgLocal['clima.ciudad'] = String(msg.ciudad || '').trim();
    guardarConfigLocal();
    await medirClima();
    enviarEstado();
  } else if (msg.tipo === 'agregarServicio' && msg.url) {
    const lista = (config().get('servicios', []) || []).filter((s) => s.url !== msg.url);
    lista.push({ nombre: msg.nombre || msg.url, url: msg.url });
    cfgLocal.servicios = lista;
    guardarConfigLocal();
    await medirServicios();
  } else if (msg.tipo === 'quitarServicio' && msg.url) {
    cfgLocal.servicios = (config().get('servicios', []) || []).filter((s) => s.url !== msg.url);
    guardarConfigLocal();
    await medirServicios();
  }
  return { ok: true };
}

// ---------- Servidor HTTP + SSE ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function leerCuerpo(req) {
  return new Promise((resolver) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { if (data.length < 64000) data += c; });
    req.on('end', () => {
      try { resolver(data ? JSON.parse(data) : {}); } catch (e) { resolver({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const ruta = urlObj.pathname;

  if (ruta === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify(construirEstado())}\n\n`);
    clientesSSE.add(res);
    req.on('close', () => clientesSSE.delete(res));
    return;
  }

  if (ruta === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(construirEstado()));
    return;
  }

  if (ruta === '/api/antigravity/raw' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(antigravityData, null, 2));
    return;
  }

  if (ruta === '/api/action' && req.method === 'POST') {
    const body = await leerCuerpo(req);
    const out = await manejarMensaje(body);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(out));
    return;
  }

  // Archivos estáticos en public/
  const archivo = ruta === '/' ? 'index.html' : ruta.replace(/^\/+/, '');
  const full = path.normalize(path.join(PUBLIC_DIR, archivo));
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const ext = path.extname(full).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
});

function obtenerIpsLocales() {
  const res = [];
  const ifaces = os.networkInterfaces();
  for (const lista of Object.values(ifaces)) {
    for (const i of lista || []) {
      if (i.family === 'IPv4' && !i.internal) res.push(i.address);
    }
  }
  return res;
}

// ---------- Arranque ----------
cargarEstado();
leerUsoOficial();
leerEstadoClaude();
consumo.escanearTranscripciones();
medirSistema();
medirClima().then(enviarEstado);
medirServicios();
consultarAnthropic(false);
consultarAntigravity(true);

fs.watchFile(RUTA_USO, { interval: 2000 }, leerUsoOficial);
fs.watchFile(RUTA_ESTADO_CLAUDE, { interval: 1000 }, leerEstadoClaude);

setInterval(tick, 60000);
setInterval(() => pomodoro.revisar(Date.now(), lider.esLider()), 1000);
setInterval(() => alarmas.revisar(new Date(), lider.esLider()), 15000);
setInterval(medirSistema, 3000);
setInterval(() => { consumo.escanearTranscripciones(); }, 30000);
setInterval(medirServicios, 60000);
setInterval(() => medirClima().then(enviarEstado), 15 * 60000);
setInterval(() => consultarAnthropic(false), 60000);
setInterval(() => consultarAntigravity(false), 60000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🐨 Koala Desk Monitor activo en puerto ${PORT}`);
  console.log(`   Local:   http://localhost:${PORT}`);
  for (const ip of obtenerIpsLocales()) {
    console.log(`   Celular: http://${ip}:${PORT}`);
  }
  console.log('\nAbre la dirección "Celular" en Chrome de tu Moto G06 (en horizontal) y usa "Agregar a pantalla principal".\n');
});

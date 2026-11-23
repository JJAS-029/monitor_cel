'use strict';
// Lector de notificaciones de Windows (navegador Edge/Chrome/Firefox y apps) desde wpndatabase.db
// Usa `node:sqlite` nativo de Node.js (cero dependencias) en modo solo lectura sobre una copia temporal.

const fs = require('fs');
const os = require('os');
const path = require('path');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  DatabaseSync = null;
}

const DB_SRC = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Notifications', 'wpndatabase.db')
  : null;

const TMP_BASE = path.join(os.tmpdir(), `koala-wpn-${process.pid}.db`);

function decodificarXml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function filetimeAMs(ft) {
  try {
    const big = BigInt(String(ft || '0'));
    if (big <= 0n) return Date.now();
    // Windows FILETIME: intervalos de 100 ns desde 1601-01-01
    const ms = Number(big / 10000n - 11644473600000n);
    return ms > 946684800000 && ms < 4102444800000 ? ms : Date.now();
  } catch (e) {
    return Date.now();
  }
}

function nombreApp(primaryId) {
  const raw = String(primaryId || '');
  const low = raw.toLowerCase();
  if (low.includes('msedge') || low.includes('edge')) return { nombre: 'Edge', icono: '🌐', navegador: true };
  if (low.includes('chrome')) return { nombre: 'Chrome', icono: '🌐', navegador: true };
  if (low.includes('firefox')) return { nombre: 'Firefox', icono: '🦊', navegador: true };
  if (low.includes('brave')) return { nombre: 'Brave', icono: '🦁', navegador: true };
  if (low.includes('opera')) return { nombre: 'Opera', icono: '🌐', navegador: true };
  if (low.includes('whatsapp')) return { nombre: 'WhatsApp', icono: '💬', navegador: false };
  if (low.includes('discord')) return { nombre: 'Discord', icono: '🎮', navegador: false };
  if (low.includes('telegram')) return { nombre: 'Telegram', icono: '✈️', navegador: false };
  if (low.includes('teams')) return { nombre: 'Teams', icono: '💼', navegador: false };
  if (low.includes('outlook') || low.includes('mail')) return { nombre: 'Correo', icono: '✉️', navegador: false };
  if (low.includes('spotify')) return { nombre: 'Spotify', icono: '🎵', navegador: false };
  if (low.includes('code') || low.includes('vscode')) return { nombre: 'VS Code', icono: '💻', navegador: false };
  const limpio = raw.split('!')[0].split(/[\\/.]/).filter(Boolean).pop() || 'Windows';
  return { nombre: limpio.slice(0, 20), icono: '🔔', navegador: false };
}

function extraerTextos(payload) {
  const xml = String(payload || '');
  const textos = [];
  const re = /<text\b[^>]*>([\s\S]*?)<\/text>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const limpio = decodificarXml(m[1].replace(/<[^>]+>/g, ''));
    if (limpio) textos.push(limpio);
  }
  return textos;
}

function leerNotificaciones(limite = 12) {
  if (process.platform !== 'win32' || !DatabaseSync || !DB_SRC || !fs.existsSync(DB_SRC)) {
    return { disponible: false, lista: [] };
  }

  let db = null;
  try {
    fs.copyFileSync(DB_SRC, TMP_BASE);
    for (const suf of ['-wal', '-shm']) {
      try {
        if (fs.existsSync(DB_SRC + suf)) fs.copyFileSync(DB_SRC + suf, TMP_BASE + suf);
        else if (fs.existsSync(TMP_BASE + suf)) fs.unlinkSync(TMP_BASE + suf);
      } catch (e) { /* opcional */ }
    }

    db = new DatabaseSync(TMP_BASE, { readOnly: true });
    const rows = db.prepare(
      "SELECT CAST(n.Id AS TEXT) AS Id, CAST(n.ArrivalTime AS TEXT) AS ArrivalTime, h.PrimaryId, CAST(n.Payload AS TEXT) AS Payload " +
      "FROM Notification n " +
      "LEFT JOIN NotificationHandler h ON n.HandlerId = h.RecordId " +
      "WHERE n.Type = 'toast' " +
      "ORDER BY n.ArrivalTime DESC " +
      "LIMIT ?"
    ).all(limite);

    const lista = [];
    for (const r of rows) {
      const textos = extraerTextos(r.Payload);
      if (!textos.length) continue;
      const app = nombreApp(r.PrimaryId);
      lista.push({
        id: String(r.Id),
        ts: filetimeAMs(r.ArrivalTime),
        app: app.nombre,
        icono: app.icono,
        navegador: app.navegador,
        titulo: textos[0].slice(0, 90),
        cuerpo: textos.slice(1).join(' · ').slice(0, 160),
      });
    }
    return { disponible: true, lista };
  } catch (e) {
    return { disponible: false, error: e.message, lista: [] };
  } finally {
    if (db) { try { db.close(); } catch (e) { /* */ } }
  }
}

module.exports = { leerNotificaciones };

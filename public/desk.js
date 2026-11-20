(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function enviar(msg) {
    return fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    }).catch(() => {});
  }

  // ---------- Reloj ----------
  function actualizarReloj() {
    const d = new Date();
    $('reloj-hora').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    $('reloj-fecha').textContent = d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  actualizarReloj();
  setInterval(actualizarReloj, 5000);

  // ---------- Toast ----------
  let toastTimer = null;
  function mostrarToast(texto) {
    const el = $('toast');
    el.textContent = texto;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 5000);
  }

  // ---------- Utilidades de formato ----------
  function bytes(n) {
    const g = n / 1024 ** 3;
    return g >= 100 ? Math.round(g) + ' GB' : g.toFixed(1) + ' GB';
  }
  function hace(ms) {
    if (!ms) return '';
    const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    return `hace ${Math.floor(min / 60)} h`;
  }
  function faltaPara(v) {
    if (!v) return '';
    if (typeof v === 'string') return v;
    const min = Math.max(0, Math.round((v - Date.now()) / 60000));
    if (min < 60) return `en ${min} min`;
    const h = Math.floor(min / 60);
    return h < 24 ? `en ${h} h ${min % 60} min` : `en ${Math.floor(h / 24)} d ${h % 24} h`;
  }
  function colorNivel(v, ambar, rojo) {
    return v >= rojo ? 'rojo' : v >= ambar ? 'ambar' : 'verde';
  }
  function colorRestante(v) {
    return v <= 15 ? 'rojo' : v <= 35 ? 'ambar' : 'verde';
  }
  function metrica(nombre, valor, pct, clase) {
    const w = Math.max(0, Math.min(100, pct || 0));
    return `<div class="metrica"><span class="nom">${esc(nombre)}</span>` +
      `<div class="medidor"><i class="${clase || ''}" style="width:${w}%"></i></div>` +
      `<span class="val">${esc(valor)}</span></div>`;
  }

  // ---------- Pintar Antigravity ----------
  function pintarAntigravity(ag) {
    const badge = $('agy-badge');
    const body = $('agy-body');
    if (!ag) return;

    if (ag.estado === 'ok' && ag.modelos && ag.modelos.length) {
      badge.className = 'badge ok';
      badge.textContent = ag.plan ? `${ag.plan} · ${hace(ag.actualizado)}` : hace(ag.actualizado);
      body.innerHTML = ag.modelos.map((m) => {
        const rest = m.restantePct != null ? m.restantePct : (m.usadoPct != null ? 100 - m.usadoPct : 0);
        const col = colorRestante(rest);
        const sub = m.reinicio ? `Se reinicia ${faltaPara(m.reinicio)}` : (m.estado || '');
        return `<div class="agy-item">` +
          `<div class="agy-top"><b>${esc(m.nombre)}</b><span>${rest}% restante</span></div>` +
          `<div class="medidor"><i class="${col}" style="width:${rest}%"></i></div>` +
          (sub ? `<div class="agy-sub">${esc(sub)}</div>` : '') +
          `</div>`;
      }).join('');
      return;
    }

    if (ag.estado === 'no_instalado') {
      badge.className = 'badge warn';
      badge.textContent = 'Falta CLI agy';
      body.innerHTML = `<div class="nota">Para ver cuánto te queda de cada modelo de Antigravity, instala el CLI oficial en PowerShell:<br>` +
        `<code>irm https://antigravity.google/cli/install.ps1 | iex</code><br>` +
        `Luego ejecuta <code>agy</code> una vez para iniciar sesión y toca <b>↻</b>.</div>`;
      return;
    }

    if (ag.estado === 'sin_sesion') {
      badge.className = 'badge warn';
      badge.textContent = 'Sin sesión';
      body.innerHTML = `<div class="nota">Abre una terminal, ejecuta <code>agy</code> para iniciar sesión con tu cuenta de Google y luego toca <b>↻</b>.</div>`;
      return;
    }

    badge.className = 'badge';
    badge.textContent = ag.estado === 'cargando' ? 'Consultando…' : 'Sin datos';
    body.innerHTML = `<div class="nota">${esc(ag.error || 'Sin datos todavía.')}</div>`;
  }

  // ---------- Pintar PC & GPU ----------
  function pintarSistema(s) {
    if (!s) return;
    $('pc-host').textContent = s.host || 'PC';
    const cpu = s.cpu != null ? Math.round(s.cpu) : 0;
    const ramPct = s.memoria ? Math.round(s.memoria.pct) : 0;
    let html = '';

    if (s.gpu) {
      const g = s.gpu;
      html += `<div class="gpu-chips">` +
        `<div class="chip"><b>${cpu}%</b><span>CPU (${s.nucleos}c)</span></div>` +
        `<div class="chip"><b>${ramPct}%</b><span>RAM</span></div>` +
        `<div class="chip"><b>${g.uso != null ? g.uso + '%' : '—'}</b><span>GPU</span></div>` +
        `<div class="chip"><b>${g.temperatura != null ? g.temperatura + '°C' : '—'}</b><span>Temp GPU</span></div>` +
        `</div>`;
      html += metrica(`GPU · ${g.nombre.replace(/^NVIDIA\s+/i, '')}`, `${g.uso ?? '—'}%`, g.uso, colorNivel(g.uso || 0, 75, 92));
      if (g.vramTotal) {
        html += metrica('VRAM', `${(g.vramUsada / 1024).toFixed(1)}/${(g.vramTotal / 1024).toFixed(0)} GB`, g.vramPct, colorNivel(g.vramPct || 0, 75, 90));
      }
    } else {
      html += metrica(`CPU (${s.nucleos} núcleos)`, `${cpu}%`, cpu, colorNivel(cpu, 70, 90));
    }

    if (s.memoria) {
      html += metrica('RAM', `${bytes(s.memoria.usada)}/${bytes(s.memoria.total)}`, s.memoria.pct, colorNivel(s.memoria.pct, 75, 90));
    }
    for (const d of s.discos || []) {
      html += metrica(`Disco ${d.ruta}`, `${Math.round(d.pct)}%`, d.pct, colorNivel(d.pct, 80, 92));
    }
    $('pc-body').innerHTML = html;
  }

  // ---------- Pintar extras de Claude, Clima, Alertas y Alarmas ----------
  function pintarExtras(m) {
    // Badge de fuente de Claude
    const u = m.uso || {};
    const cb = $('claude-badge');
    if (u.fuente === 'anthropic') { cb.className = 'badge ok'; cb.textContent = 'Anthropic · ' + hace(u.actualizado); }
    else if (u.fuente === 'statusline') { cb.className = 'badge ok'; cb.textContent = 'CLI · ' + hace(u.actualizado); }
    else { cb.className = 'badge'; cb.textContent = 'Local'; }

    const r = u.ritmo || {};
    if (r.estado === 'alcanza') {
      const hh = new Date(r.eta);
      $('claude-ritmo').textContent = `⚠ A este ritmo llegas al 100 % a las ${String(hh.getHours()).padStart(2, '0')}:${String(hh.getMinutes()).padStart(2, '0')}`;
    } else if (r.estado === 'holgado') {
      $('claude-ritmo').textContent = '✓ Ritmo holgado para esta ventana.';
    } else {
      $('claude-ritmo').textContent = '';
    }

    // Clima mini
    const cl = m.clima;
    const ICONOS = { despejado: '☀️', nublado: '⛅', niebla: '🌫️', lluvia: '🌧️', tormenta: '⛈️', nieve: '❄️' };
    if (cl && !cl.error) {
      $('clima-mini').textContent = `${ICONOS[cl.tipo] || '🌡️'} ${cl.temp}°C · ${cl.nombre || ''}`;
    } else {
      $('clima-mini').textContent = '🌍 Elegir ciudad';
    }

    // Pomodoro hoy
    if (m.pomodoro) $('pomo-hoy').textContent = `${m.pomodoro.hoy || 0} hoy`;

    // Alertas
    const al = (m.alertas || []).slice(0, 3);
    $('alertas').innerHTML = al.map((x) => `<div class="alerta n${x.nivel}">${esc(x.texto)}</div>`).join('');

    // Alarmas
    const lista = m.alarmas || [];
    $('alarmas-lista').innerHTML = lista.length
      ? lista.map((a) =>
        `<div class="alarma${a.activa ? '' : ' apagada'}">` +
        `<button data-alarma-alternar="${esc(a.id)}">${a.activa ? '⏰' : '💤'}</button>` +
        `<b>${esc(a.hora)}</b><span>${esc(a.mensaje)}</span>` +
        `<span class="nota">${esc(a.texto || '')}</span>` +
        `<button data-alarma-borrar="${esc(a.id)}">×</button></div>`).join('')
      : '<div class="nota">Sin alarmas activas.</div>';
  }

  // ---------- Eventos UI ----------
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.media) {
      enviar({ tipo: 'media', accion: btn.dataset.media });
    } else if (btn.dataset.alarmaAlternar) {
      enviar({ tipo: 'alternarAlarma', id: btn.dataset.alarmaAlternar });
    } else if (btn.dataset.alarmaBorrar) {
      enviar({ tipo: 'borrarAlarma', id: btn.dataset.alarmaBorrar });
    }
  });

  $('btn-agy-refresh').addEventListener('click', () => {
    $('agy-badge').textContent = 'Actualizando…';
    enviar({ tipo: 'consultarAntigravity' });
  });

  $('btn-claude-api').addEventListener('click', () => {
    enviar({ tipo: 'activarApi' });
    mostrarToast('Alternando consulta directa a Anthropic API');
  });

  $('clima-mini').addEventListener('click', () => {
    const ciudad = window.prompt('Ciudad para el clima (ej. Toluca, Monterrey, CDMX). Deja vacío para desactivar:');
    if (ciudad !== null) enviar({ tipo: 'setCiudad', ciudad });
  });

  $('alarma-agregar').addEventListener('click', () => {
    const hora = $('alarma-hora').value;
    if (!hora) { $('alarma-hora').focus(); return; }
    enviar({ tipo: 'crearAlarma', hora, mensaje: $('alarma-msg').value, repeticion: $('alarma-rep').value });
    $('alarma-msg').value = '';
  });

  // ---------- Screen Wake Lock & Fullscreen ----------
  let wakeLock = null;
  async function activarWakeLock() {
    if (!('wakeLock' in navigator)) {
      mostrarToast('Tu navegador no soporta Wake Lock en HTTP (usa pantalla siempre activa en Android)');
      return;
    }
    try {
      if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
        $('btn-wakelock').classList.remove('activo');
        $('btn-wakelock').textContent = '☀️ Pantalla fija';
      } else {
        wakeLock = await navigator.wakeLock.request('screen');
        $('btn-wakelock').classList.add('activo');
        $('btn-wakelock').textContent = '☀️ Pantalla fija (ON)';
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
          $('btn-wakelock').classList.remove('activo');
          $('btn-wakelock').textContent = '☀️ Pantalla fija';
        });
      }
    } catch (e) {
      mostrarToast('Wake Lock requiere HTTPS o localhost (o activa "Pantalla activa al cargar" en Opciones de desarrollador)');
    }
  }
  $('btn-wakelock').addEventListener('click', activarWakeLock);

  $('btn-fullscreen').addEventListener('click', () => {
    const el = document.documentElement;
    const isFs = document.fullscreenElement || document.webkitFullscreenElement;
    if (!isFs) {
      const fn = el.requestFullscreen || el.webkitRequestFullscreen;
      if (fn) {
        Promise.resolve(fn.call(el)).catch(() => {
          mostrarToast('En Chrome móvil usa ⋮ → "Agregar a pantalla principal" para pantalla completa permanente');
        });
      } else {
        mostrarToast('Usa ⋮ → "Agregar a pantalla principal" en Chrome para abrir a pantalla completa');
      }
    } else {
      const exitFn = document.exitFullscreen || document.webkitExitFullscreen;
      if (exitFn) Promise.resolve(exitFn.call(document)).catch(() => {});
    }
  });

  // ---------- Conexión SSE en tiempo real ----------
  function conectar() {
    const es = new EventSource('/events');
    es.onopen = () => {
      $('conn-dot').classList.remove('off');
      $('conn-txt').textContent = 'En línea';
    };
    es.onerror = () => {
      $('conn-dot').classList.add('off');
      $('conn-txt').textContent = 'Reconectando…';
    };
    es.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.tipo === 'notificacion') {
        mostrarToast(msg.texto);
        return;
      }
      // Reenviar a koala.js (escucha window.addEventListener('message', ...))
      window.postMessage(msg, '*');
      if (msg.tipo === 'estado') {
        pintarAntigravity(msg.antigravity);
        pintarSistema(msg.sistema);
        pintarExtras(msg);
      }
    };
  }
  conectar();
})();

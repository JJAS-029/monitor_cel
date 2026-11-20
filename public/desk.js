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

  // ---------- Carruseles deslizables ----------
  const TARJETAS = [
    ['antigravity', '🚀 Antigravity'],
    ['pc', '🖥️ PC & GPU'],
    ['musica', '🎵 Música & Control'],
    ['claude', '🧪 Claude Code'],
    ['pomodoro', '⏱️ Pomodoro'],
    ['alarmas', '⏰ Alarmas'],
  ];
  const IDS = TARJETAS.map((x) => x[0]);
  const INICIO = ['antigravity', 'pc'];
  const MAX_CARRUSELES = 4;
  const STORAGE_KEY = 'koalaDesk.carruseles.v1';

  let carruseles = INICIO.slice();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Array.isArray(saved) && saved.length > 0 && saved.every((x) => IDS.includes(x))) {
      carruseles = saved.slice(0, MAX_CARRUSELES);
    }
  } catch (e) { /* */ }

  function guardarCarruseles() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(carruseles)); } catch (e) { /* */ }
  }
  function nodoTarjeta(id) {
    return document.querySelector('.tj[data-tj="' + id + '"]');
  }

  function armarCarruseles(animar) {
    const caja = $('carruseles');
    const dep = $('deposito');
    if (!caja || !dep) return;

    document.querySelectorAll('#carruseles .tj').forEach((n) => dep.appendChild(n));
    caja.innerHTML = '';
    caja.classList.toggle('uno', carruseles.length === 1);

    carruseles.forEach((id, i) => {
      const c = document.createElement('div');
      c.className = 'carrusel';
      c.setAttribute('data-i', i);
      const opciones = TARJETAS.map((x) =>
        `<option value="${x[0]}"${x[0] === id ? ' selected' : ''}>${esc(x[1])}</option>`
      ).join('');
      c.innerHTML =
        `<div class="car-cab">` +
        `<button data-car="prev" title="Anterior">‹</button>` +
        `<select class="car-sel" data-car="sel">${opciones}</select>` +
        `<span class="car-pos">${IDS.indexOf(id) + 1}/${IDS.length}</span>` +
        `<button data-car="next" title="Siguiente">›</button>` +
        (carruseles.length > 1 ? `<button data-car="quitar" title="Quitar panel">×</button>` : `<span></span>`) +
        `</div><div class="car-cuerpo"></div><div class="car-puntos">` +
        IDS.map((x) => `<i data-dot="${x}" class="${x === id ? 'sel' : ''}"></i>`).join('') +
        `</div>`;

      const cuerpo = c.querySelector('.car-cuerpo');
      const n = nodoTarjeta(id);
      if (n) cuerpo.appendChild(n);
      if (animar && animar.i === i) cuerpo.classList.add(animar.dir > 0 ? 'entra-der' : 'entra-izq');
      caja.appendChild(c);
    });

    const btnAg = $('car-agregar');
    if (btnAg) btnAg.disabled = carruseles.length >= MAX_CARRUSELES;
  }

  function mostrarEn(i, id, dir) {
    const otro = carruseles.indexOf(id);
    if (otro === i) return;
    if (otro >= 0) carruseles[otro] = carruseles[i];
    carruseles[i] = id;
    guardarCarruseles();
    armarCarruseles({ i, dir: dir || 1 });
  }

  function moverCarrusel(i, dir) {
    let k = IDS.indexOf(carruseles[i]);
    for (let n = 0; n < IDS.length; n++) {
      k = (k + dir + IDS.length) % IDS.length;
      if (!carruseles.includes(IDS[k])) return mostrarEn(i, IDS[k], dir);
    }
  }

  document.addEventListener('click', (e) => {
    const dot = e.target.closest && e.target.closest('.car-puntos i[data-dot]');
    if (dot) {
      const i = Number(dot.closest('.carrusel').getAttribute('data-i'));
      const id = dot.getAttribute('data-dot');
      mostrarEn(i, id, IDS.indexOf(id) >= IDS.indexOf(carruseles[i]) ? 1 : -1);
      return;
    }
    const carBtn = e.target.closest && e.target.closest('[data-car]');
    if (carBtn && carBtn.tagName !== 'SELECT') {
      const i = Number(carBtn.closest('.carrusel').getAttribute('data-i'));
      const que = carBtn.getAttribute('data-car');
      if (que === 'prev') moverCarrusel(i, -1);
      else if (que === 'next') moverCarrusel(i, 1);
      else if (que === 'quitar' && carruseles.length > 1) {
        carruseles.splice(i, 1);
        guardarCarruseles();
        armarCarruseles();
      }
      return;
    }
    const btn = e.target.closest && e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.media) enviar({ tipo: 'media', accion: btn.dataset.media });
    else if (btn.dataset.alarmaAlternar) enviar({ tipo: 'alternarAlarma', id: btn.dataset.alarmaAlternar });
    else if (btn.dataset.alarmaBorrar) enviar({ tipo: 'borrarAlarma', id: btn.dataset.alarmaBorrar });
  });

  document.addEventListener('change', (e) => {
    if (!e.target || e.target.getAttribute('data-car') !== 'sel') return;
    const i = Number(e.target.closest('.carrusel').getAttribute('data-i'));
    const val = e.target.value;
    mostrarEn(i, val, IDS.indexOf(val) >= IDS.indexOf(carruseles[i]) ? 1 : -1);
  });

  // Deslizar con el dedo o mouse sobre una tarjeta
  let arrastre = null;
  document.addEventListener('pointerdown', (e) => {
    const cuerpo = e.target && e.target.closest ? e.target.closest('.car-cuerpo') : null;
    if (!cuerpo || e.target.closest('button, input, select, textarea, a')) return;
    arrastre = { x: e.clientX, y: e.clientY, i: Number(cuerpo.closest('.carrusel').getAttribute('data-i')) };
  });
  document.addEventListener('pointerup', (e) => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
    const i = arrastre.i;
    arrastre = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > 1.4 * Math.abs(dy)) moverCarrusel(i, dx < 0 ? 1 : -1);
  });

  $('car-agregar').addEventListener('click', () => {
    if (carruseles.length >= MAX_CARRUSELES) return;
    const libre = IDS.find((x) => !carruseles.includes(x));
    if (!libre) return;
    carruseles.push(libre);
    guardarCarruseles();
    armarCarruseles();
  });
  $('car-restablecer').addEventListener('click', () => {
    carruseles = INICIO.slice();
    guardarCarruseles();
    armarCarruseles();
  });

  armarCarruseles();

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

  // ---------- Utilidades ----------
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
    if (!ag || !badge || !body) return;

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
      body.innerHTML = `<div class="nota">Instala el CLI oficial en PowerShell:<br>` +
        `<code>irm https://antigravity.google/cli/install.ps1 | iex</code><br>` +
        `Inicia sesión con <code>agy</code> y toca <b>↻</b>.</div>`;
      return;
    }

    if (ag.estado === 'sin_sesion') {
      badge.className = 'badge warn';
      badge.textContent = 'Sin sesión';
      body.innerHTML = `<div class="nota">Ejecuta <code>agy</code> para iniciar sesión y toca <b>↻</b>.</div>`;
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
    if (s.encendido) {
      const h = Math.floor(s.encendido / 3600);
      const m = Math.floor((s.encendido % 3600) / 60);
      $('pc-uptime').textContent = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
    }
    const cpu = s.cpu != null ? Math.round(s.cpu) : 0;
    const ramPct = s.memoria ? Math.round(s.memoria.pct) : 0;
    let html = '';

    if (s.gpu) {
      const g = s.gpu;
      html += `<div class="gpu-chips">` +
        `<div class="chip"><b>${cpu}%</b><span>CPU (${s.nucleos}c)</span></div>` +
        `<div class="chip"><b>${ramPct}%</b><span>RAM</span></div>` +
        `<div class="chip"><b>${g.uso != null ? g.uso + '%' : '—'}</b><span>GPU</span></div>` +
        `<div class="chip"><b>${g.temperatura != null ? g.temperatura + '°C' : '—'}</b><span>Temp</span></div>` +
        `</div>`;
      html += metrica(`GPU · ${g.nombre.replace(/^NVIDIA\s+/i, '')}`, `${g.uso ?? '—'}%`, g.uso, colorNivel(g.uso || 0, 75, 92));
      if (g.vramTotal) {
        html += metrica('VRAM', `${(g.vramUsada / 1024).toFixed(1)}/${(g.vramTotal / 1024).toFixed(0)} GB`, g.vramPct, colorNivel(g.vramPct || 0, 75, 90));
      }
    } else {
      html += metrica(`CPU (${s.nucleos}c)`, `${cpu}%`, cpu, colorNivel(cpu, 70, 90));
    }

    if (s.memoria) {
      html += metrica('RAM', `${bytes(s.memoria.usada)}/${bytes(s.memoria.total)}`, s.memoria.pct, colorNivel(s.memoria.pct, 75, 90));
    }
    for (const d of s.discos || []) {
      html += metrica(`Disco ${d.ruta}`, `${Math.round(d.pct)}%`, d.pct, colorNivel(d.pct, 80, 92));
    }
    $('pc-body').innerHTML = html;
  }

  // ---------- Pintar Música (Now Playing) ----------
  function pintarMedia(media) {
    const icon = $('np-icon');
    const title = $('np-title');
    const artist = $('np-artist');
    const btnPlay = $('btn-playpause');
    if (!title || !artist) return;

    if (media && (media.titulo || media.artista)) {
      const playing = media.estado === 'Playing';
      icon.classList.toggle('playing', playing);
      icon.textContent = playing ? '🎶' : '⏸️';
      title.textContent = media.titulo || 'Reproduciendo…';
      artist.textContent = [media.artista, media.album, media.app].filter(Boolean).join(' · ');
      if (btnPlay) btnPlay.innerHTML = playing ? '⏸<span>Pausar</span>' : '▶️<span>Reproducir</span>';
    } else {
      icon.classList.remove('playing');
      icon.textContent = '🎵';
      title.textContent = 'Sin música activa';
      artist.textContent = 'Reproduce Spotify, YouTube o VLC en tu PC';
      if (btnPlay) btnPlay.innerHTML = '⏯<span>Play/Pausa</span>';
    }
  }

  // ---------- Pintar extras ----------
  function pintarExtras(m) {
    const u = m.uso || {};
    const cb = $('claude-badge');
    if (cb) {
      if (u.fuente === 'anthropic') { cb.className = 'badge ok'; cb.textContent = 'Anthropic · ' + hace(u.actualizado); }
      else if (u.fuente === 'statusline') { cb.className = 'badge ok'; cb.textContent = 'CLI · ' + hace(u.actualizado); }
      else { cb.className = 'badge'; cb.textContent = 'Local'; }
    }

    const r = u.ritmo || {};
    if (r.estado === 'alcanza') {
      const hh = new Date(r.eta);
      $('claude-ritmo').textContent = `⚠ A este ritmo llegas al 100 % a las ${String(hh.getHours()).padStart(2, '0')}:${String(hh.getMinutes()).padStart(2, '0')}`;
    } else if (r.estado === 'holgado') {
      $('claude-ritmo').textContent = '✓ Ritmo holgado para esta ventana.';
    } else {
      $('claude-ritmo').textContent = '';
    }

    const cl = m.clima;
    const ICONOS = { despejado: '☀️', nublado: '⛅', niebla: '🌫️', lluvia: '🌧️', tormenta: '⛈️', nieve: '❄️' };
    if (cl && !cl.error) {
      $('clima-mini').textContent = `${ICONOS[cl.tipo] || '🌡️'} ${cl.temp}°`;
    } else {
      $('clima-mini').textContent = '🌍';
    }

    if (m.pomodoro) $('pomo-hoy').textContent = `${m.pomodoro.hoy || 0} hoy`;

    const al = (m.alertas || []).slice(0, 2);
    $('alertas').innerHTML = al.map((x) => `<div class="alerta n${x.nivel}">${esc(x.texto)}</div>`).join('');

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

  // ---------- Botones fijos ----------
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

  // ---------- Wake Lock & Fullscreen ----------
  let wakeLock = null;
  $('btn-wakelock').addEventListener('click', async () => {
    if (!('wakeLock' in navigator)) {
      mostrarToast('Activa "Pantalla activa" en Opciones de desarrollador del Motorola');
      return;
    }
    try {
      if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
        $('btn-wakelock').classList.remove('activo');
      } else {
        wakeLock = await navigator.wakeLock.request('screen');
        $('btn-wakelock').classList.add('activo');
        mostrarToast('Pantalla fija activada');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
          $('btn-wakelock').classList.remove('activo');
        });
      }
    } catch (e) {
      mostrarToast('Wake Lock requiere HTTPS (usa "Pantalla activa al cargar" en Android)');
    }
  });

  $('btn-fullscreen').addEventListener('click', () => {
    const el = document.documentElement;
    const isFs = document.fullscreenElement || document.webkitFullscreenElement;
    if (!isFs) {
      const fn = el.requestFullscreen || el.webkitRequestFullscreen;
      if (fn) {
        Promise.resolve(fn.call(el)).catch(() => {
          mostrarToast('En Chrome móvil usa ⋮ → "Agregar a pantalla principal" para pantalla completa permanente');
        });
      }
    } else {
      const exitFn = document.exitFullscreen || document.webkitExitFullscreen;
      if (exitFn) Promise.resolve(exitFn.call(document)).catch(() => {});
    }
  });

  // ---------- Conexión SSE ----------
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
      window.postMessage(msg, '*');
      if (msg.tipo === 'estado') {
        pintarAntigravity(msg.antigravity);
        pintarSistema(msg.sistema);
        pintarMedia(msg.media);
        pintarExtras(msg);
      }
    };
  }
  conectar();
})();

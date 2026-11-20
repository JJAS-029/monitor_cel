# Mismo koala en VS Code y en el celular

> **Estado: ✅ Aplicadas** (20 nov. 2026): audífonos y baile con música, traducción de «¡Antigravity terminó!» y guardia `!lider.esLider()` para evitar contar commits doble.

El koala de VS Code ([koala_monitor](https://github.com/JJAS-029/koala_monitor)) y el de este panel comparten su
estado en `~/.claude/koala/compartido.json`, así que conviene que tengan las mismas animaciones y que calculen igual.
Comparación hecha el 20 nov. 2026: `public/koala.js` de este repo (commit `00389d5`) contra `media/koala.js` de
koala_monitor 1.13.0.

## Resultado

| | VS Code | Celular |
|---|---|---|
| Animaciones de ocio, de temporada y de eventos | ✓ | ✓ (todas las demás son idénticas) |
| **Audífonos y baile cuando suena música** | ✓ | **falta** → punto 1 |
| Texto de quién trabaja (Claude, Antigravity o los dos) | ✓ | ✓ |
| Aviso «¡… terminó!» traducido al inglés | ✓ | **falta** → punto 2 |
| Energía y ánimo ligados a las cuotas de IA | ✓ (1.13.0, misma fórmula) | ✓ |
| Come con cada commit (+30 saciedad, +10 ánimo) | ✓ (1.13.0) | ✓, pero se cuenta doble → punto 3 |
| Botón de dormir como ícono (💤 / ☀️) | texto | ícono (diferencia a propósito: en el celular falta espacio) |

Lo que el celular tenía y VS Code no (energía y ánimo con las cuotas, comer con los commits, texto corto de la
energía y actualizar el texto al cambiar quién trabaja) ya se pasó a koala_monitor 1.13.0.

---

## 1. Audífonos y baile cuando suena música

El servidor ya lee lo que suena (`mediaActual`, de `src/media-info.ps1`), pero el koala no lo usa. En VS Code, si
suena algo, el koala se pone audífonos rojos (de frente y sentado frente a la laptop), mueve la cabeza al ritmo con
notas musicales y dice la canción («🎧 Stars Will Align — Kygo, Imagine Dragons»).

**a) `src/server.js`, en el estado que se manda al panel**: el koala espera `musica` con estos nombres.

```js
musica: mediaActual && mediaActual.title
  ? { titulo: mediaActual.title, artista: mediaActual.artist || '', app: mediaActual.app || '', sonando: mediaActual.status === 'Playing' }
  : null,
```

**b) `public/koala.js`**: copiar tal cual de koala_monitor `media/koala.js` (commit `dd73227` en adelante):

- `musicaSonando()` y `escucharMusica()` (sección «Música: con audífonos, mueve la cabeza al ritmo»);
- `audifonos(sentado)` (justo antes de `sombrero()`), y llamarla en `koalaFrente()` con `audifonos(false);` antes de
  `adornoOreja(-5.8, -10.8)`, y en `koalaSentado()` con `audifonos(true);` antes de `adornoOreja(-6.4, -10.2)`;
- en `ocio()`, la opción `[musicaSonando() ? 5 : 0, escucharMusica],`;
- en el mensaje `estado`, agregar `musica: musicaSonando()` a `antes` y `|| antes.musica !== musicaSonando()` a la
  condición que llama a `interrumpir()`, para que se ponga o se quite los audífonos al momento;
- en `window.__koala.probar`, agregar `escucharMusica` (para las pruebas).

Para comprobarlo: con música sonando, el koala debe tener audífonos al pasear y al trabajar en la laptop, y de vez en
cuando bailar con notas y el título de la canción abajo.

## 2. Traducir el aviso de «terminó»

En `claudeListo()` el texto se arma a mano (`'📜 ¡' + q + ' terminó! (…)'`), así que en inglés sale en español.
Usar las mismas claves de `l10n/en.json` que VS Code:

```js
k.texto = '📜 ' + (d.quien === 'Antigravity'
  ? T('¡Antigravity terminó! ({0})', duracionCorta(d.duracion))
  : T('¡Claude terminó! ({0})', duracionCorta(d.duracion)));
```

(y agregar a `src/koala-core/l10n/en.json`: `"¡Antigravity terminó! ({0})": "Antigravity finished! ({0})"`).

## 3. Los commits se cuentan dos veces si VS Code está abierto

`vigilarCommits()` corre aunque el servidor no sea la ventana líder. Con VS Code abierto, un commit lo festejan los
dos: VS Code suma +30/+10 y el servidor otros +30/+10 (y la notificación sale dos veces). Propuesta:

```js
async function vigilarCommits() {
  // ...
  if (commitsInicializados && previo && previo !== head.hash && (Date.now() - head.ts < 5 * 60000)) {
    if (!lider.esLider()) continue; // VS Code (líder) ya lo festejó y el estado llega por compartido.json
    // ... (lo de ahora)
  }
}
```

Hay que seguir actualizando `ultimoCommitRepo` aunque no sea líder, para no festejar un commit viejo cuando VS Code
se cierre y el servidor pase a ser el líder.

## 4. Mantener la fórmula de la energía igual en los dos

Desde koala_monitor 1.13.0 los dos calculan la energía así (si algún día cambia en uno, hay que cambiarla en el otro,
porque comparten `necesidades` y si no la energía brinca de un valor a otro):

- energía = promedio de lo que queda de la **sesión de 5 h de Claude** y del **límite de 5 h de Gemini** en
  Antigravity (si no hay grupo de Gemini, el promedio de todos los límites de agy);
- en cada tick, si la energía es ≥ 65 el ánimo sube un 35 % de la distancia hacia ella; si es ≤ 35, baja un 35 %
  hacia `max(15, energía)`.

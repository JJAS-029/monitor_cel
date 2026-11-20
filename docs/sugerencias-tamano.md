# Sugerencias de tamaño para el Moto G06 en horizontal

Revisión del panel corriendo en vivo (commit `55b5e70`, 20 nov. 2026), capturado con el tamaño real del celular:

- **820 × 360 px**: Chrome a pantalla completa o instalado como app, en horizontal (densidad 2×).
- **770 × 360 px**: lo mismo, pero con la barra de navegación de Android de lado.

Las capturas de `docs/capturas/` están tomadas a unos 940 × 470 px. A ese tamaño casi todo cabe, pero en el celular
real faltan unos 110 px de alto, y ahí es donde aparecen los problemas de abajo.

Hoy la hoja de estilos solo tiene un corte para pantallas de menos de 700 px de ancho. Casi todo lo que sigue se
resuelve con un corte para pantallas **bajas**:

```css
@media (max-height: 420px) and (orientation: landscape) { /* … */ }
```

---

## Prioridad alta

### 1. A 360 px de alto se cortan cosas importantes
- **Columna del koala:** los botones de acciones (comer, jugar, mimar, dormir, agua) no se ven; aparece una barra
  de desplazamiento junto a la columna y el renglón de Agua queda pegado al borde.
- **Cuotas IA:** se ven 4 de los 7 límites; el bloque de Claude Code queda fuera y hay que desplazarse dentro de la
  tarjeta.
- **Música:** la fila de volumen (Vol −, Silenciar, Vol +) queda cortada.

Propuesta para pantallas bajas:

| Elemento | Hoy | Propuesta |
|---|---|---|
| `#lienzo` (koala) | 122 px de alto | 96 px |
| `.card` padding | 10px 12px | 6px 10px |
| `.col-izq` gap | 9 px | 6 px |
| Pista "Desliza horizontalmente…" | siempre visible | ocultarla (o mostrarla solo la primera vez) |
| Barra "+ Panel / Restablecer" | ~50 px fijos abajo | moverla a un botón ⋮ en la cabecera del reloj |
| Botones de acciones del koala | fila grande | fila de íconos de 40 px |

Con eso se recuperan unos 100 px de alto, suficiente para que la columna del koala y la música quepan sin
desplazarse.

### 2. La columna izquierda tiene ancho fijo
`.desk { grid-template-columns: 298px 1fr; }`: a 770 px de ancho la columna del koala ocupa el 39 % y las dos
tarjetas de la derecha quedan muy angostas. Propuesta:

```css
.desk { grid-template-columns: clamp(240px, 32vw, 298px) 1fr; }
```

### 3. La cabecera de cada tarjeta se come el título
Con `.car-cab { grid-template-columns: 32px 1fr auto 32px 28px; }` el título queda en "Cuota:", "Músic",
"PC & G", y a 770 px en "Cu" y "PC". Propuestas, de menor a mayor cambio:
- Ocultar el contador "1/5" en pantallas bajas; los puntos de abajo ya dicen en qué tarjeta vas.
- Llevar la × de quitar panel al menú ⋮ (se usa poco y ocupa espacio en cada tarjeta).
- Título a 15 px con `min-width: 0; overflow: hidden; text-overflow: ellipsis;` en el `<select>`.

### 4. Las barras de PC & GPU desaparecen
`.metrica { grid-template-columns: 98px 1fr 88px; }`: en una tarjeta de ~240 px a la barra le quedan unos 30 px a
820 de ancho (la onda casi no se ve) y **0 px a 770** (solo queda el punto final). Propuesta: el mismo diseño que las
cuotas, en dos renglones: nombre y valor arriba, barra a todo lo ancho abajo. Si se quiere mantener un renglón,
`64px 1fr 64px` y valores cortos ("26/64 GB").

---

## Prioridad media

### 5. Etiquetas que se parten
- En **Cuotas IA**, la etiqueta "hace 4 min" se parte en tres renglones y "ANTIGRAVITY · GEMINI" en dos.
  Propuesta: `white-space: nowrap` en `.badge`, texto corto ("4 min") y título "Antigravity" (el grupo ya dice Gemini).
- En **PC & GPU**, "CPU (24c)" se parte en dos y hace ese recuadro más alto que los demás. Mover "(24c)" a un
  `title` o al renglón de abajo, y la etiqueta a 11 px.
- El texto de energía ocupa dos renglones: "⚡ ligada a tu sesión de 5 h · se recarga a las 16:20 (en 2 h 24 min)".
  Basta con "⚡ se recarga 16:20".

### 6. Falta aire entre un límite y el siguiente
"Reinicia en 2 h 19 min" queda pegado al título del límite siguiente. Dos opciones:
- `margin-bottom: 8px` en `.agy-item`; o
- (ahorra alto) poner "Reinicia en…" a la derecha, en el mismo renglón de la barra: cada límite pasa de ~46 px a
  ~34 px y caben los 7 sin desplazarse.

### 7. Nombres largos
"Claude and GPT · Semana" se parte en dos renglones a 770 px. Traducir y acortar: "Claude y GPT", "Gemini" (en lugar
de "Gemini Models") y la ventana como "5 h" / "Sem.".

### 8. Zonas táctiles chicas
Las flechas ‹ › y la × miden unos 24-28 px; con el dedo conviene un mínimo de 40 px (Material pide 48 dp). Como ya se
puede deslizar, en pantallas táctiles se pueden quitar las flechas y dar ese espacio al título:

```css
@media (pointer: coarse) { .car-cab [data-car="prev"], .car-cab [data-car="next"] { display: none; } }
```

---

## Otra cosa (no es de tamaño, pero importa)

**En Cuotas IA conviven dos significados con la misma barra:** en Antigravity el número es lo que **queda** ("56 %")
y en Claude Code es lo que ya se **usó** ("46 %"). Se leen al revés. Propuesta: mostrar todo como "libre" (así lo
hace el koala de VS Code desde la 1.12.0) o poner "libre" / "usado" junto a cada número.

---

## Cómo probarlo
1. Chrome o Edge → DevTools → barra de dispositivos → dispositivo personalizado de **820 × 360**, densidad 2 (y otro de
   **770 × 360**).
2. Revisar en cada tarjeta del carrusel:
   - [ ] nada queda cortado ni necesita desplazarse (koala con sus botones, cuotas completas, volumen);
   - [ ] los títulos de las tarjetas se leen completos;
   - [ ] las barras de PC & GPU se ven;
   - [ ] ninguna etiqueta ni recuadro se parte en varios renglones;
   - [ ] los botones se pueden tocar con el dedo sin atinar al vecino.

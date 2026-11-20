# Koala Desk Monitor 🐨📱

Panel de escritorio independiente para celular Android (pensado para el **Moto G06** en horizontal), basado en tu **Koala científico**, con:

- **Koala en vivo** sincronizado con VS Code / Antigravity vía `~/.claude/koala/compartido.json` (sigue corriendo aunque cierres el editor para jugar).
- **Cuotas de Antigravity** (modelos restantes y reinicio) mediante el CLI oficial `agy`.
- **Límites de Claude Code** (sesión 5 h, semana, ritmo y consulta opcional a Anthropic API).
- **Monitor de PC & GPU** (CPU, RAM, disco y **NVIDIA GPU**: uso %, temperatura °C y VRAM).
- **Control Deck táctil** (Play/Pausa, Anterior/Siguiente, Volumen +/- y Silenciar en Windows sin hacer Alt+Tab).
- **Reloj, Clima, Pomodoro y Alarmas**.

## Uso rápido

1. Inicia el servidor en tu PC:
   ```powershell
   npm start
   ```
2. En tu **Moto G06** (en la misma red Wi-Fi), abre Chrome y entra a la dirección `Celular` que imprime la consola (por ejemplo `http://192.168.1.11:4747`).
3. Pon el celular en **horizontal**, toca el menú `⋮` de Chrome → **Agregar a pantalla principal** para abrirlo a pantalla completa como app.
4. *(Tip Moto G06)* Activa **Configuración → Batería → Protección contra sobrecarga** (limita la carga al 80 %) y en **Opciones de desarrollador → Pantalla activa** si lo dejarás conectado al cargador.

## Inicio automático en Windows (sin ventana negra)

- **Activar inicio automático:** dale doble clic una sola vez a `instalar-inicio-windows.bat`. Crea un acceso directo en la carpeta `Startup` de Windows para que el servidor arranque solo y en segundo plano cada vez que prendas la PC (y lo inicia al momento).
- **Desactivar inicio automático:** dale doble clic a `quitar-inicio-windows.bat`.
- **Iniciar manualmente sin ventana:** doble clic a `iniciar-koala.vbs` (guarda los logs en `koala-desk.log`).
- **Iniciar manualmente con consola visible:** doble clic a `iniciar-koala.bat` (útil para ver la IP local o depurar).

## Activar cuotas de Antigravity (modelos restantes)

El panel consulta el CLI oficial de Antigravity (`agy -p /usage --output-format json`). Para activarlo en Windows:

```powershell
irm https://antigravity.google/cli/install.ps1 | iex
```

Después abre una terminal nueva, ejecuta `agy` una sola vez para iniciar sesión con tu cuenta de Google, y toca el botón **↻** en la tarjeta de **Antigravity · Modelos**.

> Si el formato de salida de `agy` cambia, puedes inspeccionar la respuesta cruda en `http://localhost:4747/api/antigravity/raw`.

## Si el celular no carga la página por Wi-Fi

Windows Firewall a veces bloquea el puerto `4747` en redes locales. Permite el puerto en PowerShell (como administrador):

```powershell
New-NetFirewallRule -DisplayName "Koala Desk Monitor" -Direction Inbound -Protocol TCP -LocalPort 4747 -Action Allow
```

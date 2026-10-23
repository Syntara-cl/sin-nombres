# Simulación de «¿Quién es más probable?»

Arnés de Node 24 que abre **el `eres-tu.html` de esta rama** en Chromium/Edge y conecta jugadores por Supabase Realtime. No consulta tablas, no escribe en la base, no usa Vercel y no modifica el sitio. Cada escenario crea su propia sala `prueba-aaaammdd-hhmmss-xxxx`; la sala familiar queda aislada.

## Instalación

Desde esta carpeta:

```sh
npm ci
npm test
node run.js --escenario todos --cerebros aleatorio
node run.js --escenario partida-completa --cerebros mixto --simular-llm --preguntas 5
```

No se descargan navegadores. Se busca primero `NAVEGADOR`; en Linux, `/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`; en Windows, Edge de `Program Files (x86)` y después Chrome de `Program Files`. Para otra instalación, define `NAVEGADOR` con la ruta al ejecutable. PowerShell: `$env:NAVEGADOR = "C:\ruta\chrome.exe"`. Linux: `NAVEGADOR=/ruta/chrome node run.js ...`.

URL y anon key se leen en tiempo de ejecución del HTML; no hay que copiarlas ni crear archivos de secretos. Hace falta acceso HTTPS a sus CDN y WSS al proyecto Supabase. El servidor escucha solo en `127.0.0.1`, puerto libre, y sirve únicamente el documento del juego. Chromium se ejecuta headless con `--no-sandbox` y configuración temporal escribible dentro de `salida/`, eliminada al cerrar.

## Opciones

|Flag|Valor por defecto|Función|
|---|---|---|
|`--escenario`|`todos`|`partida-completa`, `desconexion`, `tarde-simultaneos`, `anfitrion`|
|`--cerebros`|`aleatorio`|`aleatorio`, `llm`, `mixto`|
|`--preguntas`|5|Cantidad de preguntas de partida completa (1–100)|
|`--tiempo`|12|Segundos de votación, desde la apertura (5–600)|
|`--simular-llm`|desactivado|Evita ejecutar procesos de modelos, también en modo `llm`|
|`--concurrencia`|6|Máximo de llamadas LLM activas, compartido entre jugadores|
|`--pausa-ms`|120|Pausa del cerebro aleatorio|
|`--latencia-llm`|80|Latencia por respuesta del simulador, en milisegundos|
|`--timeout-llm`|70000|Timeout de cada proceso real, en milisegundos|
|`--ayuda`|desactivado|Muestra el uso|

Las conexiones y los votos normales se escalonan 175 ms. La ronda simultánea envía 13 votos con `Promise.all` y comprueba una ventana de ≤50 ms. Las decisiones se preparan juntas y luego se envían: para llamadas reales de ~40 s conviene `--tiempo 180`; 12 s está pensado para aleatorios y simulados. Un timeout de modelo devuelve fallback al azar, pero si ya cerró la ronda el cliente no envía ese voto y las aserciones lo hacen visible.

`mixto` siempre simula los nueve LLM, aunque falte `--simular-llm`. `llm` sin ese flag **sí ejecuta las CLI reales** cuando el gerente lo solicite; las pruebas unitarias y los comandos de verificación anteriores no lo hacen. El reparto editable `REPARTO` y las trece personas están en `src/cerebros/llm.js`: tres Claude, tres Codex, tres Gemini, cuatro aleatorios. El simulador usa respuestas deterministas; en la primera ronda Natalia recibe un timeout inyectado y Silvia JSON roto, ambos con fallback. No consume el timeout real de 70 s.

Las CLI se ejecutan sin shell y en una carpeta temporal vacía. Linux usa `agy` o `codex` en PATH. Windows usa `%LOCALAPPDATA%\agy\bin\agy.exe`; para Codex busca `@openai\codex\bin\codex.js` bajo `%APPDATA%\npm\node_modules`, `%LOCALAPPDATA%\npm\node_modules` o `%ProgramFiles%\nodejs\node_modules`, y lo lanza con el ejecutable de Node, sin invocar shims `.cmd`/`.ps1`. Si no lo encuentra, devuelve fallback con diagnóstico. Los argumentos/modelos siguen el encargo; no se verificaron sesiones reales en el taller. Los procesos abortados se esperan hasta su cierre antes de liberar el cupo y borrar su carpeta.

## Qué comprueba

- **partida-completa:** trece participantes, último voto, sondas de votos cerrados/ronda incorrecta/opción inexistente, conteos, ganancia, acumulados, revelación temprana, avance automático a los 11 s, final y puestos del DOM con empates.
- **desconexion:** tres rondas; en la segunda se desconectan cuatro a +1,5 s, votan los nueve restantes y se comprueba cierre temprano; vuelven desde +4,5 s. En la tercera vuelven antes del cierre y los trece votan. Se mide recepción del estado y restauración de presencia.
- **tarde-simultaneos:** seis iniciales, siete llegadas con primera pregunta abierta, votos a opciones originales comprobados por `voters`, trece en podio y trece votos simultáneos en ronda tres; detecta una nueva transición a reveal, sin confundir reenvíos periódicos.
- **anfitrion:** recarga durante pregunta abierta, lobby para todos, nueva partida completa; narración sin `onend` (15 s) y lenta (6 s), bloqueo durante narración, reloj desde apertura y cierre por tiempo. No cambia timers del juego.

La pantalla se controla con sus botones reales. Para cantidades de preguntas que el select no ofrece (p. ej. 1 o 3), se añade una opción al DOM del navegador y se pulsa `#go`; no se parchea el JS. Las observaciones de estado provienen de los frames WSS enviados por la pantalla real mediante CDP. Los clientes registran sus estados por separado. Node 24 usa su WebSocket nativo: la rama de transporte personalizado de la dependencia antigua omite `setupConnection()` y da timeout.

## Evidencia y salida

Cada escenario deja `salida/<fecha>-<escenario>.json` y `.md`: aserciones con esperado/observado, sala/canal, tiempos, eventos y estados de cada cliente, estados del anfitrión, votos finales de cada jugador con proveedor/razón/fallback, coincidencia con los ganadores, latencia y timeouts por proveedor. Los envíos previos y sondas se verifican en el protocolo; la tabla de votos muestra solo el último voto válido de cada persona.

El proceso termina por sí mismo: exit 0 si todas las aserciones pasan, exit 1 ante un fallo. En ambos casos quita canales, cierra navegador y detiene servidor. Un error se conserva en el reporte; no equivale por sí solo a un defecto del producto. Los defectos confirmados se informan al gerente, sin arreglar `eres-tu.html`. `salida/` y `node_modules/` están ignorados por git.

## Agregar un cerebro

Crea un módulo con `crearCerebro(config)` que devuelva `{ async decidir({nombre, persona, pregunta, opciones, historial, tiempoMs}) }`. La respuesta debe ser `{voto, razon, fallback, ms, modelo}`, con `voto` igual al nombre exacto de una opción. Registra su selección en `src/escenarios/comun.js`, añade su proveedor al reparto y pruebas con `node:test`; usa inyección de procesos o un simulador para no consumir modelos en tests. El historial que recibe contiene pregunta, ganador(es), voto propio y coincidencia, y el prompt LLM toma solo cinco rondas.

Las rutas Windows se prueban mediante plataforma simulada; la integración efectiva de esta entrega se ejecuta en Linux. `npm audit` conserva dos alertas bajas en la versión de Supabase requerida por contrato; no se actualiza esa versión unilateralmente.

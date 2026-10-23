# AGENTS.md: implementar y publicar "Los Sin Nombres"

Lee este archivo completo antes de tocar nada. Está escrito para agentes de código.

## Qué es esto
Una página web estática de una sola pantalla (un solo `index.html`, sin build) para organizar una junta familiar de Halloween el sábado 31 de octubre de 2026, en la casa de la tía Jana. Cada persona elige su nombre, anota qué lleva (comida, ornamentación, desechables, sour) y qué tarea hace, y hay un acertijo con premio para el primero que lo resuelva. Todo lo anotado debe verse en vivo para todos.

Dueño del proyecto: Fabián A. ("Líder supremo"). Idioma de la interfaz y de todo lo que le escribas: **español**.

## Archivos en esta carpeta
- `index.html`: la página completa (HTML + CSS + JS). Ya está terminada y probada con una base de datos simulada.
- `supabase-setup.sql`: crea las tablas y las reglas de seguridad (RLS) en Supabase.
- `LEEME.md`: instrucciones resumidas para humanos.
- `AGENTS.md`: este archivo.

## Tu objetivo
Dejar la página publicada en una URL pública, conectada a Supabase, funcionando para que ~13 familiares (desde el celular) se anoten sin crear cuentas.

## Pasos

### 1. Supabase
1. Pregunta al usuario si usa un proyecto de Supabase existente o crea uno nuevo. **No inventes ni adivines credenciales.**
2. Ejecuta `supabase-setup.sql` completo en el SQL Editor (o con la CLI/MCP de Supabase si está disponible). Si el último bloque (`alter publication supabase_realtime ...`) falla por "ya existe", ignóralo: la página igual se actualiza sola cada 8 segundos.
3. Obtén del proyecto la **Project URL** y la **anon public key** (Project Settings > API). Nunca uses la `service_role` key en el frontend.

### 2. Configurar `index.html`
Dentro del primer `<script>` hay dos variables al comienzo:
```js
var SUPABASE_URL = "PEGA_AQUI_LA_URL_DE_TU_PROYECTO";
var SUPABASE_KEY = "PEGA_AQUI_LA_ANON_KEY";
```
Reemplaza **solo** esos dos valores. No cambies nada más del archivo salvo que el usuario lo pida.

### 3. Publicar
- Es un sitio estático: sirve `index.html` tal cual en la raíz. No necesita Node, bundler ni variables de entorno.
- El usuario suele usar Vercel: crea un proyecto estático apuntando a esta carpeta (sin comando de build, directorio de salida `.`) o súbelo al servidor propio que indique.
- Entrega al usuario la URL final.

### 4. Verificación (hazla antes de decir que terminaste)
Abre la URL publicada y comprueba, idealmente en ancho de celular (~400 px) y en escritorio:
1. No aparece el aviso "No se pudo conectar con la base de datos".
2. Tocar una etiqueta de nombre, por ejemplo "Natalia", la selecciona y aparece la barra "Anotando como".
3. Tocar un plato del menú lo marca en naranja con un ✓ y aparece el nombre debajo.
4. En Supabase (Table Editor > `signups`) aparece la fila con ese nombre.
5. Abrir la URL en otro navegador o ventana privada: se ve lo anotado (puede tardar hasta 8 s).
6. El acertijo: una respuesta incorrecta muestra "Esa no es. Sigue intentando."; una correcta registra una fila en `riddle_winner` y la página muestra el ganador. **No reveles la respuesta en el chat ni en commits.** No la pongas en texto claro en ningún archivo.
7. No hay scroll horizontal en celular y la calabaza 3D del encabezado se ve. Si WebGL falla, debe verse el fantasma de respaldo.

### 5. Limpiar después de probar
Borra todas las filas de prueba de `signups` y `riddle_winner` en Supabase para que la familia empiece con la página en blanco. Confirma al usuario que quedó limpia.

## Reglas importantes (no las rompas)
- **No rediseñes ni "mejores" la interfaz.** El usuario ajustó cada detalle (menú, tareas, textos, tono, sello "Líder supremo"). Cambios solo si él los pide.
- **No agregues** postres, niños, concurso de disfraces, ensaladas, hielo, propuestas de cuotas ni votaciones: fueron quitados a propósito.
- **No muevas el acertijo a un servidor ni cambies su lógica de ganador único.** El ganador se decide por la clave primaria `id = 1` de `riddle_winner`: el primer `insert` gana y el resto recibe el error `23505`.
- **No agregues DELETE** a las reglas de seguridad. Nadie debe poder borrar datos desde la página.
- No añadas frameworks, build steps ni dependencias nuevas. Las librerías vienen por CDN con versión fija (three.js r128, supabase-js 2.45.4).
- No guardes llaves ni datos personales en el repositorio público si lo subes a GitHub. La `anon key` es pública por diseño, pero no subas la `service_role`.
- Si algo del plan no se puede cumplir, di exactamente qué falló. No lo maquilles.

## Cambios frecuentes que el usuario puede pedir (dónde están)
- Lista de nombres: array `SEED` al comienzo del script.
- Menú de comida, ornamentación y desechables: array `MENU`.
- Tareas: array `TASKS`.
- Fecha del evento y cuenta regresiva: constante `FECHA` (el mes va de 0 a 11, octubre = 9).
- Textos del encabezado (reseña, sello): buscar `class="blurb"` y `class="stamp"` en el HTML.
- Tablas y datos: Supabase > Table Editor (`signups`, `riddle_winner`).

## Si hay que resetear
- Dejar todo en blanco: borrar las filas de `signups`.
- Reiniciar el acertijo: borrar la fila de `riddle_winner`.

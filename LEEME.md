# Los Sin Nombres: cómo publicarlo en tu servidor

Son 3 archivos:
- `index.html`: la página completa (un solo archivo).
- `supabase-setup.sql`: crea las dos tablas donde se guardan las anotaciones.
- `LEEME.md`: estas instrucciones.

## Pasos

1. En Supabase, crea un proyecto nuevo (o usa uno existente) y abre **SQL Editor**.
2. Pega todo el contenido de `supabase-setup.sql` y presiona **Run**.
   Si la última parte da error porque "ya estaba", ignóralo.
3. Ve a **Project Settings > API** y copia:
   - **Project URL**
   - **anon public key**
4. Abre `index.html` con un editor de texto y busca estas dos líneas (al comienzo del script):
   ```js
   var SUPABASE_URL = "PEGA_AQUI_LA_URL_DE_TU_PROYECTO";
   var SUPABASE_KEY = "PEGA_AQUI_LA_ANON_KEY";
   ```
   Reemplaza los textos entre comillas por tus dos datos.
5. Sube `index.html` a tu servidor (o a Vercel) y comparte el link por WhatsApp.

## Cosas que conviene saber

- **No necesitan cuenta ni contraseña.** Cada persona elige su etiqueta y listo.
  La "anon key" es pública por diseño. Con estas reglas cualquiera que tenga el link puede anotarse. Para una junta familiar está bien, solo no repartas el link fuera de la familia.
- **Nadie puede borrar datos desde la página.** Si hay que limpiar o corregir algo, hazlo desde **Table Editor** en Supabase (tablas `halloween_signups` y `halloween_riddle_winner`).
- **Para reiniciar el acertijo:** borra la fila de `halloween_riddle_winner`.
- **Para dejar todo en blanco:** borra las filas de `halloween_signups`.
- **Cambiar nombres, platos o tareas:** están en las listas `SEED`, `MENU` y `TASKS` dentro de `index.html`.
- La página carga letras (Google Fonts), la calabaza 3D (three.js) y Supabase desde internet, así que los teléfonos necesitan conexión.

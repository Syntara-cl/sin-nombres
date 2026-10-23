#!/usr/bin/env node
const { parseArgs } = require("node:util");
const { leerConfig } = require("./src/config");
const { abrirServidor } = require("./src/servidor");
const { guardar } = require("./src/reportes");
const escenarios = ["partida-completa", "desconexion", "tarde-simultaneos", "anfitrion"];
function opcionesCLI(args = process.argv.slice(2)) {
  const { values: v } = parseArgs({ args, options: {
    escenario: { type: "string", default: "todos" }, cerebros: { type: "string", default: "aleatorio" },
    preguntas: { type: "string", default: "5" }, tiempo: { type: "string", default: "12" },
    "simular-llm": { type: "boolean", default: false }, concurrencia: { type: "string", default: "6" },
    "pausa-ms": { type: "string", default: "120" }, "latencia-llm": { type: "string", default: "80" },
    "timeout-llm": { type: "string", default: "70000" }, ayuda: { type: "boolean", default: false }
  } });
  if (v.ayuda) return { ayuda: true };
  if (![...escenarios, "todos"].includes(v.escenario)) throw new Error("Escenario desconocido");
  if (!["aleatorio", "llm", "mixto"].includes(v.cerebros)) throw new Error("Cerebro desconocido");
  for (const [nombre, min, max] of [["preguntas", 1, 100], ["tiempo", 5, 600], ["concurrencia", 1, 13], ["pausa-ms", 0, 60000], ["latencia-llm", 0, 60000], ["timeout-llm", 1, 300000]]) {
    const n = Number(v[nombre]); if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${nombre} debe ser entero entre ${min} y ${max}`); v[nombre] = n;
  }
  return { escenario: v.escenario, cerebros: v.cerebros, preguntas: v.preguntas, tiempo: v.tiempo, simularLlm: v["simular-llm"], concurrencia: v.concurrencia, pausaMs: v["pausa-ms"], latenciaLlm: v["latencia-llm"], timeoutLlm: v["timeout-llm"] };
}
async function main() {
  const opciones = opcionesCLI();
  if (opciones.ayuda) { console.log("Uso: node run.js --escenario todos|partida-completa|desconexion|tarde-simultaneos|anfitrion --cerebros aleatorio|llm|mixto --preguntas 5 --tiempo 12 [--simular-llm] [--concurrencia 6] [--pausa-ms 120] [--latencia-llm 80] [--timeout-llm 70000]"); return; }
  const config = leerConfig(), servidor = await abrirServidor(), inicio = Date.now();
  let ok = true;
  try {
    for (const nombre of opciones.escenario === "todos" ? escenarios : [opciones.escenario]) {
      console.log(`Ejecutando ${nombre} (${opciones.cerebros})...`);
      const reporte = await require(`./src/escenarios/${nombre}`)(config, opciones, servidor);
      const archivo = await guardar(reporte);
      const fallos = reporte.aserciones.filter(a => !a.ok);
      console.log(`${nombre}: ${reporte.ok ? "PASA" : "FALLA"}; ${reporte.aserciones.length - fallos.length}/${reporte.aserciones.length} aserciones; ${(reporte.ms / 1000).toFixed(1)} s; ${archivo}.json`);
      for (const a of fallos) console.error(`  FALLÓ ${a.nombre}: ${JSON.stringify(a.evidencia)}`);
      ok &&= reporte.ok;
    }
  } finally { await servidor.cerrar(); }
  console.log(`Total ${(Date.now() - inicio) / 1000} s. Navegadores, canales y servidor cerrados.`);
  process.exitCode = ok ? 0 : 1;
}
if (require.main === module) main().catch(e => { console.error(e.stack); process.exitCode = 1; });
module.exports = { opcionesCLI };

const fs = require("node:fs/promises");
const path = require("node:path");
function resumir(reporte) {
  const proveedores = {};
  for (const ronda of reporte.rondas) for (const v of ronda.votos) {
    const p = proveedores[v.proveedor] ||= { votos: 0, coincidencias: 0, fallbacks: 0, timeouts: 0, latenciasMs: [] };
    p.votos++; p.coincidencias += +v.coincide; p.fallbacks += +v.fallback;
    p.timeouts += +/timeout/i.test(v.razon); p.latenciasMs.push(v.ms);
  }
  for (const p of Object.values(proveedores)) {
    p.tasaCoincidencia = p.coincidencias / p.votos;
    p.latenciaMediaMs = p.latenciasMs.reduce((a, b) => a + b, 0) / p.votos;
  }
  reporte.proveedores = proveedores;
}
const celda = s => String(s ?? "").replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
async function guardar(reporte) {
  resumir(reporte);
  const dir = path.resolve(__dirname, "../salida"); await fs.mkdir(dir, { recursive: true });
  const base = path.join(dir, `${reporte.inicio.replace(/[:.]/g, "-")}-${reporte.escenario}`);
  await fs.writeFile(base + ".json", JSON.stringify(reporte, null, 2) + "\n");
  let md = `# ${reporte.escenario}\n\nEstado: ${reporte.ok ? "PASA" : "FALLA"}. Sala: ${reporte.sala}. Duración: ${reporte.ms} ms.\n\n## Aserciones\n\n`;
  for (const a of reporte.aserciones) md += `- ${a.ok ? "✓" : "✗"} ${a.nombre}: ${JSON.stringify(a.evidencia)}\n`;
  md += "\n## Proveedores\n\n|Proveedor|Votos|Coincidencia|Latencia media (ms)|Fallbacks|Timeouts|\n|---|---:|---:|---:|---:|---:|\n";
  for (const [nombre, p] of Object.entries(reporte.proveedores)) md += `|${nombre}|${p.votos}|${(100 * p.tasaCoincidencia).toFixed(1)}%|${p.latenciaMediaMs.toFixed(1)}|${p.fallbacks}|${p.timeouts}|\n`;
  for (const r of reporte.rondas) {
    md += `\n## Ronda ${r.round}: ${r.pregunta}\n\n|Jugador|Proveedor|Voto|Razón|Fallback|Latencia (ms)|\n|---|---|---|---|---|---:|\n`;
    for (const v of r.votos) md += `|${[v.name, v.proveedor, v.voto, v.razon, v.fallback, v.ms].map(celda).join("|")}|\n`;
  }
  md += "\n## Notas y hallazgos\n\n" + [...reporte.notas, ...reporte.hallazgos].map(n => `- ${n}`).join("\n") + "\n";
  await fs.writeFile(base + ".md", md);
  return base;
}
module.exports = { guardar, resumir };

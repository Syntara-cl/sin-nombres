const { test } = require("node:test");
const assert = require("node:assert/strict");
const { opcionesCLI } = require("../run");
const { abrirServidor } = require("../src/servidor");
const { resumir } = require("../src/reportes");
const { Contexto } = require("../src/escenarios/comun");
test("historial conserva el último voto válido cuando un jugador cambia de opción", async () => {
  const c = new Contexto({}, { concurrencia: 1, tiempo: 12 }, {}, "unitario");
  const at = Date.now();
  const options = [{ slug: "a", name: "A" }, { slug: "b", name: "B" }];
  c.tv.estados = [
    { phase: "question", round: 2, open: false, at: at - 100, options },
    { phase: "question", round: 2, open: true, at: at - 50, options, q: "Pregunta" },
    { phase: "reveal", round: 2, at, options, counts: { a: 0, b: 1 }, voters: { a: [], b: ["A"] }, winners: ["b"], gained: { a: 100 }, scores: { a: 100 }, votedBy: { a: "b" } }
  ];
  c.jugadores = [{ slug: "a", votos: [
    { slug: "a", name: "A", round: 2, choice: "a", voto: "A", at: at - 40 },
    { slug: "a", name: "A", round: 2, choice: "b", voto: "B", at: at - 10 }
  ], historial: [] }];
  c.votarGrupo = async () => {};
  await c.ronda(2);
  assert.equal(c.jugadores[0].historial[0].voto, "B");
  assert.equal(c.jugadores[0].historial[0].coincidio, true);
});
test("CLI valida escenarios, límites y simulación explícita", () => {
  assert.equal(opcionesCLI([]).preguntas, 5);
  assert.equal(opcionesCLI(["--simular-llm"]).simularLlm, true);
  assert.throws(() => opcionesCLI(["--tiempo", "4"]));
  assert.throws(() => opcionesCLI(["--escenario", "produccion"]));
  assert.throws(() => opcionesCLI(["--concurrencia", "0"]));
});
test("servidor local sirve HTML real y no expone archivos del repositorio", async () => {
  const s = await abrirServidor();
  try {
    const pagina = await fetch(s.url + "?tv=1");
    assert.equal(pagina.status, 200);
    assert.match(await pagina.text(), /function runTV\(\)/);
    for (const ruta of ["/.git/config", "/.encargo/ENCARGO.md", "/AGENTS.md"]) assert.equal((await fetch(new URL(ruta, s.url))).status, 404);
  } finally { await s.cerrar(); }
});
test("reporte calcula latencias, coincidencias, fallback y timeout por proveedor", () => {
  const r = { rondas: [{ votos: [
    { proveedor: "codex", coincide: true, fallback: false, razon: "consenso", ms: 30 },
    { proveedor: "codex", coincide: false, fallback: true, razon: "Timeout del modelo", ms: 50 }
  ] }] };
  resumir(r);
  assert.deepEqual(r.proveedores.codex, { votos: 2, coincidencias: 1, fallbacks: 1, timeouts: 1, latenciasMs: [30, 50], tasaCoincidencia: 0.5, latenciaMediaMs: 40 });
});

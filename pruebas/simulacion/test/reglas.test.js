const { test } = require("node:test");
const assert = require("node:assert/strict");
const { slug, crearSala, canalDeSala, resolverNavegador } = require("../src/config");
const { verificarRonda, verificarPodio, verificarTransiciones, verificarPresencia } = require("../src/verificador");

test("slug coincide con el contrato y limita a 40 caracteres", () => {
  assert.equal(slug(" Tía Jana! "), "tia-jana");
  assert.equal(slug("Fabián A."), "fabian-a");
  assert.equal(slug("a".repeat(100)).length, 40);
});
test("salas únicas de prueba y rechazo explícito de sala real", () => {
  const salas = Array.from({ length: 100 }, crearSala);
  assert.equal(new Set(salas).size, 100);
  for (const sala of salas) assert.match(canalDeSala(sala), /^eres-tu-v1-prueba-\d{8}-\d{6}-[a-z]{4}$/);
  assert.throws(() => canalDeSala(""));
  assert.throws(() => canalDeSala("eres-tu-v1"));
});
test("navegador Linux, Windows Edge/Chrome y prioridad NAVEGADOR", () => {
  const exists = () => true;
  assert.match(resolverNavegador({ platform: "linux", env: {}, exists }), /chromium-1243/);
  assert.match(resolverNavegador({ platform: "win32", env: {}, exists }), /Microsoft\\Edge/);
  assert.match(resolverNavegador({ platform: "win32", env: {}, exists: p => p.includes("Google") }), /Google\\Chrome/);
  assert.equal(resolverNavegador({ platform: "linux", env: { NAVEGADOR: "/mi/chrome" }, exists }), "/mi/chrome");
  assert.throws(() => resolverNavegador({ platform: "win32", env: {}, exists: () => false }));
});
const votos = [{ slug: "a", name: "A", choice: "a" }, { slug: "b", name: "B", choice: "b" }];
const resultado = { options: [{ slug: "a" }, { slug: "b" }], counts: { a: 1, b: 1 }, voters: { a: ["A"], b: ["B"] }, winners: ["a", "b"], gained: { a: 100, b: 100 }, scores: { a: 100, b: 100 }, votedBy: { a: "a", b: "b" } };
test("recuento, empate, último voto y puntaje acumulado", () => {
  assert.equal(verificarRonda(resultado, [{ ...votos[0], choice: "b" }, ...votos], {}).every(a => a.ok), true);
});
test("detecta conteo y puntaje deliberadamente incorrectos", () => {
  const mal = structuredClone(resultado); mal.gained.a = 200; mal.counts.a = 7; mal.scores.b = 200;
  const checks = verificarRonda(mal, votos, {});
  for (const nombre of ["conteo", "ganancia", "acumulado"]) assert.equal(checks.find(a => a.nombre === nombre).ok, false);
});
test("podio comprueba orden, integrantes y puestos compartidos", () => {
  const rank = [{ slug: "a", score: 100 }, { slug: "b", score: 100 }, { slug: "c", score: 0 }];
  assert.equal(verificarPodio(rank, ["a", "b", "c"], [1, 1, 3]).every(a => a.ok), true);
  assert.equal(verificarPodio(rank, ["a", "b", "c"], [1, 2, 3]).every(a => a.ok), false);
  assert.equal(verificarPodio([rank[2], rank[0], rank[1]], ["a", "b", "c"], [3, 1, 1]).every(a => a.ok), false);
});
test("podio rechaza puestos omitidos o que no sean un arreglo", () => {
  const rank = [{ slug: "a", score: 100 }];
  for (const puestos of [undefined, null, { 0: 1 }]) {
    assert.equal(verificarPodio(rank, ["a"], puestos).find(a => a.nombre === "puestos compartidos").ok, false);
  }
});
test("presencia restaurada falla con 12 jugadores y pasa con 13, sin contar TV", () => {
  const presencia = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`j${i}`, [{ slug: `j${i}`, name: `Jugador ${i}` }]]));
  presencia.tv = [{ tv: true }];
  assert.equal(verificarPresencia(presencia).ok, false);
  assert.equal(verificarPresencia(presencia).evidencia.jugadores, 12);
  presencia.j12 = [{ slug: "j12", name: "Jugador 12" }];
  assert.equal(verificarPresencia(presencia).ok, true);
});
test("reenvíos no son doble reveal; regresar a question y revelar sí lo es", () => {
  const q = { phase: "question", round: 3 }, r = { phase: "reveal", round: 3 };
  assert.equal(verificarTransiciones([q, r, r, r], 3).ok, true);
  assert.equal(verificarTransiciones([q, r, q, r], 3).ok, false);
});

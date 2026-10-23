const { ejecutar } = require("./comun");
const { esperar, pausa } = require("../util");
module.exports = (config, opciones, servidor) => ejecutar(config, opciones, servidor, "anfitrion", async c => {
  await c.abrir(); await c.empezar(1);
  await esperar(() => c.tv.estados.find(s => s.phase === "question" && s.open));
  await pausa(1500);
  const desde = Date.now(); await c.tv.recargar();
  await esperar(() => c.jugadores.every(j => j.estado.phase === "lobby" && j.estado.at >= desde), 6000, "todos vuelven al lobby");
  c.check("recarga pierde partida y avisa lobby ≤6 s", c.jugadores.every(j => j.estado.at - desde <= 6000), c.jugadores.map(j => ({ nombre: j.nombre, ms: j.estado.at - desde })));
  await c.tv.esperarJugadores(13);
  c.check("13 jugadores siguen presentes tras recarga", true, { conectados: 13 });
  // Separar los estados de la partida perdida: su round=1 se reutiliza al reiniciar.
  c.reporte.partidaPerdida = c.tv.estados.splice(0);
  for (const j of c.jugadores) j.votos = [];
  await c.empezar(1); await c.ronda(1); await c.final(1);
  c.reporte.notas.push("La recarga reinicia al lobby y conserva los jugadores; se completó una partida nueva.");

  for (const [modo, vozMs, esperado] of [["sin onend", -1, 15000], ["lenta", 6000, 6000]]) {
    await c.tv.page.click("#again"); await c.tv.esperarJugadores(13); await c.tv.voz(vozMs);
    const inicio = c.tv.estados.length;
    await c.empezar(1);
    const closed = await esperar(() => c.tv.estados.slice(inicio).find(s => s.phase === "question" && !s.open));
    const j = c.jugadores[0];
    await esperar(() => j.estado.phase === "question" && !j.estado.open);
    // Sonda de protocolo: incluso si alguien envía un voto durante narración, debe ignorarse.
    await j.votar(closed.options[0].slug, 1, { sonda: true }, true);
    await pausa(1000);
    c.check(`${modo}: celulares bloqueados durante narración`, c.jugadores.every(j => j.estado.phase === "question" && !j.estado.open), c.jugadores.map(j => ({ nombre: j.nombre, open: j.estado.open })));
    const open = await esperar(() => c.tv.estados.slice(inicio).find(s => s.phase === "question" && s.open), 18000, `narración ${modo}`);
    c.check(`${modo}: apertura en tiempo esperado`, Math.abs(open.at - closed.at - esperado) <= 2000, { ms: open.at - closed.at, esperado });
    c.check(`${modo}: reloj empieza al abrir`, open.left >= opciones.tiempo * 1000 - 250, { left: open.left, qtime: open.qtime });
    c.check(`${modo}: voto cerrado ignorado`, open.voted === 0, { voted: open.voted });
    // Esperar cierre por reloj también comprueba que la sonda no reaparece en resultados.
    const r = await esperar(() => c.tv.estados.slice(inicio).find(s => s.phase === "reveal"), (opciones.tiempo + 3) * 1000, "cierre por reloj");
    c.check(`${modo}: cierre tras tiempo completo`, Math.abs(r.at - open.at - opciones.tiempo * 1000 - 200) < 1500, { ms: r.at - open.at });
    c.check(`${modo}: sonda no suma puntos`, Object.values(r.counts).every(n => n === 0) && Object.keys(r.gained).length === 0, { counts: r.counts, gained: r.gained });
    await c.tv.siguiente(); await c.tv.page.waitForSelector("#again");
  }
});

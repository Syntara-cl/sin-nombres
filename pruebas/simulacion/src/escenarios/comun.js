const { Jugador } = require("../jugador");
const { Anfitrion } = require("../anfitrion");
const { crearSala, canalDeSala } = require("../config");
const { esperar, pausa } = require("../util");
const { asercion, verificarRonda, verificarPodio, verificarTransiciones, verificarPresencia } = require("../verificador");
const { crearCerebro: aleatorio } = require("../cerebros/aleatorio");
const { crearCerebro: llm, REPARTO, PERSONAS, crearLimitador } = require("../cerebros/llm");

class Contexto {
  constructor(config, opciones, servidor, nombre) {
    this.config = config; this.opciones = opciones; this.servidor = servidor;
    this.reporte = { escenario: nombre, sala: crearSala(), inicio: new Date().toISOString(), aserciones: [], notas: [], rondas: [], hallazgos: [] };
    this.reporte.canal = canalDeSala(this.reporte.sala);
    this.tv = new Anfitrion(); this.jugadores = []; this.anteriores = {};
    this.limitador = crearLimitador(opciones.concurrencia);
  }
  check(nombre, ok, evidencia) { this.reporte.aserciones.push(asercion(nombre, ok, evidencia)); }
  async abrir(n = 13) {
    await this.tv.abrir(this.servidor.url, this.reporte.sala, this.opciones.tiempo, 300);
    await this.agregar(this.config.nombres.slice(0, n));
    await this.tv.esperarJugadores(n);
    this.check("sala de prueba aislada", this.reporte.canal !== "eres-tu-v1" && this.reporte.sala.startsWith("prueba-"), this.reporte.canal);
  }
  async agregar(nombres) {
    for (const nombre of nombres) {
      const j = new Jugador(nombre, this.config, this.reporte.sala); this.jugadores.push(j);
      j.proveedor = this.opciones.cerebros === "aleatorio" ? "aleatorio" : REPARTO[nombre];
      j.historial = [];
      j.cerebro = j.proveedor === "aleatorio" ? aleatorio({ latenciaMs: this.opciones.pausaMs }) : llm({ proveedor: j.proveedor, simular: this.opciones.simularLlm || this.opciones.cerebros === "mixto", latenciaMs: this.opciones.latenciaLlm, timeoutMs: this.opciones.timeoutLlm, limitador: this.limitador });
      const desde = Date.now();
      await j.conectar();
      await esperar(() => j.estados.find(s => s.at >= desde), 4000, `estado inicial ${nombre}`);
      const ms = Date.now() - desde;
      this.check(`estado al entrar: ${nombre}`, ms <= 4000, { ms, phase: j.estado.phase });
      await pausa(175);
    }
  }
  async empezar(n) {
    this.anteriores = Object.fromEntries(this.jugadores.map(j => [j.slug, 0]));
    await this.tv.empezar(n);
  }
  estado(phase, round, desde = 0) { return this.tv.estados.find(s => s.phase === phase && s.round === round && s.at >= desde); }
  async esperarEstado(phase, round, timeout = (this.opciones.tiempo + 20) * 1000, desde = 0) {
    return esperar(() => this.estado(phase, round, desde), timeout, `${phase} ronda ${round}`);
  }
  async reconectar(grupo) {
    for (const j of grupo) {
      const desde = Date.now(); await j.conectar();
      const s = await esperar(() => j.estados.find(s => s.at >= desde), 4000, `reconexión ${j.nombre}`);
      this.check(`estado tras reconectar ${j.nombre}`, s.at - desde <= 4000, { ms: s.at - desde, phase: s.phase, round: s.round });
      await pausa(175);
    }
    await esperar(() => verificarPresencia(this.jugadores[0].presencia).ok, 5000, "presencia vuelve a 13");
    this.reporte.aserciones.push(verificarPresencia(this.jugadores[0].presencia));
  }
  async decidir(j, q) {
    const decision = await j.cerebro.decidir({ nombre: j.nombre, persona: PERSONAS[j.nombre], pregunta: q.q, opciones: q.options.map(o => o.name), historial: j.historial, tiempoMs: q.left });
    return { ...decision, proveedor: j.proveedor, choice: q.options.find(o => o.name === decision.voto)?.slug };
  }
  async votarGrupo(grupo, q, simultaneos = false) {
    const decisiones = await Promise.all(grupo.map(j => this.decidir(j, q)));
    if (simultaneos) {
      const inicio = Date.now();
      await Promise.all(grupo.map((j, i) => j.votar(decisiones[i].choice, q.round, decisiones[i])));
      const marcas = grupo.map(j => j.votos.at(-1).at);
      this.check("ventana de votos simultáneos ≤50 ms", Math.max(...marcas) - Math.min(...marcas) <= 50, { inicio, marcas });
    } else {
      for (let i = 0; i < grupo.length; i++) { await grupo[i].votar(decisiones[i].choice, q.round, decisiones[i]); await pausa(175); }
    }
  }
  async ronda(round, { tarde = false, simultaneos = false, corte = "" } = {}) {
    const closed = await this.esperarEstado("question", round);
    if (round === 1 && !tarde) await this.jugadores[0].votar(closed.options[0].slug, round, { sonda: true }, true);
    const q = await esperar(() => this.tv.estados.find(s => s.phase === "question" && s.round === round && s.open), 18000, "abrir votación");
    this.check(`r${round}: narración cerrada antes de abrir`, closed.open === false && q.at >= closed.at, { closed: closed.at, open: q.at });
    if (round === 1 && !tarde) {
      this.check("voto durante narración ignorado", q.voted === 0, { voted: q.voted });
      await this.jugadores[0].votar(q.options[0].slug, round + 20, { sonda: true }, true);
      await this.jugadores[0].votar("opcion-inexistente", round, { sonda: true }, true);
      await this.jugadores[0].votar(q.options[0].slug, round, { voto: q.options[0].name, razon: "Voto inicial que cambiará", proveedor: this.jugadores[0].proveedor, fallback: false, ms: 0 });
      await pausa(175);
      await this.jugadores[0].votar(q.options[1].slug, round, { voto: q.options[1].name, razon: "Cambio de voto", proveedor: this.jugadores[0].proveedor, fallback: false, ms: 0 });
    }
    if (tarde) {
      await this.agregar(this.config.nombres.slice(6));
      await esperar(() => Object.values(this.jugadores[0].presencia).flat().filter(p => p.slug).length === 13, 5000, "llegadas tardías presentes");
    }
    if (corte) {
      const grupo = this.jugadores.slice(-4);
      await pausa(Math.max(0, q.at + 1500 - Date.now()));
      await Promise.all(grupo.map(j => j.desconectar()));
      await esperar(() => Object.values(this.jugadores[0].presencia).flat().filter(p => p.slug).length === 9, 4000, "presencia baja a 9");
      if (corte === "cierre") await this.votarGrupo(this.jugadores.slice(0, 9), q);
      await pausa(Math.max(0, q.at + 4500 - Date.now()));
      await this.reconectar(grupo);
      if (corte === "abierto") await this.votarGrupo(this.jugadores, q);
      else this.check("reconectados salen del estado anterior", grupo.every(j => ["reveal", "question"].includes(j.estado.phase) && (j.estado.phase !== "question" || j.estado.round > round)), grupo.map(j => ({ nombre: j.nombre, phase: j.estado.phase, round: j.estado.round })));
      this.reporte.notas.push(`Ronda ${round}: cuatro desconectados a +1,5 s; reconexión desde +4,5 s; modo ${corte}.`);
    } else await this.votarGrupo(this.jugadores, q, simultaneos);
    const r = await this.esperarEstado("reveal", round);
    const votos = this.jugadores.flatMap(j => j.votos.filter(v => v.round === round && !v.sonda));
    const checks = verificarRonda(r, votos, this.anteriores);
    this.reporte.aserciones.push(...checks.map(a => ({ ...a, nombre: `r${round}: ${a.nombre}` })));
    this.reporte.aserciones.push(verificarTransiciones(this.tv.estados, round));
    this.check(`r${round}: duración acotada`, r.at - closed.at <= (this.opciones.tiempo + 20) * 1000, { ms: r.at - closed.at });
    const cantidad = corte === "cierre" ? 9 : 13;
    if (new Set(votos.map(v => v.slug)).size === cantidad) {
      const ultimo = Math.max(...votos.map(v => v.at));
      this.check(`r${round}: revelación anticipada ≤1,5 s`, r.at - ultimo <= 1500 && r.at >= ultimo, { ms: r.at - ultimo, votos: cantidad });
    }
    if (tarde) for (const j of this.jugadores.slice(6)) {
      const voto = votos.find(v => v.slug === j.slug);
      const aceptado = r.voters[voto.choice]?.includes(j.nombre);
      this.check(`voto tardío aceptado: ${j.nombre}`, aceptado, { voto: voto.choice, voters: r.voters[voto.choice] });
      if (!aceptado) this.reporte.hallazgos.push(`Voto tardío ignorado: ${j.nombre}`);
    }
    const ultimos = Object.values(Object.fromEntries(votos.map(v => [v.slug, v])));
    const tabla = ultimos.map(v => ({ ...v, coincide: r.winners.includes(v.choice) }));
    this.reporte.rondas.push({ round, pregunta: q.q, votos: tabla, resultado: r });
    for (const j of this.jugadores) { const v = ultimos.find(v => v.slug === j.slug); j.historial.push({ pregunta: q.q, ganador: r.options.filter(o => r.winners.includes(o.slug)).map(o => o.name).join(", "), voto: v?.voto, coincidio: v ? r.winners.includes(v.choice) : false }); }
    this.anteriores = { ...r.scores };
    return r;
  }
  async final(total) {
    const f = await this.esperarEstado("final", total);
    await esperar(() => this.jugadores.every(j => j.estado.phase === "final"), 4000, "todos reciben final");
    this.check("13 clientes reciben final", this.jugadores.length === 13 && this.jugadores.every(j => j.estado.phase === "final"), this.jugadores.map(j => ({ nombre: j.nombre, phase: j.estado.phase })));
    await this.tv.page.waitForSelector(".podium .p");
    const puestos = await this.tv.page.$$eval(".podium .n", els => els.map(e => +e.textContent));
    this.reporte.aserciones.push(...verificarPodio(f.rank, this.jugadores.map(j => j.slug), puestos));
    this.check("DOM final coincide con broadcast", await this.tv.fase() === "final", { puestos });
  }
  async cerrar() {
    const resultados = await Promise.allSettled(this.jugadores.map(j => j.cerrar()));
    await this.tv.cerrar();
    this.check("canales cerrados", resultados.every(r => r.status === "fulfilled"), resultados.map(r => r.status));
    this.reporte.erroresNavegador = this.tv.errores;
    this.reporte.estadosAnfitrion = this.tv.estados;
    this.reporte.clientes = this.jugadores.map(j => ({ nombre: j.nombre, eventos: j.eventos, estados: j.estados }));
  }
}
async function ejecutar(config, opciones, servidor, nombre, fn) {
  const c = new Contexto(config, opciones, servidor, nombre), inicio = Date.now();
  try { await fn(c); }
  catch (e) { c.check("ejecución sin errores", false, e.stack); c.reporte.hallazgos.push(e.message); }
  finally { try { await c.cerrar(); } catch (e) { c.check("limpieza", false, e.message); } }
  c.reporte.ms = Date.now() - inicio;
  c.reporte.ok = c.reporte.aserciones.every(a => a.ok);
  return c.reporte;
}
module.exports = { Contexto, ejecutar };

const { isDeepStrictEqual: igual } = require("node:util");
const asercion = (nombre, ok, evidencia) => ({ nombre, ok: Boolean(ok), evidencia });
function verificarPresencia(presencia) {
  const jugadores = Object.values(presencia).flat().filter(p => p.slug).length;
  return asercion("presencia restaurada a 13", jugadores === 13, { jugadores });
}
function verificarRonda(s, enviados, anteriores) {
  const votos = {}; enviados.forEach(v => { votos[v.slug] = v; });
  const counts = Object.fromEntries(s.options.map(o => [o.slug, 0]));
  const voters = Object.fromEntries(s.options.map(o => [o.slug, []]));
  for (const v of Object.values(votos)) { if (v.choice in counts) { counts[v.choice]++; voters[v.choice].push(v.name); } }
  const max = Math.max(0, ...Object.values(counts));
  const winners = Object.keys(counts).filter(k => max > 0 && counts[k] === max).sort();
  const gained = {}, scores = { ...anteriores };
  for (const v of Object.values(votos)) if (winners.includes(v.choice)) { gained[v.slug] = 100; scores[v.slug] = (scores[v.slug] || 0) + 100; }
  const ordenar = x => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, [...v].sort()]));
  return [
    asercion("conteo", igual(s.counts, counts), { esperado: counts, recibido: s.counts }),
    asercion("votantes", igual(ordenar(s.voters), ordenar(voters)), { esperado: voters, recibido: s.voters }),
    asercion("último voto", igual(s.votedBy, Object.fromEntries(Object.entries(votos).map(([k, v]) => [k, v.choice]))), s.votedBy),
    asercion("ganadores", igual([...s.winners].sort(), winners), { esperado: winners, recibido: s.winners }),
    asercion("ganancia", igual(s.gained, gained), { esperado: gained, recibido: s.gained }),
    asercion("acumulado", igual(s.scores, scores), { esperado: scores, recibido: s.scores })
  ];
}
function verificarPodio(rank, participantes, puestos) {
  const esperados = rank.map(r => 1 + rank.filter(x => x.score > r.score).length);
  return [asercion("orden del podio", rank.every((r, i) => !i || rank[i - 1].score >= r.score), rank),
    asercion("integrantes del podio", igual(rank.map(r => r.slug).sort(), [...participantes].sort()), rank),
    asercion("puestos compartidos", Array.isArray(puestos) && igual(puestos, esperados), { esperados, puestos })];
}
function verificarTransiciones(estados, round) {
  let previo = "", n = 0;
  for (const s of estados) { const key = `${s.phase}:${s.round}`; if (key !== previo && s.phase === "reveal" && s.round === round) n++; previo = key; }
  return asercion("reveal único", n === 1, { round, transiciones: n });
}
module.exports = { asercion, verificarRonda, verificarPodio, verificarTransiciones, verificarPresencia };

const { ejecutar } = require("./comun");
module.exports = (config, opciones, servidor) => ejecutar(config, opciones, servidor, "partida-completa", async c => {
  await c.abrir(); await c.empezar(opciones.preguntas);
  for (let r = 1; r <= opciones.preguntas; r++) {
    const resultado = await c.ronda(r);
    if (r < opciones.preguntas) {
      const proxima = await c.esperarEstado("question", r + 1);
      c.check(`r${r}: avance automático a los 11 s`, Math.abs(proxima.at - resultado.at - 11000) <= 1500, { ms: proxima.at - resultado.at });
    }
  }
  await c.final(opciones.preguntas);
});

const { ejecutar } = require("./comun");
module.exports = (config, opciones, servidor) => ejecutar(config, opciones, servidor, "tarde-simultaneos", async c => {
  await c.abrir(6); await c.empezar(3);
  await c.ronda(1, { tarde: true });
  await c.ronda(2);
  const r = await c.ronda(3, { simultaneos: true });
  c.check("13 votos concurrentes contados", Object.values(r.counts).reduce((a, b) => a + b, 0) === 13, r.counts);
  await c.final(3);
});

const { ejecutar } = require("./comun");
module.exports = (config, opciones, servidor) => ejecutar(config, opciones, servidor, "desconexion", async c => {
  await c.abrir(); await c.empezar(3);
  await c.ronda(1);
  await c.ronda(2, { corte: "cierre" });
  await c.ronda(3, { corte: "abierto" });
  await c.final(3);
});

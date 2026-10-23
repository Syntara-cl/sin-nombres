const pausa = ms => new Promise(resolve => setTimeout(resolve, ms));
async function esperar(fn, timeout = 10000, descripcion = "condición") {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) { const valor = await fn(); if (valor) return valor; await pausa(25); }
  throw new Error(`Tiempo agotado (${timeout} ms): ${descripcion}`);
}
module.exports = { pausa, esperar };

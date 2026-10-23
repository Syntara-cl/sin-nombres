'use strict';

function crearCerebro({ latenciaMs = 120, aleatorio = Math.random } = {}) {
  return {
    async decidir({ opciones }) {
      const inicio = Date.now();
      if (!Array.isArray(opciones) || !opciones.length) throw new Error('El cerebro necesita opciones');
      if (latenciaMs > 0) await new Promise(resolve => setTimeout(resolve, latenciaMs));
      const voto = opciones[Math.min(opciones.length - 1, Math.floor(aleatorio() * opciones.length))];
      return { voto, razon: 'Voto espontáneo', fallback: false, ms: Date.now() - inicio, modelo: 'aleatorio' };
    }
  };
}

module.exports = { crearCerebro };

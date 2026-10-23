const { createClient } = require("@supabase/supabase-js");
const { slug, canalDeSala } = require("./config");
class Jugador {
  constructor(nombre, config, sala) {
    this.nombre = nombre; this.slug = slug(nombre); this.canal = canalDeSala(sala);
    this.estados = []; this.eventos = []; this.votos = []; this.presencia = {};
    // Node 24 incluye WebSocket. En realtime-js 2.10.x la rama transport omite setupConnection().
    this.client = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, realtime: { params: { eventsPerSecond: 20 } } });
  }
  async conectar() {
    this.ch = this.client.channel(this.canal, { config: { broadcast: { self: false }, presence: { key: this.slug } } });
    this.ch.on("broadcast", { event: "state" }, ({ payload }) => { this.estado = { at: Date.now(), ...payload }; this.estados.push(this.estado); });
    this.ch.on("presence", { event: "sync" }, () => { this.presencia = this.ch.presenceState(); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No conectó ${this.nombre}: Realtime sin respuesta`)), 12000);
      this.ch.subscribe(async status => {
        this.eventos.push({ at: Date.now(), status });
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          try { await this.ch.track({ slug: this.slug, name: this.nombre }); await this.hello(); resolve(); } catch (e) { reject(e); }
        } else if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) { clearTimeout(timer); reject(new Error(`Realtime ${this.nombre}: ${status}`)); }
      });
    });
  }
  hello() { return this.ch.send({ type: "broadcast", event: "hello", payload: { slug: this.slug } }); }
  async votar(choice, round = this.estado?.round, detalle = {}, forzar = false) {
    if (!forzar && (this.estado?.phase !== "question" || !this.estado.open)) return false;
    const voto = { at: Date.now(), slug: this.slug, name: this.nombre, round, choice, ...detalle };
    this.votos.push(voto);
    const status = await this.ch.send({ type: "broadcast", event: "vote", payload: { slug: this.slug, name: this.nombre, round, choice } });
    voto.envio = status;
    if (status !== "ok") throw new Error(`Voto sin enviar ${this.nombre}: ${status}`);
    return true;
  }
  async desconectar() { if (this.ch) { await this.client.removeChannel(this.ch); this.ch = null; } this.client.realtime.disconnect(); }
  async cerrar() { await this.desconectar(); await this.client.removeAllChannels(); }
}
module.exports = { Jugador };

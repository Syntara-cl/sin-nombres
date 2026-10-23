const puppeteer = require("puppeteer-core");
const fs = require("node:fs/promises");
const path = require("node:path");
const { resolverNavegador, canalDeSala } = require("./config");
class Anfitrion {
  constructor() { this.estados = []; this.errores = []; }
  async abrir(url, sala, tiempo, vozMs = 30) {
    canalDeSala(sala);
    const salida = path.resolve(__dirname, "../salida"); await fs.mkdir(salida, { recursive: true });
    this.perfil = await fs.mkdtemp(path.join(salida, "chrome-"));
    this.browser = await puppeteer.launch({ executablePath: resolverNavegador(), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"], protocolTimeout: 30000,
      env: { ...process.env, XDG_CONFIG_HOME: this.perfil, XDG_CACHE_HOME: this.perfil } });
    this.page = await this.browser.newPage();
    this.page.on("pageerror", e => this.errores.push(e.message));
    this.page.on("requestfailed", r => this.errores.push(`${new URL(r.url()).hostname}: ${r.failure()?.errorText}`));
    const cdp = await this.page.createCDPSession(); await cdp.send("Network.enable");
    cdp.on("Network.webSocketFrameSent", ({ response }) => {
      try {
        const m = JSON.parse(response.payloadData);
        const p = Array.isArray(m) ? m[4] : m.payload;
        if (p?.event === "state") this.estados.push({ at: Date.now(), ...p.payload });
      } catch { /* heartbeat o frame ajeno al juego */ }
    });
    await this.page.evaluateOnNewDocument(ms => {
      localStorage.setItem("sn_unlock", "6860280117649515");
      window.__vozMs = ms;
      let timer;
      Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
        getVoices: () => [], cancel: () => clearTimeout(timer),
        speak: u => { if (window.__vozMs >= 0) timer = setTimeout(() => u.onend?.(), window.__vozMs); }
      } });
    }, vozMs);
    const destino = new URL(url); destino.search = new URLSearchParams({ tv: "1", sala, t: tiempo });
    await this.page.goto(destino.href, { waitUntil: "load", timeout: 30000 });
    await this.page.waitForSelector("#go", { timeout: 20000 });
  }
  async esperarJugadores(n) { await this.page.waitForFunction(n => document.querySelectorAll(".chip").length === n, { timeout: 12000 }, n); }
  async empezar(n) {
    // El producto ofrece solo tamaños prefijados; añadir una opción al select permite probar N sin alterar su lógica.
    await this.page.evaluate(n => { const s = document.querySelector("#cnt"); if (![...s.options].some(o => +o.value === n)) s.add(new Option(String(n), String(n))); s.value = String(n); }, n);
    await this.page.click("#go");
  }
  async fase() { return this.page.evaluate(() => document.querySelector("#go") ? "lobby" : document.querySelector("#skip") ? "question" : document.querySelector("#nx") ? "reveal" : document.querySelector("#again") ? "final" : "desconocida"); }
  async recargar() { await this.page.reload({ waitUntil: "load" }); await this.page.waitForSelector("#go"); }
  async voz(ms) { await this.page.evaluate(ms => { window.__vozMs = ms; }, ms); }
  async siguiente() { await this.page.waitForSelector("#nx"); await this.page.click("#nx"); }
  async cerrar() { try { if (this.browser) await this.browser.close(); } finally { if (this.perfil) await fs.rm(this.perfil, { recursive: true, force: true }); } }
}
module.exports = { Anfitrion };

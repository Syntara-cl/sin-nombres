const fs = require("node:fs");
const path = require("node:path");
const { randomInt } = require("node:crypto");
const RAIZ = path.resolve(__dirname, "../../..");
const slug = n => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const usadas = new Set();
function crearSala() {
  const fecha = new Date().toISOString().replace(/[-:TZ.]/g, "");
  let sala;
  do { sala = `prueba-${fecha.slice(0, 8)}-${fecha.slice(8, 14)}-${Array.from({ length: 4 }, () => String.fromCharCode(97 + randomInt(26))).join("")}`; } while (usadas.has(sala));
  usadas.add(sala); return sala;
}
function canalDeSala(sala) {
  if (!/^prueba-\d{8}-\d{6}-[a-z]{4}$/.test(sala)) throw new Error("Solo se permiten salas únicas de prueba");
  return "eres-tu-v1-" + slug(sala);
}
function leerConfig() {
  const html = fs.readFileSync(path.join(RAIZ, "eres-tu.html"), "utf8");
  const valor = nombre => { const m = html.match(new RegExp(`var ${nombre} = "([^"]+)"`)); if (!m) throw new Error(`Falta ${nombre}`); return m[1]; };
  return { url: valor("SUPABASE_URL"), key: valor("SUPABASE_KEY"), nombres: JSON.parse(html.match(/var SEED = (\[[^;]+\]);/)[1]) };
}
function resolverNavegador({ platform = process.platform, env = process.env, exists = fs.existsSync } = {}) {
  const candidatos = env.NAVEGADOR ? [env.NAVEGADOR] : platform === "linux" ? ["/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome"] : platform === "win32" ? ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"] : [];
  const encontrado = candidatos.find(exists);
  if (!encontrado) throw new Error("Navegador no encontrado; define NAVEGADOR");
  return encontrado;
}
module.exports = { RAIZ, slug, crearSala, canalDeSala, leerConfig, resolverNavegador };

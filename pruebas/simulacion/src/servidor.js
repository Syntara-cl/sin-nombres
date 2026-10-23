const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { RAIZ } = require("./config");
async function abrirServidor() {
  const server = http.createServer(async (req, res) => {
    // Solo el documento del juego; no exponer .git, .encargo ni archivos de configuración.
    if (new URL(req.url, "http://localhost").pathname !== "/eres-tu.html") { res.writeHead(404).end(); return; }
    try { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(await fs.readFile(path.join(RAIZ, "eres-tu.html"))); }
    catch { res.writeHead(500).end(); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return { url: `http://127.0.0.1:${server.address().port}/eres-tu.html`, cerrar: () => new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())) };
}
module.exports = { abrirServidor };

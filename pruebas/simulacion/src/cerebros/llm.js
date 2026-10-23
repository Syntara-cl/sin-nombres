'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PERSONAS = Object.freeze({
  Natalia: 'estratega que busca el consenso',
  Silvia: 'observadora que recuerda votaciones anteriores',
  Stefany: 'bromista que anticipa las risas del grupo',
  'Tía Jana': 'anfitriona intuitiva y cariñosa',
  Pauli: 'competitiva y atenta a la mayoría',
  Cata: 'impulsiva y alegre',
  Marisol: 'cauta que evita los extremos',
  Marcelo: 'analítico que sigue patrones',
  'Fabián A.': 'líder que piensa en cómo votará la familia',
  'Fabián B.': 'práctico y directo',
  Pablo: 'ingenioso que detecta consensos',
  Romina: 'perspicaz que escucha al grupo',
  Andrés: 'tranquilo que se deja llevar por la intuición'
});

const REPARTO = Object.freeze({
  Natalia: 'codex', Silvia: 'codex', Stefany: 'codex',
  'Tía Jana': 'aleatorio', Pauli: 'gemini', Cata: 'gemini', Marisol: 'gemini',
  Marcelo: 'claude', 'Fabián A.': 'aleatorio', 'Fabián B.': 'aleatorio',
  Pablo: 'claude', Romina: 'claude', Andrés: 'aleatorio'
});

const MODELOS = Object.freeze({
  claude: 'claude-sonnet-5-5-low',
  gemini: 'gemini-3.8-flash-low',
  codex: 'gpt-6-luna'
});

function crearLimitador(max = 6) {
  if (!Number.isInteger(max) || max < 1) throw new Error('Concurrencia inválida');
  let activas = 0;
  const cola = [];
  function siguiente() {
    if (activas >= max || !cola.length) return;
    const { tarea, resolve, reject } = cola.shift();
    activas++;
    Promise.resolve().then(tarea).then(resolve, reject).finally(() => {
      activas--;
      siguiente();
    });
  }
  return tarea => new Promise((resolve, reject) => {
    cola.push({ tarea, resolve, reject });
    siguiente();
  });
}

const limitadoresCompartidos = new Map();
function limitadorCompartido(max) {
  if (!limitadoresCompartidos.has(max)) limitadoresCompartidos.set(max, crearLimitador(max));
  return limitadoresCompartidos.get(max);
}

function resolverEjecutable(proveedor, { platform = process.platform, env = process.env, exists = fs.existsSync, nodePath = process.execPath } = {}) {
  if (!MODELOS[proveedor]) throw new Error(`Proveedor desconocido: ${proveedor}`);
  if (platform !== 'win32') return { command: proveedor === 'codex' ? 'codex' : 'agy', argsPrefix: [] };
  if (proveedor !== 'codex') {
    if (!env.LOCALAPPDATA) throw new Error('LOCALAPPDATA no está definido para agy');
    const command = path.win32.join(env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe');
    if (!exists(command)) throw new Error(`No existe el ejecutable de agy: ${command}`);
    return { command, argsPrefix: [] };
  }
  const candidatos = [
    env.APPDATA && path.win32.join(env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
    env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
    env.ProgramFiles && path.win32.join(env.ProgramFiles, 'nodejs', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
  ].filter(Boolean);
  const script = candidatos.find(exists);
  if (!script) throw new Error(`No se encontró la CLI real de Codex (${candidatos.join(', ')})`);
  return { command: nodePath, argsPrefix: [script] };
}

function objetosJson(texto) {
  const objetos = [];
  for (let inicio = 0; inicio < texto.length; inicio++) {
    if (texto[inicio] !== '{') continue;
    let profundidad = 0, enCadena = false, escape = false;
    for (let i = inicio; i < texto.length; i++) {
      const c = texto[i];
      if (enCadena) {
        if (escape) escape = false;
        else if (c === '\\') escape = true;
        else if (c === '"') enCadena = false;
      } else if (c === '"') enCadena = true;
      else if (c === '{') profundidad++;
      else if (c === '}' && --profundidad === 0) {
        try { objetos.push({ inicio, valor: JSON.parse(texto.slice(inicio, i + 1)) }); } catch (_) { /* salida ajena al JSON */ }
        break;
      }
    }
  }
  return objetos.sort((a, b) => a.inicio - b.inicio).map(o => o.valor);
}

function parsearRespuesta(texto, opciones) {
  const salida = String(texto || '');
  const nombres = (opciones || []).map(o => typeof o === 'string' ? o : o.name).filter(Boolean);
  const coincidencia = voto => nombres.find(n => n === voto) || nombres.find(n => n.toLocaleLowerCase('es') === String(voto).toLocaleLowerCase('es'));
  const objetos = objetosJson(salida);
  for (let i = objetos.length - 1; i >= 0; i--) {
    const objeto = objetos[i];
    const voto = objeto && typeof objeto.voto === 'string' && coincidencia(objeto.voto);
    if (voto) return { voto, razon: typeof objeto.razon === 'string' ? objeto.razon.trim().split(/\s+/).slice(0, 15).join(' ') : '' };
  }
  const ordenados = nombres.slice().sort((a, b) => b.length - a.length);
  for (const nombre of ordenados) {
    const escaped = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(salida)) {
      return { voto: nombre, razon: 'Respuesta en texto' };
    }
  }
  return null;
}

function construirPrompt({ nombre, persona, pregunta, opciones, historial }) {
  const recientes = (historial || []).slice(-5).map((r, i) =>
    `${i + 1}. Pregunta: ${r.pregunta}; ganó: ${r.ganador ?? r.ganadores ?? 'sin dato'}; tu voto: ${r.voto ?? 'sin dato'}; coincidiste: ${r.coincidio ?? 'sin dato'}`
  ).join(' | ') || 'ninguno';
  return `Eres ${nombre}, ${persona || PERSONAS[nombre] || 'participante de la familia'}. Juegas '¿Quién es más probable?' en una junta familiar de Halloween en Chile. Regla: gana 100 puntos quien vota igual que la mayoría del grupo (no importa quién sea más probable en realidad: piensa qué votarán los demás). Pregunta: ${pregunta}. Opciones: ${opciones.join(', ')}. Historial reciente: ${recientes}. Responde SOLO con JSON en una línea: {"voto":"<nombre exacto de una opción>","razon":"<máx. 15 palabras>"}.`;
}

function argumentos(proveedor, prompt) {
  if (proveedor === 'codex') return ['exec', '-m', MODELOS.codex, '--skip-git-repo-check', '--sandbox', 'read-only', prompt];
  return ['-p', prompt, '--model', MODELOS[proveedor]];
}

function ejecutarProceso({ command, args, cwd, signal }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', errorProceso;
    let matarForzado;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { errorProceso = error; });
    signal.addEventListener('abort', () => {
      matarForzado = setTimeout(() => child.kill('SIGKILL'), 1000);
    }, { once: true });
    child.on('close', code => {
      clearTimeout(matarForzado);
      if (errorProceso) reject(errorProceso);
      else if (code !== 0) reject(new Error(`Proceso salió con código ${code}: ${stderr.slice(-500)}`));
      else resolve(stdout);
    });
  });
}

function crearCerebro({ proveedor, simular = false, concurrencia = 6, latenciaMs = 80, timeoutMs = 70000,
  aleatorio = Math.random, limitador = limitadorCompartido(concurrencia), resolver = resolverEjecutable,
  ejecutar = ejecutarProceso } = {}) {
  if (!MODELOS[proveedor]) throw new Error(`Proveedor desconocido: ${proveedor}`);
  return {
    async decidir(datos) {
      const inicio = Date.now();
      const opciones = (datos.opciones || []).map(o => typeof o === 'string' ? o : o.name);
      if (!opciones.length) throw new Error('El cerebro necesita opciones');
      let respuesta, causa = '';
      try {
        respuesta = await limitador(async () => {
          if (simular) {
            if (latenciaMs > 0) await new Promise(resolve => setTimeout(resolve, latenciaMs));
            if (datos.nombre === 'Natalia' && !(datos.historial || []).length) {
              const err = new Error('timeout simulado'); err.code = 'ETIMEDOUT'; throw err;
            }
            if (datos.nombre === 'Silvia' && !(datos.historial || []).length) return '{"voto":';
            return JSON.stringify({ voto: opciones[(opciones.indexOf(datos.nombre) + 1 + opciones.length) % opciones.length], razon: 'Creo que votará la mayoría' });
          }
          const prompt = construirPrompt({ ...datos, opciones });
          const { command, argsPrefix } = resolver(proveedor);
          const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'simulacion-cerebro-'));
          const controlador = new AbortController();
          let timer, agotado = false;
          try {
            const args = [...argsPrefix, ...argumentos(proveedor, prompt)];
            timer = setTimeout(() => { agotado = true; controlador.abort(); }, timeoutMs);
            let salida;
            try { salida = await ejecutar({ command, args, cwd, shell: false, signal: controlador.signal }); }
            catch (error) {
              if (agotado) { const err = new Error('timeout del modelo'); err.code = 'ETIMEDOUT'; throw err; }
              throw error;
            }
            if (agotado) { const err = new Error('timeout del modelo'); err.code = 'ETIMEDOUT'; throw err; }
            return salida;
          } finally {
            clearTimeout(timer);
            fs.rmSync(cwd, { recursive: true, force: true });
          }
        });
        const interpretada = parsearRespuesta(respuesta, opciones);
        if (interpretada) return { ...interpretada, fallback: false, ms: Date.now() - inicio, modelo: MODELOS[proveedor] };
        causa = 'Respuesta no interpretable';
      } catch (error) {
        causa = error.code === 'ETIMEDOUT' || error.name === 'AbortError' ? 'Timeout del modelo' : `Fallo del modelo: ${error.message}`;
      }
      const voto = opciones[Math.min(opciones.length - 1, Math.floor(aleatorio() * opciones.length))];
      return { voto, razon: causa, fallback: true, ms: Date.now() - inicio, modelo: MODELOS[proveedor] };
    }
  };
}

module.exports = { crearCerebro, crearLimitador, resolverEjecutable, parsearRespuesta, construirPrompt, PERSONAS, REPARTO, MODELOS };

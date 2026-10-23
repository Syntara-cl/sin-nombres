const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { parsearRespuesta, crearCerebro: crearLlm, crearLimitador, resolverEjecutable, PERSONAS, REPARTO } = require('../src/cerebros/llm');
const { crearCerebro: crearAleatorio } = require('../src/cerebros/aleatorio');

const opciones = ['Natalia', 'Fabián A.', 'Fabián B.', 'Tía Jana'];
const consulta = (nombre = 'Natalia', historial = []) => ({ nombre, persona: PERSONAS[nombre], pregunta: '¿Quién gana?', opciones, historial, tiempoMs: 1000 });

test('parsea el último objeto JSON válido, incluso tras eco y salida adicional', () => {
  const salida = 'prompt {"voto":"Natalia","razon":"eco"}\nrespuesta {"voto":"Tía Jana","razon":"consenso"}\ntokens used: 24';
  assert.deepEqual(parsearRespuesta(salida, opciones), { voto: 'Tía Jana', razon: 'consenso' });
});

test('encuentra JSON válido después de un fragmento JSON sin cerrar', () => {
  assert.deepEqual(parsearRespuesta('eco {"voto":\nrespuesta {"voto":"Natalia","razon":"consenso"}', opciones),
    { voto: 'Natalia', razon: 'consenso' });
});

test('busca el nombre en texto cuando no hay JSON y rechaza salidas sin opción', () => {
  assert.deepEqual(parsearRespuesta('Mi voto: Fabián B. porque todos lo elegirán.', opciones), { voto: 'Fabián B.', razon: 'Respuesta en texto' });
  assert.equal(parsearRespuesta('respuesta inservible', opciones), null);
});

test('resuelve agy Windows y comandos Linux sin depender de shims', () => {
  const env = { LOCALAPPDATA: 'C:\\Users\\Ana\\AppData\\Local' };
  const agy = resolverEjecutable('claude', { platform: 'win32', env, exists: () => true });
  assert.equal(agy.command, path.win32.join(env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe'));
  assert.deepEqual(agy.argsPrefix, []);
  assert.deepEqual(resolverEjecutable('gemini', { platform: 'linux' }), { command: 'agy', argsPrefix: [] });
  assert.deepEqual(resolverEjecutable('codex', { platform: 'linux' }), { command: 'codex', argsPrefix: [] });
});

test('resuelve Codex Windows por script real con Node, nunca por .cmd/.ps1', () => {
  const env = { APPDATA: 'C:\\Users\\Ana\\AppData\\Roaming' };
  const script = path.win32.join(env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  const found = resolverEjecutable('codex', { platform: 'win32', env, exists: p => p === script, nodePath: 'C:\\nodejs\\node.exe' });
  assert.equal(found.command, 'C:\\nodejs\\node.exe');
  assert.deepEqual(found.argsPrefix, [script]);
});

test('limitador comparte seis puestos como máximo entre llamadas concurrentes', async () => {
  const limitar = crearLimitador(6);
  let activas = 0, pico = 0;
  await Promise.all(Array.from({ length: 13 }, () => limitar(async () => {
    pico = Math.max(pico, ++activas);
    await new Promise(resolve => setTimeout(resolve, 8));
    activas--;
  })));
  assert.equal(pico, 6);
});

test('simulador determinista produce timeout, JSON roto y voto válido sin modelos', async () => {
  const cerebro = crearLlm({ proveedor: 'codex', simular: true, latenciaMs: 1, timeoutMs: 20, aleatorio: () => 0 });
  const [timeout, roto, valido] = await Promise.all([
    cerebro.decidir(consulta('Natalia')),
    cerebro.decidir(consulta('Silvia')),
    cerebro.decidir(consulta('Stefany'))
  ]);
  assert.equal(timeout.fallback, true);
  assert.match(timeout.razon, /timeout/i);
  assert.equal(roto.fallback, true);
  assert.equal(valido.fallback, false);
  for (const resultado of [timeout, roto, valido]) {
    assert.ok(opciones.includes(resultado.voto));
    assert.ok(resultado.ms >= 0);
    assert.equal(resultado.modelo, 'gpt-6-luna');
  }
});

test('prompt contiene persona, regla de mayoría y solo las últimas cinco rondas', async () => {
  let prompt;
  const cerebro = crearLlm({ proveedor: 'gemini', ejecutar: async ({ args, cwd, shell }) => {
    prompt = args[1];
    assert.equal(shell, false);
    assert.ok(cwd);
    return '{"voto":"Natalia","razon":"mayoría"}';
  }, resolver: () => ({ command: 'agy', argsPrefix: [] }), aleatorio: () => 0 });
  const historial = Array.from({ length: 7 }, (_, i) => ({ pregunta: `ronda-${i}`, ganador: 'Natalia', voto: 'Natalia', coincidio: true }));
  const resultado = await cerebro.decidir(consulta('Pauli', historial));
  assert.equal(resultado.fallback, false);
  assert.match(prompt, /Eres Pauli/);
  assert.match(prompt, /100 puntos/);
  assert.doesNotMatch(prompt, /ronda-0|ronda-1/);
  assert.match(prompt, /ronda-2/);
});

test('Codex recibe argumentos separados y limpia el directorio temporal tras timeout', async () => {
  let carpeta;
  const cerebro = crearLlm({ proveedor: 'codex', timeoutMs: 5, aleatorio: () => 0,
    resolver: () => ({ command: 'node', argsPrefix: ['codex.js'] }),
    ejecutar: ({ command, args, cwd, shell, signal }) => {
      carpeta = cwd;
      assert.equal(command, 'node');
      assert.equal(shell, false);
      assert.deepEqual(fs.readdirSync(cwd), []);
      assert.deepEqual(args.slice(0, 7), ['codex.js', 'exec', '-m', 'gpt-6-luna', '--skip-git-repo-check', '--sandbox', 'read-only']);
      assert.match(args.at(-1), /Responde SOLO con JSON/);
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('abortado')), { once: true }));
    }
  });
  const resultado = await cerebro.decidir(consulta());
  assert.equal(resultado.fallback, true);
  assert.match(resultado.razon, /timeout/i);
  assert.equal(fs.existsSync(carpeta), false);
});

test('prioriza stdout sobre el eco de prompt en stderr de un proceso local', async () => {
  const script = "process.stdout.write(JSON.stringify({voto:'Natalia',razon:'respuesta'})); process.stderr.write(JSON.stringify({voto:'Tía Jana',razon:'eco'}));";
  const cerebro = crearLlm({ proveedor: 'codex', resolver: () => ({ command: process.execPath, argsPrefix: ['-e', script, '--'] }) });
  const resultado = await cerebro.decidir(consulta());
  assert.equal(resultado.voto, 'Natalia');
  assert.equal(resultado.razon, 'respuesta');
  assert.equal(resultado.fallback, false);
  assert.equal(resultado.modelo, 'gpt-6-luna');
  assert.ok(resultado.ms >= 0);
});

test('timeout espera el cierre del proceso local antes de limpiar cwd y liberar el cupo', async () => {
  const marcador = path.join(os.tmpdir(), `cerebro-cierre-${process.pid}-${Date.now()}`);
  const script = `const fs=require('fs'); process.on('SIGTERM',()=>setTimeout(()=>{fs.writeFileSync(${JSON.stringify(marcador)},'cerrado');process.exit(0)},45));setInterval(()=>{},1000);`;
  const limitar = crearLimitador(1);
  let segundoInicio;
  const cerebro = crearLlm({ proveedor: 'codex', timeoutMs: 100, limitador: limitar,
    resolver: () => ({ command: process.execPath, argsPrefix: ['-e', script, '--'] })
  });
  try {
    const primero = cerebro.decidir(consulta());
    const segundo = limitar(async () => { segundoInicio = Date.now(); return fs.existsSync(marcador); });
    const resultado = await primero;
    assert.equal(resultado.fallback, true);
    assert.match(resultado.razon, /timeout/i);
    assert.equal(fs.existsSync(marcador), true);
    assert.equal(await segundo, true);
    assert.ok(segundoInicio);
  } finally {
    fs.rmSync(marcador, { force: true });
  }
});

test('reparto tiene trece nombres y cerebro aleatorio respeta opciones', async () => {
  assert.equal(Object.keys(REPARTO).length, 13);
  assert.equal(Object.keys(PERSONAS).length, 13);
  const aleatorio = crearAleatorio({ latenciaMs: 0, aleatorio: () => 0.99 });
  const resultado = await aleatorio.decidir(consulta());
  assert.equal(resultado.voto, 'Tía Jana');
  assert.equal(resultado.fallback, false);
  assert.equal(resultado.modelo, 'aleatorio');
});

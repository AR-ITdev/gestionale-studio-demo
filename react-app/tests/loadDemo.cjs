// Bundles the browser-side demo backend for node:test. Every call returns a fresh copy of
// the modules, so module-level state (database, storage settings) never leaks between tests.
const path = require('node:path');
const { buildSync } = require('esbuild');

const demoDir = path.join(__dirname, '..', 'src', 'demo');
const MODULES = ['demoBackend', 'demoServer', 'demoDatabase', 'demoSeed', 'demoRoutesFinance', 'demoQueries'];

function loadDemo(extraModules = []) {
  const { outputFiles } = buildSync({
    stdin: {
      contents: [...MODULES.map(name => `./${name}.js`), ...extraModules]
        .map(file => `export * from '${file}';`).join('\n'),
      resolveDir: demoDir,
      sourcefile: 'demo-entry.js'
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    logLevel: 'silent'
  });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', outputFiles[0].text)(module, module.exports, require);
  return module.exports;
}

// Sends one request straight to the route dispatcher and returns the JSON-serialised response,
// exactly as the UI would receive it over HTTP.
function createCaller(demo, db, now = () => new Date()) {
  return (method, url, body = {}) => {
    const parsed = new URL(url, 'http://gestionale.demo');
    const result = demo.handleDemoRequest(db, {
      method,
      path: parsed.pathname,
      query: Object.fromEntries(parsed.searchParams),
      body: JSON.parse(JSON.stringify(body)),
      now
    });
    return { status: result.status, body: result.body === undefined ? undefined : JSON.parse(JSON.stringify(result.body)) };
  };
}

// Expected failures are logged by the ported routes exactly like the desktop server does.
async function quietly(work) {
  const { debug, warn } = console;
  console.debug = () => {};
  console.warn = () => {};
  try {
    return await work();
  } finally {
    console.debug = debug;
    console.warn = warn;
  }
}

module.exports = { loadDemo, createCaller, quietly };

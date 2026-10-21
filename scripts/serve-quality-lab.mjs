import {build} from 'esbuild';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let revision = 'unavailable';
try {revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, env: {...process.env, ...(process.platform === 'darwin' ? {DEVELOPER_DIR: '/Library/Developer/CommandLineTools'} : {})}, stdio: ['ignore', 'pipe', 'ignore']}).toString().trim();} catch { /* Exported archives may not contain .git. */ }
const metadata = {revision, extensionVersion: JSON.parse(await fs.readFile(path.join(root, 'apps/chrome-extension/manifest.json'), 'utf8')).version};
const bundle = await build({entryPoints: [path.join(root, 'fixtures/quality-lab.ts')], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', loader: {'.woff2': 'binary'}, define: {__QUALITY_BUILD__: JSON.stringify(metadata)}, alias: Object.fromEntries(['dom-capture', 'scene-graph', 'style-normalizer', 'shared-protocol', 'asset-pipeline'].map(name => ['@frameforge/' + name, path.join(root, 'packages', name, 'src/index.ts')]))});
if (process.argv.includes('--check')) {
  console.log('Quality lab browser bundle built successfully. No browser or Figma checks were run.');
} else {
  const routes = new Map([
    ['/', ['fixtures/quality-lab.html', 'text/html; charset=utf-8']],
    ['/font.woff2', ['node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2', 'font/woff2']],
    ['/font-bold.woff2', ['node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2', 'font/woff2']],
  ]);
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') {res.writeHead(405).end(); return;}
    if (req.url === '/lab.js') {res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return;}
    const route = routes.get(req.url?.split('?')[0]);
    if (!route) {res.writeHead(404).end(); return;}
    try {res.setHeader('Content-Type', route[1]); res.end(await fs.readFile(path.join(root, route[0])));}
    catch {res.writeHead(500).end('Fixture unavailable');}
  });
  const port = Number(process.env.FRAMEFORGE_LAB_PORT || 38479);
  server.listen(port, '127.0.0.1', () => console.log(`Quality lab: http://127.0.0.1:${port}\nLocal fixture only. Clipboard writes require the explicit acceptance-copy button. No extension installation or Figma actions are automatic.`));
}

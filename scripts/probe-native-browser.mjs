// Exercise the shipped browser dependency branches under MV3-style no-eval restrictions.
import { build } from 'esbuild';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { parseFigmaClipboard } from '@open-pencil/fig/clipboard';
const bundle = await build({ entryPoints: ['apps/chrome-extension/src/clipboard/native.ts'], bundle: true, write: false, format: 'iife', globalName: 'NativeClipboardProbe', platform: 'browser', target: 'es2022', loader: { '.woff2': 'binary' }, alias: {
  '@frameforge/scene-graph': './packages/scene-graph/src/index.ts', '@frameforge/shared-protocol': './packages/shared-protocol/src/index.ts', '@frameforge/style-normalizer': './packages/style-normalizer/src/index.ts'
} });
const window = new Window();
const context = vm.createContext({ crypto: webcrypto, console, TextEncoder, TextDecoder, atob, btoa, setTimeout, clearTimeout, DOMParser: window.DOMParser }, { codeGeneration: { strings: false, wasm: false } });
vm.runInContext(bundle.outputFiles[0].text, context);
const box = { x: 0, y: 0, width: 500, height: 200 };
const doc = { schemaVersion: '1.0.0', root: { type: 'FRAME', id: 'root', name: 'Form', bounds: box, visible: true, opacity: 1, fills: [], children: [
  { type: 'TEXT', id: 'title', name: 'Heading', bounds: { x: 20, y: 20, width: 460, height: 40 }, visible: true, opacity: 1, characters: 'What brings you to Petopus?', style: { fontFamily: 'Inter', fontWeight: 700, fontSize: 28, lineHeight: { unit: 'PIXELS', value: 40 } }, fills: [{ type: 'SOLID', color: { r: .1, g: .1, b: .1, a: 1 } }] },
  { type: 'VECTOR', id: 'icon', name: 'Account icon', bounds: { x: 20, y: 80, width: 24, height: 24 }, visible: true, opacity: 1, svgContent: '<svg viewBox="0 0 24 24" fill="none" stroke="#c2410c" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/></svg>' }
] }, diagnostics: { warnings: [] } };
const output = await context.NativeClipboardProbe.buildNativeClipboard(doc);
const parsed = await parseFigmaClipboard(output.html);
assert(parsed);
const text = parsed.nodes.find(n => n.type === 'TEXT');
assert(text.derivedTextData.glyphs.length > 10);
assert(text.derivedTextData.glyphs.some(g => parsed.blobs[g.commandsBlob].length > 1));
assert.equal(parsed.nodes.find(n => n.name === 'Form').stackMode, 'VERTICAL');
assert(parsed.nodes.some(n => n.strokeGeometry?.length));
console.log(JSON.stringify({ browserBundle: 'passed with eval/Function/Wasm disabled', textGlyphs: text.derivedTextData.glyphs.length, autoLayoutFrames: parsed.nodes.filter(n => n.stackMode === 'VERTICAL' || n.stackMode === 'HORIZONTAL').length, strokeShapes: parsed.nodes.filter(n => n.strokeGeometry?.length).length }));

import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const bundle=await build({entryPoints:['fixtures/gradient-smoke.ts'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',loader:{'.woff2':'binary'},alias:Object.fromEntries(['scene-graph','style-normalizer','dom-capture','shared-protocol'].map(n=>['@frameforge/'+n,path.resolve('packages/'+n+'/src/index.ts')]))});
http.createServer((req,res)=>{if(req.url==='/probe.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}else{res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('fixtures/gradient-smoke.html'));}}).listen(38475,'127.0.0.1',()=>console.log('Gradient comparison: http://127.0.0.1:38475'));

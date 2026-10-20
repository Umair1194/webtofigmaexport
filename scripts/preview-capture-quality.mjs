import {build} from 'esbuild';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {deflateSync,crc32} from 'node:zlib';
import {fetchImageAsDataUrl} from '../packages/asset-pipeline/dist/encode.js';
const chunk=(type,bytes)=>{const b=Buffer.alloc(12+bytes.length);b.writeUInt32BE(bytes.length);b.write(type,4);bytes.copy(b,8);b.writeUInt32BE(crc32(b.subarray(4,8+bytes.length)),8+bytes.length);return b;};
const header=Buffer.alloc(13);header.writeUInt32BE(64);header.writeUInt32BE(48,4);header[8]=8;header[9]=2;
const rows=Buffer.alloc((64*3+1)*48);for(let y=0;y<48;y++)for(let x=0;x<64;x++){const i=y*193+1+x*3;rows[i]=(Math.floor(x/8)+Math.floor(y/8))%2?225:54;rows[i+1]=130;rows[i+2]=60;}
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
const bundle=await build({entryPoints:['fixtures/capture-quality-smoke.ts'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',loader:{'.woff2':'binary'},alias:Object.fromEntries(['scene-graph','style-normalizer','dom-capture','asset-pipeline','shared-protocol'].map(n=>['@frameforge/'+n,path.resolve('packages/'+n+'/src/index.ts')]))});
const image=(res)=>{res.setHeader('Content-Type','image/png');res.end(png);};
http.createServer((req,res)=>image(res)).listen(38477,'127.0.0.1');
http.createServer(async(req,res)=>{
 if(req.url==='/image.png')return image(res);
 if(req.url==='/probe.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundle.outputFiles[0].text);}
 if(req.url==='/broker-image'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(await fetchImageAsDataUrl('http://127.0.0.1:38477/image.png')));}
 res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('fixtures/capture-quality-smoke.html'));
}).listen(38476,'127.0.0.1',()=>console.log('Capture quality harness: http://127.0.0.1:38476'));

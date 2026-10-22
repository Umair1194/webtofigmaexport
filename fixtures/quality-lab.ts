import {capturePageAsync} from '@frameforge/dom-capture';
import type {SceneNode, SceneGraphDocument} from '@frameforge/scene-graph';
import {loadCaptureImage} from '../apps/chrome-extension/src/content/images.js';
import {buildNativeClipboard} from '../apps/chrome-extension/src/clipboard/native.js';
import {parseFigmaClipboard} from '@open-pencil/fig/clipboard';
import {summarize} from '../scripts/quality-metrics.mjs';
declare const __QUALITY_BUILD__: {revision: string; extensionVersion: string};

const fixture = document.querySelector<HTMLElement>('#fixture')!;
const scenarioSelect = document.querySelector<HTMLSelectElement>('#scenario')!;
const status = document.querySelector<HTMLElement>('#status')!;
const runButton = document.querySelector<HTMLButtonElement>('#run')!;
const stressButton=document.querySelector<HTMLButtonElement>('#run-stress')!;
const downloadButton = document.querySelector<HTMLButtonElement>('#download')!;
const snapshotButton = document.querySelector<HTMLButtonElement>('#snapshot')!;
const copyButton = document.querySelector<HTMLButtonElement>('#copy-acceptance')!;
const scenarios = ['acceptance', 'cards-small', 'cards-medium', 'cards-large', 'paragraphs'];
let latestReport: any;
let imagePng = '', imageWebp = '';
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const round = (n: number) => Math.round(n * 100) / 100;
const viewport = () => ({width: innerWidth, height: innerHeight, devicePixelRatio});
const walk = (doc: SceneGraphDocument) => {
  const nodes: SceneNode[] = [], pending: SceneNode[] = [doc.root];
  while (pending.length) {const node = pending.pop()!; nodes.push(node); if (node.type === 'FRAME') pending.push(...node.children);}
  return nodes;
};
const paragraph = 'A paragraph should remain one editable text layer, with its natural line wrapping preserved. Compare the line endings, paragraph width, and spacing after pasting into Figma.';
const logo = '<svg class="logo" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="logo-gradient"><stop stop-color="#ed9643"/><stop offset="1" stop-color="#7358c4"/></linearGradient></defs><rect id="gradient-logo" x="0" y="0" width="40" height="40" rx="10" fill="url(#logo-gradient)"/><path fill="white" fill-rule="evenodd" d="M10 10H30V30H10ZM15 15V25H25V15Z"/></svg>';

async function render(name: string) {
  if (name === 'acceptance') fixture.innerHTML = `
    <div class="hero" id="acceptance-hero"><div><h2 id="acceptance-heading">A place for every detail.</h2><p id="acceptance-subtitle">Editable text, nested layout, gentle borders, and original image colours.</p></div><div class="swatch" id="acceptance-gradient"></div></div>
    <div class="columns" id="acceptance-columns"><section class="panel" id="acceptance-panel">
      <div class="row" id="acceptance-row">${logo}<div class="column" id="acceptance-stack"><h3>Nested editable layout</h3><span class="pill">Ready for review</span></div></div>
      <p id="acceptance-paragraph" class="paragraph">${paragraph}</p>
      <p id="acceptance-rich" class="paragraph">A sentence with <strong>one bold phrase</strong> and an explicit break.<br>Keep this second line editable.</p>
      <p id="acceptance-deep" class="paragraph">Deep styles: <span>outer <span class="deep"><strong>nested purple bold</strong></span> outer again</span> normal.</p>
    </section><section class="panel" id="acceptance-form"><div class="images" id="acceptance-images"><img id="acceptance-png" src="${imagePng}" alt="Colour test PNG"><img id="acceptance-webp" src="${imageWebp}" alt="Colour test WebP"></div><label>Email address<input id="acceptance-input" placeholder="you@example.com"></label><button class="submit" id="acceptance-button">Continue to your account</button><p>Forms remain shapes and editable text; password values should stay private.</p></section></div>`;
  else if (name === 'paragraphs') {
    fixture.innerHTML = '<h2>Long paragraph benchmark</h2>' + Array.from({length: 12}, (_, i) => `<p class="long-copy" id="long-paragraph-${i}">${Array(8).fill(paragraph).join(' ')}</p>`).join('');
  } else {
    const count = {'cards-small': 12, 'cards-medium': 60, 'cards-large': 150}[name]!;
    fixture.innerHTML = `<h2>${count} cards</h2><div class="cards">` + Array.from({length: count}, (_, i) => `<article class="card"><img src="${imagePng}" alt="Colour card ${i + 1}"><div class="row"><h3>Card ${i + 1}</h3><span class="pill">Active</span></div><p>Measured spacing and editable text.</p></article>`).join('') + '</div>';
  }
  fixture.dataset.scenario = name;
  await document.fonts.ready;
  await Promise.all(Array.from(fixture.querySelectorAll('img')).map(image => image.decode()));
  await frame(); await frame();
}

function sourceMeasurements() {
  const root = fixture.getBoundingClientRect();
  return {scenario: fixture.dataset.scenario, viewport: viewport(), root: {width: round(root.width), height: round(root.height)}, elements: Array.from(fixture.querySelectorAll<HTMLElement>('[id]')).map(element => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    return {id: element.id, text: element.textContent, bounds: {x: round(box.x - root.x), y: round(box.y - root.y), width: round(box.width), height: round(box.height)}, font: style.font, color: style.color, display: style.display, gap: style.gap, padding: style.padding, background: style.background, border: style.border};
  })};
}

async function embedImages(doc: SceneGraphDocument) {
  const cache = new Map<string, ReturnType<typeof loadCaptureImage>>();
  // Deliberately small local assets, not a simulation of the production network broker.
  for (const node of walk(doc)) if (node.type === 'IMAGE' && node.srcUrl) {
    if (!cache.has(node.srcUrl)) cache.set(node.srcUrl, loadCaptureImage(node.srcUrl, new AbortController().signal));
    const result = await cache.get(node.srcUrl)!;
    if (!result.dataUrl) throw new Error(`Local image unavailable: ${result.error}`);
    node.dataUrl = result.dataUrl;
  }
}

async function measure(name: string) {
  if (document.visibilityState !== 'visible') throw new Error('Keep the benchmark tab visible');
  const initialViewport = JSON.stringify(viewport());
  let interrupted = false, running = true, lastFrame = performance.now(), maxFrameGapMs = 0, animation = 0;
  const tasks: number[] = [];
  const heapSamples: number[] = [];
  const memory = () => {const used = (performance as any).memory?.usedJSHeapSize; if (Number.isFinite(used)) heapSamples.push(used);};
  const hidden = () => {if (document.visibilityState !== 'visible') interrupted = true;};
  document.addEventListener('visibilitychange', hidden);
  const tick = (time: number) => {maxFrameGapMs = Math.max(maxFrameGapMs, time - lastFrame); lastFrame = time; if (running) animation = requestAnimationFrame(tick);};
  animation = requestAnimationFrame(tick);
  let observer: PerformanceObserver | undefined;
  if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    observer = new PerformanceObserver(list => tasks.push(...list.getEntries().map(entry => entry.duration)));
    observer.observe({type: 'longtask'});
  }
  memory();
  const heapStart = heapSamples[0] ?? null;
  const monitor = setInterval(memory, 25);
  try {
    await frame();
    const started = performance.now();
    const doc = await capturePageAsync(fixture, {captureMode: 'SELECTED_ELEMENT', inferAutoLayout: true, redactForms: true});
    const capturedAt = performance.now(); memory();
    await embedImages(doc);
    const assetsAt = performance.now(); memory();
    const native = await buildNativeClipboard(doc);
    const encodedAt = performance.now(); memory();
    const parsed = await parseFigmaClipboard(native.html);
    const ended = performance.now(); memory();
    if (!parsed) throw new Error('Native clipboard could not be decoded');
    // Drain frame and Long Task callbacks after synchronous shaping/encoding returns.
    await frame(); await pause(80);
    if (interrupted || initialViewport !== JSON.stringify(viewport())) throw new Error('Tab visibility or viewport changed during the sample; rerun');
    const texts = parsed.nodes.filter(node => node.type === 'TEXT');
    const images = parsed.nodes.flatMap(node => node.fillPaints || []).filter(paint => paint.type === 'IMAGE');
    if (!texts.length || texts.some(node => node.textData?.characters.trim() && !node.derivedTextData?.glyphs?.length)) throw new Error('Drawable editable text missing');
    if (walk(doc).some(node => node.type === 'IMAGE' && !node.dataUrl) || images.some(paint => paint.image?.dataBlob === undefined)) throw new Error('Image payload missing');
    if (doc.diagnostics.warnings.some(warning => /truncat|maximum node|partial/i.test(warning))) throw new Error('Fixture exceeded capture limits');
    const checks: Record<string, boolean> = {};
    const observations: Record<string, boolean> = {};
    if (name === 'acceptance') {
      checks.paragraphIsOneLayer = texts.filter(node => node.textData?.characters === paragraph).length === 1;
      const nativeParagraph=texts.find(node=>node.textData?.characters===paragraph);
      const paragraphWidth=document.querySelector('#acceptance-paragraph')!.getBoundingClientRect().width;
      checks.paragraphReflowBox=!!nativeParagraph&&Math.abs(nativeParagraph.size!.x-paragraphWidth)<.1&&nativeParagraph.textAutoResize==='HEIGHT';
      checks.rasterImagesEmbedded = images.length === 2;
      checks.gradientPresent = parsed.nodes.some(node => node.name === 'div#acceptance-gradient' && node.fillPaints?.some(paint => paint.type === 'GRADIENT_LINEAR'));
      checks.nestedAutoLayoutPresent = ['div#acceptance-row', 'div#acceptance-stack'].every(name => parsed.nodes.some(node => node.name === name && ['VERTICAL', 'HORIZONTAL'].includes(node.stackMode || '')));
      if (Object.values(checks).some(value => !value)) throw new Error(`Structural acceptance failed: ${JSON.stringify(checks)}`);
      // Track the known defect without silently treating it as a passing fidelity check.
      const deep = walk(doc).find(node => node.type === 'TEXT' && node.characters.startsWith('Deep styles:'));
      if (deep?.type === 'TEXT') {
        const offset = deep.characters.indexOf('nested purple bold');
        observations.nestedPurpleBoldStylePreserved = !!deep.runs?.some(run => run.start <= offset && run.end >= offset + 'nested purple bold'.length && run.style.fontWeight === 700 && run.fills.some(paint => paint.type === 'SOLID' && Math.abs(paint.color.r - 117 / 255) < .01 && Math.abs(paint.color.b - 120 / 255) < .01));
      } else observations.nestedPurpleBoldStylePreserved = false;
      checks.nestedRichTextPreserved=observations.nestedPurpleBoldStylePreserved;
      if(!checks.nestedRichTextPreserved)throw new Error('Deeply nested rich text lost its style ranges');
    }
    return {captureMs: capturedAt - started, assetsMs: assetsAt - capturedAt, encodeMs: encodedAt - assetsAt, decodeMs: ended - encodedAt, totalMs: ended - started, maxFrameGapMs, longTaskMaxMs: tasks.length ? Math.max(...tasks) : 0, longTasksSupported: !!observer, heapStartBytes: heapStart, heapEndBytes: heapSamples.at(-1) ?? null, maxObservedHeapBytes: heapSamples.length ? Math.max(...heapSamples) : null, clipboardBytes: new TextEncoder().encode(native.html).length, captureJsonBytes: new TextEncoder().encode(JSON.stringify(doc)).length, counts: {...native.stats, sourceElements: fixture.querySelectorAll('*').length, capturedNodes: doc.diagnostics.totalNodesCaptured, imagePaints: images.length}, checks, observations, warnings: native.warnings};
  } finally {
    running = false; cancelAnimationFrame(animation); clearInterval(monitor); observer?.disconnect(); document.removeEventListener('visibilitychange', hidden);
  }
}

function download(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

runButton.addEventListener('click', async () => {
  copyButton.disabled = stressButton.disabled = true;
  runButton.disabled = scenarioSelect.disabled = snapshotButton.disabled = downloadButton.disabled = true;
  const initialViewport = viewport();
  const results: any[] = [];
  const report: any = {schemaVersion: 1, fixtureVersion: 1, profile: 'core-browser-harness', build: __QUALITY_BUILD__, generatedAt: new Date().toISOString(), userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, viewport: initialViewport, repetitions: 3, warmups: 1, limitations: ['Direct capture/encoder calls; installed extension messaging, permissions, storage and lifecycle are not measured.', 'Heap is sampled at stage boundaries and on a timer; this is not peak process memory. Unsupported heap/Long Task APIs are explicit.', 'Assets are tiny local cached data URLs; CDN, session and iframe paths require installed-extension acceptance.', 'One discarded warm-up per scenario; this does not measure extension cold start.', 'Figma host rendering, text editing and resizing remain pending manual checks.'], figmaAcceptance: {status: 'pending', results: []}, results};
  try {
    for (const name of scenarios) {
      status.textContent = `Benchmarking ${name}: warm-up…`;
      try {
        await render(name); await measure(name);
        const samples = [];
        for (let i = 0; i < report.repetitions; i++) {status.textContent = `Benchmarking ${name}: sample ${i + 1}/${report.repetitions}…`; await pause(100); samples.push(await measure(name));}
        if (JSON.stringify(viewport()) !== JSON.stringify(initialViewport)) throw new Error('Viewport changed during suite');
        if (samples.some(sample => JSON.stringify(sample.counts) !== JSON.stringify(samples[0].counts))) throw new Error('Layer counts changed between samples');
        results.push({scenario: name, status: 'passed', source: sourceMeasurements(), counts: samples[0].counts, summary: summarize(samples), samples});
      } catch (error) {results.push({scenario: name, status: 'failed', error: error instanceof Error ? error.message : String(error)});}
      document.querySelector('#report')!.textContent = JSON.stringify(report, null, 2);
    }
    latestReport = report;
    (window as any).__FRAMEFORGE_QUALITY_REPORT__ = report;
    document.documentElement.dataset.result = results.every(result => result.status === 'passed') ? 'pass' : 'fail';
    status.textContent = `${results.filter(result => result.status === 'passed').length}/${scenarios.length} browser scenarios passed. Figma canvas acceptance remains pending. Report is ready to download.`;
  } finally {
    scenarioSelect.value = 'acceptance'; await render('acceptance');
    runButton.disabled = scenarioSelect.disabled = snapshotButton.disabled = false; downloadButton.disabled = !latestReport;
    copyButton.disabled = stressButton.disabled = false;
  }
});
scenarioSelect.addEventListener('change', async () => {await render(scenarioSelect.value); status.textContent = `${scenarioSelect.value} ready. Capture the white fixture using the installed extension.`;});
downloadButton.addEventListener('click', () => download(latestReport, `frameforge-browser-${innerWidth}.json`));
snapshotButton.addEventListener('click', () => download(sourceMeasurements(), `frameforge-source-${fixture.dataset.scenario}-${innerWidth}.json`));
copyButton.addEventListener('click', async () => {
  copyButton.disabled = runButton.disabled = stressButton.disabled = scenarioSelect.disabled = true;
  try {
    const source = sourceMeasurements();
    const doc = await capturePageAsync(fixture, {captureMode: 'SELECTED_ELEMENT', inferAutoLayout: true, redactForms: true});
    await embedImages(doc);
    doc.root.name = `FrameForge ${__QUALITY_BUILD__.extensionVersion} QA ${innerWidth}px ${fixture.dataset.scenario}`;
    const result = await buildNativeClipboard(doc);
    document.querySelector('#transfer-html')!.textContent = result.html;
    await navigator.clipboard.write([new ClipboardItem({'text/html': new Blob([result.html], {type: 'text/html'}), 'text/plain': new Blob(['FrameForge: paste onto the Figma canvas'], {type: 'text/plain'})})]);
    document.querySelector('#transfer-report')!.textContent = JSON.stringify({build: __QUALITY_BUILD__, source, stats: result.stats, warnings: result.warnings, path: 'lab → production native encoder → clipboard → Figma; installed extension messaging/storage not exercised'}, null, 2);
    status.textContent = 'Fixture copied as native Figma layers. Paste on the QA page, then inspect the actual text and layout. This does not mark acceptance passed.';
  } catch (error) {status.textContent = `Copy failed: ${error instanceof Error ? error.message : String(error)}`;}
  finally {copyButton.disabled = runButton.disabled = stressButton.disabled = scenarioSelect.disabled = false;}
});

const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 100;
const context = canvas.getContext('2d')!;
const gradient = context.createLinearGradient(0, 0, 160, 100); gradient.addColorStop(0, '#e79b3a'); gradient.addColorStop(.5, '#c44a77'); gradient.addColorStop(1, '#3d79a8');
context.fillStyle = gradient; context.fillRect(0, 0, 160, 100); context.fillStyle = '#fff'; context.fillRect(20, 20, 30, 30);
imagePng = canvas.toDataURL('image/png'); imageWebp = canvas.toDataURL('image/webp');

// Additional checks deliberately kept outside the comparable five-scenario timing suite.
stressButton.addEventListener('click',async()=>{
  const controls=[stressButton,runButton,copyButton,snapshotButton,scenarioSelect];
  controls.forEach(control=>control.disabled=true);
  const report:any={schemaVersion:1,build:__QUALITY_BUILD__,generatedAt:new Date().toISOString(),viewport:viewport(),limitations:['Direct engine calls, not the installed popup or Chrome message broker.','Observed JS heap samples are not peak process memory or a proof of leak-free behavior.','Cancellation covers cooperative DOM capture and native preparation, before clipboard writing begins.']};
  try{
    if(document.visibilityState!=='visible')throw new Error('Keep this tab visible');
    await render('cards-large');
    const cards=fixture.querySelector('.cards')!;cards.innerHTML=cards.innerHTML.repeat(7);
    await document.fonts.ready;await frame();
    status.textContent='Stress: cancelling a 1,050-card capture…';
    const controller=new AbortController();let abortAt=0;
    const start=performance.now();const timer=setTimeout(()=>{abortAt=performance.now();controller.abort();},0);
    let cancelled=false;try{await capturePageAsync(fixture,{captureMode:'SELECTED_ELEMENT',maxNodes:2500,signal:controller.signal});}
    catch(error){if(error instanceof Error&&/cancelled/i.test(error.message))cancelled=true;else throw error;}
    finally{clearTimeout(timer);}
    report.cancellation={cancelled,abortDelivered:abortAt>0,totalMs:round(performance.now()-start),responseAfterAbortMs:abortAt?round(performance.now()-abortAt):null};
    if(!cancelled||!abortAt)throw new Error('Capture did not stop on a scheduled abort');
    status.textContent='Stress: verifying capture limits…';
    const limited=await capturePageAsync(fixture,{captureMode:'SELECTED_ELEMENT',maxNodes:2500});
    report.limit={capturedNodes:limited.diagnostics.totalNodesCaptured,partialWarning:limited.diagnostics.warnings.some(w=>/maximum node|partial/i.test(w)),sourceElements:fixture.querySelectorAll('*').length};
    if(report.limit.capturedNodes>2500||!report.limit.partialWarning)throw new Error('Capture limit not enforced or partial result not disclosed');
    await render('cards-large');
    const exportDoc=await capturePageAsync(fixture,{captureMode:'SELECTED_ELEMENT',inferAutoLayout:true});await embedImages(exportDoc);
    const exportController=new AbortController();let exportAbortAt=0;const exportStart=performance.now();
    const exportTimer=setTimeout(()=>{exportAbortAt=performance.now();exportController.abort();},20);
    let exportCancelled=false;
    try{await buildNativeClipboard(exportDoc,{signal:exportController.signal});}
    catch(error){if(error instanceof Error&&/cancelled/i.test(error.message))exportCancelled=true;else throw error;}
    finally{clearTimeout(exportTimer);}
    report.nativeCancellation={cancelled:exportCancelled,abortDelivered:exportAbortAt>0,totalMs:round(performance.now()-exportStart),responseAfterAbortMs:exportAbortAt?round(performance.now()-exportAbortAt):null};
    if(!exportCancelled||!exportAbortAt)throw new Error('Native export did not stop on a scheduled abort');
    report.repeatedRuns=[];
    for(let i=0;i<8;i++){
      status.textContent=`Stress: repeated large export ${i+1}/8…`;await pause(100);
      const sample=await measure('cards-large');report.repeatedRuns.push(sample);
    }
    if(report.repeatedRuns.some((sample:any)=>JSON.stringify(sample.counts)!==JSON.stringify(report.repeatedRuns[0].counts)))throw new Error('Repeated exports changed layer counts');
    report.status='passed';status.textContent='Stress checks passed: capture and export cancellation, node limit and 8 repeated large exports. Review report for heap observations and individual synchronous operations.';
  }catch(error){report.status='failed';report.error=error instanceof Error?error.message:String(error);status.textContent='Stress check failed: '+report.error;}
  finally{
    document.querySelector('#stress-report')!.textContent=JSON.stringify(report,null,2);document.documentElement.dataset.stressResult=report.status;
    await render('acceptance');scenarioSelect.value='acceptance';controls.forEach(control=>control.disabled=false);
  }
});

await render('acceptance');
for(const control of [runButton,stressButton,snapshotButton,copyButton,scenarioSelect])control.disabled=false;
status.textContent = `Ready at ${innerWidth} × ${innerHeight} CSS px. Capture the white fixture below.`;

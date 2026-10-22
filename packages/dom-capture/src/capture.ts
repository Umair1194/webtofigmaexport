import { mergeParagraph } from './paragraph.js';
import {captureSizing} from './sizing.js';
import { normalizeCapturedText, measureTextFragments } from "./text-layout.js";
import {
  BoundingBox,
  CaptureDiagnostics,
  Effect,
  FrameNode,
  ImageNode,
  Paint,
  RectangleNode,
  SceneGraphDocument,
  SceneNode,
  SCHEMA_VERSION,
  TextNode,
  UnsupportedNode,
  VectorNode,
  ViewportMeta,
  MAX_SCENE_NODES, DEFAULT_FULL_PAGE_NODES, DEFAULT_CAPTURE_NODES,
} from "@frameforge/scene-graph";
import {
  parseBackgroundImageUrl,
  parseBorders,
  parseBoxShadows,
  parseColor,
  parseCornerRadius,
  parseFills,
  parseTypography,
} from "@frameforge/style-normalizer";
import { shouldSkipElement } from "./filter.js";
import { inferAutoLayout } from "./layout.js";
import { redactFormValue } from "./redact.js";

export interface CaptureOptions {
  captureMode?: "FULL_PAGE" | "VIEWPORT" | "SELECTED_ELEMENT";
  maxNodes?: number;
  redactForms?: boolean;
  inferAutoLayout?: boolean;
  includeHidden?: boolean;
  signal?: AbortSignal;
  frameKeys?: WeakMap<Element, string>;
}

export function captureNodeLimit(options: CaptureOptions): number {
  const requested = Number(options.maxNodes);
  return Number.isFinite(requested) && requested > 0
    ? Math.min(MAX_SCENE_NODES - 1, Math.max(2, Math.floor(requested)))
    : options.captureMode === 'FULL_PAGE' ? DEFAULT_FULL_PAGE_NODES : DEFAULT_CAPTURE_NODES;
}

export function generateLayerName(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const firstClass = element.classList && element.classList.length > 0 ? `.${element.classList[0]}` : "";
  const role = element.getAttribute("role") ? `[role=${element.getAttribute("role")}]` : "";

  if (tag === "button" || role === "[role=button]") return `Button ${firstClass || id}`.trim();
  if (tag === "header") return "Header";
  if (tag === "nav") return "Navigation";
  if (tag === "footer") return "Footer";
  if (tag === "main") return "Main Content";
  if (tag === "article") return "Article";
  if (tag === "aside") return "Sidebar";
  if (tag === "section") return `Section ${id || firstClass}`.trim();
  if (tag === "img") return `Image ${firstClass || id}`.trim();
  if (tag === "svg") return `Icon ${firstClass || id}`.trim();
  if (tag === "h1") return "Heading 1";
  if (tag === "h2") return "Heading 2";
  if (tag === "h3") return "Heading 3";
  if (tag === "h4" || tag === "h5" || tag === "h6") return "Heading";
  if (tag === "p") return "Paragraph";
  if (tag === "input" || tag === "textarea") return `Input ${firstClass || id}`.trim();

  return `${tag}${id || firstClass || ""}`;
}

function* traverse(
  rootElement: Element,
  originX: number,
  originY: number,
  options: CaptureOptions,
  state: { nodeCount: number; diagnostics: CaptureDiagnostics; expanded: Set<string> },
  depth = 0
): Generator<void, SceneNode | null> {
  if (options.signal?.aborted) throw new Error("Capture cancelled.");
  if (depth > 64) { warn(state.diagnostics, "Deep content was truncated at 64 levels."); return null; }
  if (state.nodeCount >= captureNodeLimit(options)) {
    warn(state.diagnostics, "Reached maximum node capture limit; capture is partial.");
    return null;
  }

  const computed = window.getComputedStyle(rootElement);
  if (shouldSkipElement(rootElement, computed, options)) {
    return null;
  }

  const rect = rootElement.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  // Skip 0-size elements unless they have children that might be positioned outside
  if (width <= 0 && height <= 0 && rootElement.children.length === 0) {
    return null;
  }

  const bounds: BoundingBox = {
    x: rect.left - originX,
    y: rect.top - originY,
    width,
    height,
  };

  const id = `node-${++state.nodeCount}`;
  yield;
  const name = generateLayerName(rootElement);
  const tagName = rootElement.tagName.toUpperCase();
  const rawOpacity = parseFloat(computed.opacity);
  const opacity = Number.isFinite(rawOpacity) ? rawOpacity : 1;
  const visible = computed.visibility !== "hidden" && computed.display !== "none";

  const cornerRadius = parseCornerRadius(computed.borderRadius, { tl: computed.borderTopLeftRadius, tr: computed.borderTopRightRadius, br: computed.borderBottomRightRadius, bl: computed.borderBottomLeftRadius }, { width, height });
  const strokes = parseBorders(computed);
  const effects:Effect[] = parseBoxShadows(computed.boxShadow);
  const backdrop=computed.getPropertyValue('backdrop-filter')||computed.getPropertyValue('-webkit-backdrop-filter');
  if(backdrop&&backdrop!=='none'){
    const blur=backdrop.match(/^blur\(([\d.]+)px\)$/);
    if(blur)effects.push({type:'BACKGROUND_BLUR',radius:parseFloat(blur[1]),visible:true});
    else warn(state.diagnostics,'Combined backdrop filters require adjustment.');
  }
  const fills = parseFills(computed, {width,height});
  if (computed.transform && computed.transform !== "none") warn(state.diagnostics, "CSS transforms are captured with axis-aligned bounds; rotated content may differ.");
  if (computed.filter && computed.filter !== "none") warn(state.diagnostics, "CSS filters are not reproduced in editable layers.");
  if ((computed.backgroundImage.match(/(?:repeating-)?(?:linear|radial|conic)-gradient\(/g)||[]).length > fills.filter(p=>p.type!=="SOLID").length) warn(state.diagnostics, "Some gradient layers use unsupported geometry, repetition or interpolation and need adjustment.");
  if (fills.some(p=>p.type!=="SOLID")) {
    if(computed.backgroundSize && computed.backgroundSize.split(',').some(v=>!['auto','auto auto','cover','100% 100%'].includes(v.trim())))warn(state.diagnostics,"Resized background gradients use full element bounds; background sizing/positioning may differ.");
    if(computed.backgroundBlendMode && computed.backgroundBlendMode.split(',').some(v=>v.trim()!=='normal'))warn(state.diagnostics,"Background blend modes require manual adjustment.");
    if(computed.backgroundClip==='text')warn(state.diagnostics,"Gradient-clipped text is not reproduced as a native text fill.");
    if(computed.backgroundImage.includes('url('))warn(state.diagnostics,"Mixed image and gradient background stacking may need adjustment.");
  }
  if (rootElement.tagName.toUpperCase() === "IFRAME") warn(state.diagnostics, "Embedded iframe content is represented by a placeholder.");

  // 1. Image Element
  if (tagName === "IMG") {
    state.diagnostics.totalImages++;
    const img = rootElement as HTMLImageElement;
    return {
      id,
      name,
      type: "IMAGE",
      sizing:captureSizing(rootElement,computed),
      bounds,
      visible,
      opacity,
      srcUrl: img.currentSrc || img.src,
      objectFit: (computed.objectFit?.toUpperCase() as any) || "COVER",
      cornerRadius,
      strokes,
      effects,
    } as ImageNode;
  }

  // 2. SVG Element
  if (tagName === "SVG") {
    state.diagnostics.totalVectors++;
    const svgEl = rootElement as SVGSVGElement;
    return {
      id,
      name,
      type: "VECTOR",
      sizing:captureSizing(rootElement,computed),
      bounds,
      visible,
      opacity,
      svgContent: serializeSvg(svgEl),
      strokes,
    } as VectorNode;
  }

  // 3. Canvas Element
  if (tagName === "CANVAS") {
    state.diagnostics.totalUnsupported++;
    let fallbackImageUrl: string | undefined;
    try {
      fallbackImageUrl = (rootElement as HTMLCanvasElement).toDataURL("image/png");
    } catch {
      // Tainted canvas
    }
    return {
      id,
      name,
      type: "UNSUPPORTED",
      reason: "CANVAS_ELEMENT",
      description: "HTML5 Canvas element (raster fallback provided)",
      bounds,
      visible,
      opacity,
      fallbackImageUrl,
    } as UnsupportedNode;
  }

  // 4. Video Element
  if (tagName === "VIDEO") {
    state.diagnostics.totalUnsupported++;
    const video = rootElement as HTMLVideoElement;
    return {
      id,
      name,
      type: "UNSUPPORTED",
      reason: "VIDEO_ELEMENT",
      description: "Video player element",
      bounds,
      visible,
      opacity,
      fallbackImageUrl: video.poster || undefined,
    } as UnsupportedNode;
  }

  // 5. IFrame Element
  if (tagName === "IFRAME") {
    state.diagnostics.totalUnsupported++;
    return {
      id,
      name,
      type: "UNSUPPORTED",
      reason: "CROSS_ORIGIN_IFRAME",
      attributes: { frameKey: options.frameKeys?.get(rootElement) || "" },
      description: "Embedded iframe subject to browser security restrictions",
      bounds,
      visible,
      opacity,
    } as UnsupportedNode;
  }

  // 6. Form input elements
  if (tagName === "INPUT" || tagName === "TEXTAREA") {
    const input = rootElement as HTMLInputElement;
    const controlType=tagName==='INPUT'?(input.type||'text').toLowerCase():'';
    if(controlType==='checkbox'||controlType==='radio'){
      const children:SceneNode[]=[];
      if((input.checked||input.indeterminate)&&reserveNode(state,options)){
        const color=computed.color||'#ffffff', svg=controlType==='radio'?'<circle cx="12" cy="12" r="5" fill="'+color+'"/>':input.indeterminate?'<path d="M6 12H18"/>':'<path d="M5 12L10 17L19 7"/>';
        children.push({id:id+'-state',name:input.indeterminate?'Indeterminate':'Checked',type:'VECTOR',bounds:{x:0,y:0,width:bounds.width,height:bounds.height},visible:true,opacity:1,svgContent:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+svg+'</svg>'});
      }
      return {id,name,type:'FRAME',bounds,visible,opacity,fills,strokes,cornerRadius,effects,clipsContent:true,children} as FrameNode;
    }
    const rawVal = input.value || input.placeholder || "";
    const redactedText = options.redactForms ? redactFormValue(input, rawVal) : rawVal;

    const children: SceneNode[] = [];
    if (redactedText && reserveNode(state, options)) {
      state.diagnostics.totalTextNodes++;
      let textStyle=computed,placeholderOpacity=1;
      if(input.placeholder&&redactedText===input.placeholder){try{const placeholder=window.getComputedStyle(rootElement,'::placeholder');if(placeholder.color)textStyle=placeholder;const alpha=Number.parseFloat(placeholder.opacity);if(Number.isFinite(alpha))placeholderOpacity=alpha;}catch{}}
      const textColor = parseColor(textStyle.color||computed.color);
      const typography = parseTypography(textStyle.fontSize?textStyle:computed);
      const left=(parseFloat(computed.paddingLeft)||0)+(parseFloat(computed.borderLeftWidth)||0),right=(parseFloat(computed.paddingRight)||0)+(parseFloat(computed.borderRightWidth)||0);
      const lineHeight=typography.lineHeight?.unit==='PIXELS'?typography.lineHeight.value:typography.fontSize*1.2;
      children.push({
        id: `${id}-txt`,
        name: "Input Value",
        type: "TEXT",
        bounds: {
          x: left,
          y: tagName==='TEXTAREA'?(parseFloat(computed.paddingTop)||0)+(parseFloat(computed.borderTopWidth)||0):Math.max(0,(bounds.height-lineHeight)/2),
          width: Math.max(0, bounds.width - left-right),
          height: lineHeight,
        },
        visible: true,
        opacity: placeholderOpacity,
        characters: redactedText,
        style: typography,
        fills: [{ type: "SOLID", color: textColor, visible: true }],
      } as TextNode);
    }

    return {
      id,
      name,
      type: "FRAME",
      bounds,
      visible,
      opacity,
      fills: fills.length > 0 ? fills : [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
      strokes,
      cornerRadius,
      effects,
      clipsContent: true,
      sizing:captureSizing(rootElement,computed),
      children,
    } as FrameNode;
  }

  // 7. General container / element with children
  const children: SceneNode[] = [];
  const stationary = new Set<string>();

  // Check CSS background-image url(...)
  const bgImageUrl = parseBackgroundImageUrl(computed.backgroundImage);
  if (bgImageUrl && reserveNode(state, options)) {
    state.diagnostics.totalImages++;
    children.push({
      id: `${id}-bg-img`,
      name: "Background Image",
      layoutPositioning: "ABSOLUTE",
      type: "IMAGE",
      bounds: { x: 0, y: 0, width: bounds.width, height: bounds.height },
      visible: true,
      opacity: 1,
      srcUrl: bgImageUrl,
      objectFit: "COVER",
    } as ImageNode);
  }

  // Check Pseudo-element ::before
  try {
    const beforeComputed = window.getComputedStyle(rootElement, "::before");
    const beforeContent = beforeComputed.content;
    if (beforeContent && beforeContent !== "none" && beforeContent !== "normal") {
      const cleanContent = beforeContent.replace(/^["']|["']$/g, "").trim();
      if (cleanContent && reserveNode(state, options)) {
        warn(state.diagnostics, "Generated pseudo-element content uses approximate positioning.");
        state.diagnostics.totalTextNodes++;
        children.push({
          id: `${id}-pseudo-before`,
          name: "::before",
          type: "TEXT",
          bounds: { x: 0, y: 0, width: bounds.width, height: bounds.height },
          visible: true,
          opacity: 1,
          characters: cleanContent,
          style: parseTypography(beforeComputed),
          fills: [{ type: "SOLID", color: parseColor(beforeComputed.color), visible: true }],
        } as TextNode);
      }
    }
  } catch {
    // pseudo element read ignored
  }

  // Direct text nodes inside this element
  const sourceChildren = rootElement.shadowRoot ? rootElement.shadowRoot.childNodes : rootElement.childNodes;
  for (const childNode of Array.from(sourceChildren)) {
    if (state.nodeCount >= captureNodeLimit(options)) { warn(state.diagnostics, "Reached maximum node capture limit; capture is partial."); break; }
    if (childNode.nodeType === Node.TEXT_NODE) {
      const rawText = childNode.textContent || "";
      const normalized = normalizeCapturedText(rawText, computed.whiteSpace || "normal");
      const textContent = normalized.text;
      const inlineSpace=textContent.length>0&&!['flex','inline-flex','grid','inline-grid'].includes(computed.display)&&childNode.previousSibling&&childNode.nextSibling;
      if (textContent.trim().length > 0 || inlineSpace) {
        state.diagnostics.totalTextNodes++;
        const typography = parseTypography(computed);
        const textColor = parseColor(computed.color);

        const range = document.createRange();
        range.selectNode(childNode);
        const textRect = range.getBoundingClientRect();
        if(!textContent.trim()&&textRect.width<=0)continue;

        const textBounds: BoundingBox = {
          x: textRect.left - rect.left,
          y: textRect.top - rect.top,
          width: textRect.width || bounds.width,
          height: textRect.height || bounds.height,
        };

        const fragments = textContent.length <= 20000 ? yield* measureTextFragments(childNode, normalized, rect.left + textBounds.x, rect.top + textBounds.y, options.signal) : [];
        if (textContent.length > 20000) warn(state.diagnostics, 'Very long text uses approximate line positioning.');
        children.push({
          id: `text-${++state.nodeCount}`,
          name: textContent.length > 20 ? `${textContent.substring(0, 20)}...` : textContent,
          type: "TEXT",
          bounds: textBounds,
          visible: true,
          opacity: 1,
          characters: textContent,
          fragments: fragments.length ? fragments : undefined,
          textAutoResize: ['nowrap', 'pre'].includes(computed.whiteSpace) && !/[\r\n]/.test(textContent) ? 'WIDTH_AND_HEIGHT' : undefined,
          style: typography,
          fills: [{ type: "SOLID", color: textColor, visible: true }],
        } as TextNode);
      }
    } else if (childNode.nodeType === Node.ELEMENT_NODE && (childNode as Element).tagName==='BR') {
      if(reserveNode(state,options))children.push({id:id+'-br-'+state.nodeCount,name:'Line break',type:'TEXT',bounds:{x:0,y:0,width:0,height:0},visible:true,opacity:1,characters:'\n',style:parseTypography(computed),fills:[]});
    } else if (childNode.nodeType === Node.ELEMENT_NODE) {
      const childSceneNode = yield* traverse(
        childNode as Element,
        rect.left,
        rect.top,
        options,
        state,
        depth + 1
      );
      if (childSceneNode) {
        const childStyle = window.getComputedStyle(childNode as Element);
        const position = childStyle.position;
        if (position === 'fixed' || position === 'sticky') stationary.add(childSceneNode.id);
        // Sticky geometry is already resolved at the captured scroll position.
        // Keep it out of reconstructed flow so it cannot move with the content below it.
        childSceneNode.layoutPositioning = ["absolute", "fixed", "sticky"].includes(position) ? "ABSOLUTE" : "AUTO";
        const z = Number.parseInt(childStyle.zIndex, 10);
        if (Number.isFinite(z) && (position !== 'static' || /flex|grid/.test(computed.display))) childSceneNode.zIndex = z;
        children.push(childSceneNode);
      }
    }
  }

  if (options.captureMode === 'FULL_PAGE') {
    // Expand the main app scroll pane without scrolling/mutating the website.
    // Small independent widgets and the navigation rail retain their viewport.
    const pane = rootElement as HTMLElement;
    const scrolls = [computed.overflow, computed.overflowY].some(v => ['auto', 'scroll'].includes(v));
    if (scrolls && width >= window.innerWidth * .5 && height >= window.innerHeight * .4 && pane.scrollHeight > pane.clientHeight + 1) {
      for (const child of children) if (!stationary.has(child.id)) child.bounds.y += pane.scrollTop;
      bounds.height = Math.max(bounds.height, pane.scrollHeight + (parseFloat(computed.borderTopWidth)||0) + (parseFloat(computed.borderBottomWidth)||0));
      state.expanded.add(id);
    }
    for (const child of children) if (state.expanded.has(child.id)) {
      bounds.height = Math.max(bounds.height, child.bounds.y + child.bounds.height + (parseFloat(computed.paddingBottom)||0) + (parseFloat(computed.borderBottomWidth)||0));
      state.expanded.add(id);
    }
  }
  if(computed.display==='contents'&&children.length){
    const left=Math.min(...children.map(c=>c.bounds.x)),top=Math.min(...children.map(c=>c.bounds.y));
    bounds.x+=left;bounds.y+=top;bounds.width=Math.max(...children.map(c=>c.bounds.x+c.bounds.width))-left;bounds.height=Math.max(...children.map(c=>c.bounds.y+c.bounds.height))-top;
    for(const child of children){child.bounds.x-=left;child.bounds.y-=top;}
    fills.length=0;strokes?.splice(0);effects.length=0;
  }
  function inlineOnly(el:Element,level=0):boolean {
    if(level>64||el.shadowRoot)return false;const display=window.getComputedStyle(el).display;
    return display==='none'||el.tagName==='BR'||(['inline','contents'].includes(display)&&Array.from(el.children).every(c=>inlineOnly(c,level+1)));
  }
  const textOnlyFlow = !rootElement.shadowRoot && !['flex','inline-flex','grid','inline-grid'].includes(computed.display) && Array.from(rootElement.children).every(el=>inlineOnly(el));
  if(textOnlyFlow){
    const inset=(side:string)=>(parseFloat(computed.getPropertyValue('padding-'+side))||0)+(parseFloat(computed.getPropertyValue('border-'+side+'-width'))||0);
    const left=inset('left'),right=inset('right'),top=inset('top'),bottom=inset('bottom');
    const block=['block','flow-root','list-item'].includes(computed.display)&&!['nowrap','pre'].includes(computed.whiteSpace);
    const contentBox=block?{x:left,y:top,width:Math.max(.01,bounds.width-left-right),height:Math.max(.01,bounds.height-top-bottom)}:undefined;
    const paragraph=mergeParagraph(children,bounds.width,parseTypography(computed),left,right,contentBox);
    if(paragraph){children.splice(0,children.length,paragraph);}
  }

  // Auto Layout inference
  const safeFlow = !bgImageUrl && !children.some(c => c.name.startsWith("::")) && Array.from(rootElement.children).every(el => {
    const cs = window.getComputedStyle(el);
    return !["absolute", "fixed", "sticky"].includes(cs.position) && [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft].every(v => !parseFloat(v)) && !parseFloat(cs.flexGrow) && (cs.order === "0" || !cs.order);
  });
  const autoLayout = options.inferAutoLayout !== false && safeFlow
    ? inferAutoLayout(computed, children.length)
    : undefined;

  const clipsContent = [computed.overflow, computed.overflowX, computed.overflowY]
    .some(value => ['hidden', 'clip', 'auto', 'scroll'].includes(value));

  return {
    id,
    name,
    type: "FRAME",
    bounds,
    visible,
    opacity,
    fills,
    strokes,
    cornerRadius,
    effects,
    clipsContent,
    autoLayout,
    sizing: captureSizing(rootElement,computed),
    children,
  } as FrameNode;
}

function* captureDocument(
  targetElement: Element = document.body,
  options: CaptureOptions = {}
): Generator<void, SceneGraphDocument> {
  const startTime = performance.now();
  const mode = options.captureMode || "VIEWPORT";

  const diagnostics: CaptureDiagnostics = {
    totalNodesCaptured: 0,
    totalTextNodes: 0,
    totalImages: 0,
    totalVectors: 0,
    totalUnsupported: 0,
    warnings: [],
    durationMs: 0,
  };

  const state = { nodeCount: 1, diagnostics, expanded: new Set<string>() };

  let originX = 0;
  let originY = 0;

  const docWidth = Math.max(
    document.body?.scrollWidth || 0,
    document.documentElement?.scrollWidth || 0,
    window.innerWidth
  );
  const docHeight = Math.max(
    document.body?.scrollHeight || 0,
    document.documentElement?.scrollHeight || 0,
    window.innerHeight
  );

  if (mode === "SELECTED_ELEMENT") {
    const r = targetElement.getBoundingClientRect();
    originX = r.left;
    originY = r.top;
  } else if (mode === "VIEWPORT") {
    originX = 0;
    originY = 0;
  } else {
    // FULL_PAGE
    originX = -window.scrollX;
    originY = -window.scrollY;
  }

  const rootSceneNode = yield* traverse(targetElement, originX, originY, options, state);
  if (rootSceneNode) rootSceneNode.layoutPositioning = "AUTO";
  const selectedBounds = targetElement.getBoundingClientRect();

  const rootWidth = mode === "SELECTED_ELEMENT" ? selectedBounds.width : mode === "FULL_PAGE" ? docWidth : window.innerWidth;
  const rootHeight = mode === "SELECTED_ELEMENT" ? selectedBounds.height : mode === "FULL_PAGE" ? Math.max(docHeight, rootSceneNode ? rootSceneNode.bounds.y + rootSceneNode.bounds.height : 0) : window.innerHeight;

  if (mode === "FULL_PAGE") warn(diagnostics, "Full page captures currently loaded content; scroll to load lazy sections before capturing.");
  const rootFrame: FrameNode = {
    id: "capture-root", name: document.title || "Page Capture", type: "FRAME",
    bounds: { x: 0, y: 0, width: rootWidth, height: rootHeight },
    visible: true, opacity: 1, clipsContent: true,
    fills: mode === "SELECTED_ELEMENT" ? [] : parseFills(window.getComputedStyle(document.documentElement), {width:rootWidth,height:rootHeight}),
    children: rootSceneNode ? [rootSceneNode] : [],
    sizing: mode==='SELECTED_ELEMENT'&&rootSceneNode?.sizing?.vertical==='HUG'?{vertical:'HUG'}:undefined,
  };
  if (rootFrame.fills.length === 0 && mode !== "SELECTED_ELEMENT") rootFrame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }];

  // Consolidated paragraph pieces no longer exist as separate output nodes.
  diagnostics.totalNodesCaptured=0;diagnostics.totalTextNodes=0;diagnostics.totalImages=0;diagnostics.totalVectors=0;diagnostics.totalUnsupported=0;
  const captured:SceneNode[]=[rootFrame];while(captured.length){const node=captured.pop()!;diagnostics.totalNodesCaptured++;if(node.type==='FRAME')captured.push(...node.children);else if(node.type==='TEXT')diagnostics.totalTextNodes++;else if(node.type==='IMAGE')diagnostics.totalImages++;else if(node.type==='VECTOR')diagnostics.totalVectors++;else if(node.type==='UNSUPPORTED')diagnostics.totalUnsupported++;}
  diagnostics.durationMs = Math.round(performance.now() - startTime);

  const viewport: ViewportMeta = {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    id: `doc-${Date.now()}-${crypto.getRandomValues(new Uint32Array(2)).join("-")}`,
    title: document.title || "Captured Page",
    url: window.location.href,
    capturedAt: new Date().toISOString(),
    captureMode: mode,
    viewport,
    root: rootFrame,
    diagnostics,
  };
}

function warn(diagnostics: CaptureDiagnostics, message: string) {
  if (!diagnostics.warnings.includes(message)) diagnostics.warnings.push(message);
}
function reserveNode(state: { nodeCount: number; diagnostics: CaptureDiagnostics }, options: CaptureOptions) {
  if (state.nodeCount >= captureNodeLimit(options)) { warn(state.diagnostics, "Reached maximum node capture limit; capture is partial."); return false; }
  state.nodeCount++; return true;
}
function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const originals = [svg, ...Array.from(svg.querySelectorAll("*"))];
  const copies = [clone, ...Array.from(clone.querySelectorAll("*"))];
  originals.forEach((el, i) => {
    const cs = window.getComputedStyle(el);
    for (const property of ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "fill-rule", "fill-opacity", "stroke-opacity", "stop-color", "stop-opacity", "color", "opacity", "font-family", "font-size"]) {
      copies[i].setAttribute(property, cs.getPropertyValue(property));
    }
    if('getBBox' in el){try{const b=(el as SVGGraphicsElement).getBBox();if([b.x,b.y,b.width,b.height].every(Number.isFinite))copies[i].setAttribute('data-frameforge-bounds',[b.x,b.y,b.width,b.height].join(','));}catch{}}
    for(const property of ['fill','stroke']){const value=copies[i].getAttribute(property)||'';copies[i].setAttribute(property,value.replace(/url\(["']?[^)]*#([^"')]+)["']?\)/g,(_match,id)=>Array.from(svg.querySelectorAll('[id]')).some(e=>e.id===id)?'url(#'+id+')':_match));}
  });
  // Root CSS opacity is already applied to the captured VECTOR frame.
  clone.setAttribute('opacity','1');
  clone.querySelectorAll("script, foreignObject").forEach(el => el.remove());
  return clone.outerHTML;
}
function drain<T>(iterator: Generator<void, T>): T {
  let step = iterator.next(); while (!step.done) step = iterator.next(); return step.value;
}
export function captureSubtree(...args: Parameters<typeof traverse>): SceneNode | null { return drain(traverse(...args)); }
export function capturePage(target: Element = document.body, options: CaptureOptions = {}): SceneGraphDocument { return drain(captureDocument(target, options)); }
export async function capturePageAsync(target: Element = document.body, options: CaptureOptions = {}): Promise<SceneGraphDocument> {
  const iterator = captureDocument(target, options);
  let start = performance.now();
  let step = iterator.next();
  while (!step.done) {
    if (performance.now() - start > 8) { await new Promise(resolve => setTimeout(resolve, 0)); start = performance.now(); }
    step = iterator.next();
  }
  return step.value;
}

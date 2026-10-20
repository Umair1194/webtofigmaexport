import Clipper from 'clipper-lib';
import type { VectorNetwork } from '@open-pencil/scene-graph';
import type { OutlineCommand } from '@open-pencil/fig/node-change';

/** Preserve editable centerline topology as well as Figma's precomputed render geometry. */
export function vectorNetwork(commands: OutlineCommand[], filled: boolean, windingRule: 'NONZERO'|'EVENODD'='NONZERO'): VectorNetwork {
  const network: VectorNetwork = { vertices: [], segments: [], regions: [] };
  let start = -1, current = -1, loop: number[] = [];
  const vertex = (x = 0, y = 0) => network.vertices.push({ x, y: -y, handleMirroring: 'NONE' }) - 1;
  const segment = (end: number, c1?: { x: number; y: number }, c2?: { x: number; y: number }) => {
    const a = network.vertices[current], b = network.vertices[end];
    loop.push(network.segments.push({ start: current, end, tangentStart: c1 ? { x: c1.x - a.x, y: -c1.y - a.y } : { x: 0, y: 0 }, tangentEnd: c2 ? { x: c2.x - b.x, y: -c2.y - b.y } : { x: 0, y: 0 } }) - 1);
    current = end;
  };
  const finish = () => { if (filled && loop.length) {if(!network.regions.length)network.regions.push({windingRule,loops:[]});network.regions[0].loops.push(loop);} loop = []; };
  for (const c of commands) {
    if (c.type === 'M') { finish(); start = current = vertex(c.x, c.y); }
    if (current < 0) continue;
    if (c.type === 'L') segment(vertex(c.x, c.y));
    if (c.type === 'C') segment(vertex(c.x, c.y), { x: c.x1!, y: c.y1! }, { x: c.x2!, y: c.y2! });
    if (c.type === 'Q') {
      const a = network.vertices[current], ax = a.x, ay = -a.y;
      segment(vertex(c.x, c.y), { x: ax + 2 / 3 * (c.x1! - ax), y: ay + 2 / 3 * (c.y1! - ay) }, { x: c.x! + 2 / 3 * (c.x1! - c.x!), y: c.y! + 2 / 3 * (c.y1! - c.y!) });
    }
    if (c.type === 'Z') { if (current !== start) segment(start); finish(); }
  }
  finish(); return network;
}

/** strokeGeometry is a filled stroke silhouette, never the open SVG centerline. */
export function strokeOutline(commands: OutlineCommand[], width: number, cap: string, join: string): OutlineCommand[] {
  const precision = 1024;
  const offset = new Clipper.ClipperOffset(2, .05 * precision);
  let points: Clipper.Path = [], x = 0, y = 0;
  const add = (px: number, py: number) => points.push({ X: Math.round(px * precision), Y: Math.round(-py * precision) });
  const flush = (closed: boolean) => {
    if (points.length > 1) offset.AddPath(points, join === 'round' ? Clipper.JoinType.jtRound : join === 'bevel' ? Clipper.JoinType.jtSquare : Clipper.JoinType.jtMiter, closed ? Clipper.EndType.etClosedLine : cap === 'round' ? Clipper.EndType.etOpenRound : cap === 'square' ? Clipper.EndType.etOpenSquare : Clipper.EndType.etOpenButt);
    points = [];
  };
  for (const c of commands) {
    if (c.type === 'M') { flush(false); x = c.x!; y = c.y!; add(x, y); }
    if (c.type === 'L') { x = c.x!; y = c.y!; add(x, y); }
    if (c.type === 'C' || c.type === 'Q') {
      const fromX = x, fromY = y;
      const steps = Math.min(64, Math.max(8, Math.ceil((Math.hypot(c.x! - x, c.y! - y) + Math.hypot(c.x1! - x, c.y1! - y)) / 1.5)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        if (c.type === 'C') add(u*u*u*fromX + 3*u*u*t*c.x1! + 3*u*t*t*c.x2! + t*t*t*c.x!, u*u*u*fromY + 3*u*u*t*c.y1! + 3*u*t*t*c.y2! + t*t*t*c.y!);
        else add(u*u*fromX + 2*u*t*c.x1! + t*t*c.x!, u*u*fromY + 2*u*t*c.y1! + t*t*c.y!);
      }
      x = c.x!; y = c.y!;
    }
    if (c.type === 'Z') flush(true);
  }
  flush(false);
  const paths: Clipper.Paths = []; offset.Execute(paths, width / 2 * precision);
  return paths.flatMap(path => path.map((p, index): OutlineCommand => ({ type: index ? 'L' : 'M', x: p.X / precision, y: -p.Y / precision })).concat({ type: 'Z' }));
}

import {describe,it,expect} from 'vitest';
import {parseFills,parseLinearGradient,parseRadialGradient,parseColor} from '../src/index.js';
const size={width:400,height:100};
function sample(p:NonNullable<ReturnType<typeof parseLinearGradient>>,x:number,y:number){const t=p.gradientTransform!;return t.m00*x+t.m01*y+t.m02;}
describe('CSS gradient geometry and stops',()=>{
  it('uses CSS projection length for non-square diagonal gradients',()=>{
    const p=parseLinearGradient('linear-gradient(45deg, red, blue)',size)!;
    expect(sample(p,0,1)).toBeCloseTo(0);expect(sample(p,1,0)).toBeCloseTo(1);
    expect(sample(p,1,1)).toBeCloseTo(.8);
  });
  it('uses aspect-dependent CSS corner directions and supports alternate angle units',()=>{
    const p=parseLinearGradient('linear-gradient(to bottom right, red, blue)',size)!;
    expect(p.angleDegrees).toBeCloseTo(165.9637565);
    expect(parseLinearGradient('linear-gradient(.25turn, red, blue)',size)!.angleDegrees).toBe(90);
    expect(parseLinearGradient('linear-gradient(100grad, red, blue)',size)!.angleDegrees).toBe(90);
  });
  it('distributes omitted positions between explicit neighbours and retains double hard stops',()=>{
    const p=parseLinearGradient('linear-gradient(red 20%, green, blue 80%, white 80% 100%)')!;
    expect(p.stops.map(s=>s.position)).toEqual([.2,.5,.8,.8,1]);
  });
  it('converts pixel stops and preserves extended stops through axis remapping',()=>{
    const p=parseLinearGradient('linear-gradient(90deg, red -100px, blue 500px)',size)!;
    expect(p.stops.map(s=>s.position)).toEqual([0,1]);
    expect(sample(p,0,.5)).toBeCloseTo(1/6);expect(sample(p,1,.5)).toBeCloseTo(5/6);
  });
  it('retains multiple foreground gradient layers and solid background in CSS order',()=>{
    const fills=parseFills({backgroundImage:'linear-gradient(rgba(255, 0, 0, .5), transparent), linear-gradient(90deg, blue, white)',backgroundColor:'rgb(20, 30, 40)'},size);
    expect(fills.map(p=>p.type)).toEqual(['GRADIENT_LINEAR','GRADIENT_LINEAR','SOLID']);
    expect(fills[0].type!=='SOLID'&&fills[0].stops[0].color.a).toBe(.5);
  });
  it('supports sRGB colour functions, percentages, HSL, OKLCH and named colours',()=>{
    expect(parseColor('color(srgb 1 0.25 0 / .5)')).toEqual({r:1,g:.25,b:0,a:.5});
    expect(parseColor('rgb(100% 0% 0%)').r).toBe(1);
    expect(parseColor('hsl(120 100% 50%)').g).toBeCloseTo(1);
    expect(parseColor('rebeccapurple').r).toBeCloseTo(.4);
    const p=parseLinearGradient('linear-gradient(oklch(60% 0.15 40) 0%, color(srgb 0 0 1 / .5) 100%)')!;
    expect(p.stops[0].color.r).toBeGreaterThan(.5);expect(p.stops.at(-1)!.color.a).toBe(.5);
  });
  it('preserves ellipse radii and off-centre circle geometry',()=>{
    const p=parseRadialGradient('radial-gradient(ellipse 100px 50px at 25% 75%, white, transparent)',size)!;
    expect(p.type).toBe('GRADIENT_RADIAL');expect(p.gradientTransform).toEqual({m00:2,m01:0,m02:0,m10:0,m11:1,m12:-.25});
    const circle=parseRadialGradient('radial-gradient(circle closest-side at left center, red, blue)',size);
    expect(circle).toBeUndefined(); // zero radius is degenerate
    const q=parseRadialGradient('radial-gradient(circle at center, red, blue)',size)!;
    expect(q.gradientTransform!.m00/q.gradientTransform!.m11).toBeCloseTo(4);
  });
  it('rejects unsupported repetition, hints and interpolation instead of inventing black colours',()=>{
    for(const css of ['repeating-linear-gradient(red,blue)','linear-gradient(in hsl longer hue,red,blue)','linear-gradient(red,30%,blue)','linear-gradient(bogus,blue)'])expect(parseLinearGradient(css)).toBeUndefined();
    expect(parseRadialGradient('radial-gradient(ellipse at 20px top 10px, red, blue)')).toBeUndefined();
  });
});

it('samples modern interpolation and premultiplied alpha into bounded editable stops',()=>{
 const modern=parseLinearGradient('linear-gradient(in oklab, red, blue)')!;expect(modern.stops.length).toBeGreaterThan(2);expect(modern.stops.length).toBeLessThanOrEqual(100);
 const transparent=parseLinearGradient('linear-gradient(rgba(255,0,0,.7), transparent)')!;expect(transparent.stops.every(s=>s.color.r>.99&&s.color.g<.01)).toBe(true);expect(transparent.stops.at(-1)!.color.a).toBe(0);
});

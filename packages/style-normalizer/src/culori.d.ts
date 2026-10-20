declare module 'culori' {
  export function converter(mode:'rgb'): (value:string|Record<string,unknown>) => {r:number;g:number;b:number;alpha?:number}|undefined;
  export function interpolateWithPremultipliedAlpha(colors:string[], mode:string): (t:number)=>Record<string,unknown>;
}

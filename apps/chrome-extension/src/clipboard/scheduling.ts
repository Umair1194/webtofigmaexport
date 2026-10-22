/** Cooperative checkpoints keep rendering and cancellation events moving between export chunks. */
export function exportScheduler(signal?: AbortSignal) {
  let started=performance.now(), yields=0;
  const check=()=>{if(signal?.aborted)throw new Error('Export cancelled. Your capture is still saved.');};
  return {
    check,
    checkpoint(force=false):Promise<void>|undefined {
      check();
      if(!force&&performance.now()-started<8)return;
      const browserScheduler=(globalThis as typeof globalThis & {scheduler?:{yield?:()=>Promise<void>}}).scheduler;
      // Periodic timer turns also service ordinary messages/timers, not only prioritized continuations.
      const pause=!force&&++yields%4!==0&&browserScheduler?.yield
        ? browserScheduler.yield()
        : new Promise<void>(resolve=>setTimeout(resolve,0));
      return pause.then(()=>{check();started=performance.now();});
    }
  };
}

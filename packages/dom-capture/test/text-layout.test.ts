import { Window } from 'happy-dom';
import { describe, expect, it, vi } from 'vitest';
import { measureTextFragments, normalizeCapturedText } from '../src/text-layout.js';
function drain<T>(generator: Generator<void,T>): T { let step=generator.next();while(!step.done)step=generator.next();return step.value; }
describe('Browser text fragment capture',()=>{
  it('maps collapsed whitespace to raw DOM offsets without collapsing nonbreaking spaces',()=>{
    const result=normalizeCapturedText('Hello \n  world\u00a0!', 'normal');
    expect(result.text).toBe('Hello world\u00a0!');expect(result.spans[5]).toEqual({start:5,end:9});expect(result.spans[6]).toEqual({start:9,end:10});
  });
  it('preserves pre-line line breaks while collapsing horizontal spaces',()=>{
    expect(normalizeCapturedText('hello   world\n next', 'pre-line').text).toBe('hello world\n next');
  });
  it('retains first-line indentation after a bold inline phrase and the next line starting at zero',()=>{
    const win=new Window(), source=win.document.createTextNode('private visible');let start=0,end=0;
    vi.spyOn(win.document,'createRange').mockReturnValue({setStart:(_n:any,i:number)=>{start=i;},setEnd:(_n:any,i:number)=>{end=i;},getBoundingClientRect:()=>({left:100+(start<8?120+start*7:(start-8)*7),top:50+(start<8?0:24),width:(end-start)*7,height:18})} as any);
    const fragments=drain(measureTextFragments(source as any,normalizeCapturedText(source.data,'normal'),100,50));
    expect(fragments).toEqual([{start:0,end:8,bounds:{x:120,y:0,width:56,height:18}},{start:8,end:15,bounds:{x:0,y:24,width:49,height:18}}]);
  });
  it('treats a surrogate pair as one range with two UTF-16 offsets',()=>{
    const win=new Window(), source=win.document.createTextNode('A😀B'), calls:any[]=[];let start=0;
    vi.spyOn(win.document,'createRange').mockReturnValue({setStart:(_n:any,i:number)=>{start=i;},setEnd:(_n:any,i:number)=>calls.push([start,i]),getBoundingClientRect:()=>({left:start*10,top:0,width:10,height:18})} as any);
    drain(measureTextFragments(source as any,normalizeCapturedText(source.data,'normal'),0,0));expect(calls).toEqual([[0,1],[1,3],[3,4]]);
  });
});

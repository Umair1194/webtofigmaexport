import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installCaptureStore } from '../src/background/capture-store.js';
const capture=(id='first')=>({id,schemaVersion:'1.0.0',root:{type:'FRAME',bounds:{x:0,y:0,width:100,height:100},children:[],fills:[]}});
let dispatch:any,saved:any;
beforeEach(()=>{
  saved=undefined;vi.stubGlobal('chrome',{runtime:{onMessage:{addListener:(fn:any)=>dispatch=fn}},storage:{local:{get:vi.fn(async()=>({frameforge_last_capture:saved})),set:vi.fn(async(value:any)=>{saved=value.frameforge_last_capture;}),remove:vi.fn(async()=>{saved=undefined;})}}});installCaptureStore();
});
const request=(message:any)=>new Promise<any>(resolve=>dispatch(message,{},resolve));
describe('Capture storage lifecycle',()=>{
  it('clears the copied capture after saving it',async()=>{await request({type:'SAVE_CAPTURE',document:capture()});expect(saved.id).toBe('first');expect(await request({type:'CLEAR_SAVED_CAPTURE',captureId:'first'})).toEqual({status:'ok',cleared:true});expect(saved).toBeUndefined();});
  it('preserves a newer capture when clearing an older ID',async()=>{await request({type:'SAVE_CAPTURE',document:capture('new')});expect(await request({type:'CLEAR_SAVED_CAPTURE',captureId:'old'})).toEqual({status:'ok',cleared:false});expect(saved.id).toBe('new');});
  it('serializes saves and conditional clears to prevent deleting a newer write',async()=>{
    let release!:()=>void;(chrome.storage.local.set as any).mockImplementationOnce(()=>new Promise<void>(resolve=>{release=()=>{saved=capture('old');resolve();};}));
    const old=request({type:'SAVE_CAPTURE',document:capture('old')});const newer=request({type:'SAVE_CAPTURE',document:capture('new')});const clear=request({type:'CLEAR_SAVED_CAPTURE',captureId:'old'});
    await Promise.resolve();release();await old;await newer;expect(await clear).toMatchObject({cleared:false});expect(saved.id).toBe('new');
  });
  it('recovers the queue after a storage failure',async()=>{(chrome.storage.local.set as any).mockRejectedValueOnce(new Error('Quota exceeded'));expect(await request({type:'SAVE_CAPTURE',document:capture()})).toMatchObject({status:'error'});expect(await request({type:'SAVE_CAPTURE',document:capture('retry')})).toMatchObject({status:'ok'});expect(saved.id).toBe('retry');});
  it('rejects invalid captures and missing cleanup identities',async()=>{expect(await request({type:'SAVE_CAPTURE',document:{}})).toMatchObject({status:'error'});expect(await request({type:'CLEAR_SAVED_CAPTURE'})).toMatchObject({status:'error'});expect(chrome.storage.local.remove).not.toHaveBeenCalled();});
});

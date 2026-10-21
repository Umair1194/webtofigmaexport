import {expect,it} from 'vitest';
import {captureSizing} from '../src/sizing.js';
const element=(width:string,height:string):any=>({parentElement:null,computedStyleMap:()=>({get:(name:string)=>({toString:()=>name==='width'?width:name==='height'?height:''})})});
it('retains CSS auto, fixed and percentage intent rather than inferring it from resolved pixels',()=>{
 const block:any={display:'block',boxSizing:'border-box',flexGrow:'0',maxWidth:'440px'};
 expect(captureSizing(element('auto','auto'),block)).toMatchObject({horizontal:'FILL',vertical:'HUG',maxWidth:440});
 expect(captureSizing(element('160px','90px'),block)).toMatchObject({horizontal:'FIXED',vertical:'FIXED'});
 expect(captureSizing(element('100%','auto'),block)?.horizontal).toBe('FILL');
 expect(captureSizing({} as any,block)).toBeUndefined();
});
it('converts content-box constraints and honours CSS minimums over smaller maximums',()=>{
 const style:any={display:'block',boxSizing:'content-box',paddingLeft:'10px',paddingRight:'10px',borderLeftWidth:'1px',borderRightWidth:'1px',minWidth:'200px',maxWidth:'100px'};
 expect(captureSizing(element('auto','auto'),style)).toMatchObject({minWidth:222,maxWidth:222});
});

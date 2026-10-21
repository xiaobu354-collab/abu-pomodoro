const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function harness(){
  const requests=new Map();
  const node=()=>({setAttribute(){},textContent:''});
  class Svg {
    constructor(id){this.localName='svg';this.id=id;this.dataset={};this.nodes=new Map();}
    querySelector(selector){if(selector==='parsererror')return null;if(!this.nodes.has(selector))this.nodes.set(selector,node());return this.nodes.get(selector);}
  }
  const mount={svg:null,replaceChildren(svg){this.svg=svg;},querySelector(){return this.svg;}};
  const bar={dataset:{},removeAttribute(){}};
  const window={};
  const context={window,console:{error(){}},document:{importNode:node=>node},
    DOMParser:class{parseFromString(source){return {documentElement:new Svg(source)};}},
    fetch(url){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});requests.set(url.slice(-6,-4),{resolve,reject});return promise;}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/renderer/focus-skin.js'),'utf8'),context);
  const view=new window.FocusSkinView(mount,bar);
  const render=id=>view.render({focusSkinId:id,phase:'focus',status:'idle',remainingSeconds:1500,remainingMs:1500000,totalMs:1500000});
  const loaded=async id=>{requests.get(id).resolve({ok:true,text:async()=>id});await new Promise(resolve=>setImmediate(resolve));};
  return {view,mount,bar,requests,render,loaded};
}

test('returning to the visible skin cancels an older in-flight preview',async()=>{
  const h=harness();h.render('01');await h.loaded('01');
  h.render('02');h.render('01');await h.loaded('02');
  assert.equal(h.view.currentId,'01');assert.equal(h.mount.svg.id,'01');
});

test('a superseded load failure cannot cancel the latest requested skin',async()=>{
  const h=harness();h.render('01');await h.loaded('01');
  h.render('02');h.render('03');h.requests.get('02').reject(new Error('unavailable'));
  await new Promise(resolve=>setImmediate(resolve));await h.loaded('03');
  assert.equal(h.view.currentId,'03');assert.equal(h.mount.svg.id,'03');
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('paired renderer updates actual SVG time, exact progress width and running state',async()=>{
  const path='src/renderer/companion-skin.js';
  assert.ok(fs.existsSync(path),'paired renderer must exist');
  const nodes=new Map();
  for(const key of ['timeInk','progressFill','icon-pause']) nodes.set(key,{textContent:'',attributes:{},append(){},setAttribute(k,v){this.attributes[k]=v;}});
  const svg={dataset:{},querySelector:s=>nodes.get(s.match(/"([^"]+)"/)[1]),querySelectorAll:s=>s.includes('timeInk')?[nodes.get('timeInk')]:[nodes.get('progressFill')]};
  const mount={querySelector:()=>svg,replaceChildren(){}};
  const bar={dataset:{},removeAttribute(){}};
  const context={window:{},fetch:async()=>({ok:true,text:async()=>'<svg/>'}),DOMParser:class{parseFromString(){return {documentElement:{localName:'svg',querySelector:()=>null}}}},document:{addEventListener(){},querySelector:()=>null,importNode:()=>svg,createElementNS:()=>({setAttribute(){}})},console};
  vm.runInNewContext(fs.readFileSync(path,'utf8'),context);
  const view=new context.window.CompanionSkinView(mount,bar);
  view.installUndo=()=>{}; // Real SVG construction is covered by verify-inline-undo.cjs.
  for(const id of ['cloud','checklist','scarf','headphones','watering-sprout','book-nook','hammock','picnic','bubble','stars'].flatMap(id=>[id+'-work',id+'-rest'])){
  await view.render({status:'running',remainingSeconds:61,remainingMs:500,totalMs:1000},{mode:'paired',miniAssetId:id});
  assert.equal(nodes.get('timeInk').textContent,'01:01');
  assert.equal(Number(nodes.get('progressFill').attributes.width),527.3903095558546/2);
  assert.equal(svg.dataset.running,'true');
  await view.render({status:'paused',remainingSeconds:0,remainingMs:0,totalMs:1000},{mode:'paired',miniAssetId:id});
  assert.equal(svg.dataset.running,'false');
  assert.equal(bar.dataset.companionSkin,id);
  }
  view.deactivate();
  assert.equal(bar.dataset.companionReady,undefined);
});
test('late async assets cannot overwrite latest request or reactivate legacy mode',async()=>{
  const resolves={};let mounted='';
  const svg={dataset:{},querySelector:()=>({append(){}}),querySelectorAll:()=>[]};
  const bar={dataset:{}};
  const context={window:{},console,fetch:url=>new Promise(resolve=>{resolves[url]=()=>resolve({ok:true,text:async()=>url})}),DOMParser:class{parseFromString(source){return {documentElement:{localName:'svg',source,querySelector:()=>null}}}},document:{addEventListener(){},querySelector:()=>null,importNode(node){mounted=node.source;return svg},createElementNS:()=>({setAttribute(){}})}};
  vm.runInNewContext(fs.readFileSync('src/renderer/companion-skin.js','utf8'),context);
  const view=new context.window.CompanionSkinView({replaceChildren(){},querySelector:()=>svg},bar);
  view.installUndo=()=>{};
  const timer={status:'idle',remainingSeconds:60,totalMs:1000,remainingMs:1000};
  const work=view.render(timer,{mode:'paired',miniAssetId:'cloud-work'});
  const rest=view.render(timer,{mode:'paired',miniAssetId:'cloud-rest'});
  resolves['../../assets/companion-skins/cloud-rest.svg']();await rest;
  resolves['../../assets/companion-skins/cloud-work.svg']();await work;
  assert.match(mounted,/cloud-rest/);
  assert.equal(bar.dataset.companionSkin,'cloud-rest');
  const pending=view.render(timer,{mode:'paired',miniAssetId:'cloud-work'});view.deactivate();await pending;
  assert.equal(bar.dataset.companionReady,undefined);
  assert.match(mounted,/cloud-rest/);
});

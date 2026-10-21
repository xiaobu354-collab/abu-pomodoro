const fs=require('node:fs'),path=require('node:path');
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(require('electron'),[__filename],{stdio:'inherit',env,windowsHide:true});process.exit(r.status??1);}
const {app,BrowserWindow}=require('electron');
const workspace=path.resolve(__dirname,'..');
const root=process.env.MINT_VERIFY_APP_ROOT || workspace;
const output=process.env.MINT_VERIFY_OUTPUT || path.join(workspace,'artifacts/companion-verification');
fs.mkdirSync(output,{recursive:true});app.disableHardwareAcceleration();app.setPath('userData',path.join(output,'verification-profile'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const report={checks:[],errors:[],failures:[]};
const snap=`(()=>{const box=n=>{let r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};const svg=document.querySelector('#companionSkin svg');return {id:svg.dataset.skin,svgDisplay:getComputedStyle(svg).display,running:svg.dataset.running,time:svg.querySelector('[data-geometry="timeInk"]').textContent,progress:Number(svg.querySelector('[data-geometry="progressFill"]').getAttribute('width')),normal:getComputedStyle(svg.querySelector('[data-view="normal"]')).display,hover:getComputedStyle(svg.querySelector('[data-view="hover"]')).display,animation:getComputedStyle(svg.querySelector('[data-geometry="equalizer"] rect')).animationName,play:getComputedStyle(svg.querySelector('.companion-play')).display,zone:box(document.querySelector('.focus-hover-zone')),drag:box(document.querySelector('.focus-drag')),bar:box(elements.bar),buttons:['toggleButton','resetButton','skipButton','settingsButton'].map(id=>{let n=document.getElementById(id),r=box(n);return {id,...r,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id,region:getComputedStyle(n).webkitAppRegion}}),active:document.activeElement.id,undo:box(elements.undoRow)}})()`;
app.whenReady().then(async()=>{
const win=new BrowserWindow({width:270,height:106,frame:false,transparent:true,show:false,webPreferences:{preload:path.join(__dirname,'mock-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:true,backgroundThrottling:false}});
const check=(ok,msg)=>{if(!ok)report.failures.push(msg)};
async function capture(name){
 const picture=await win.webContents.capturePage(),bitmap=picture.toBitmap();let visible=0;
 for(let i=3;i<bitmap.length;i+=4)if(bitmap[i]>64)visible++;
 check(visible>3000,name+' must render nonempty artwork');
 report.checks.push({capture:name,visiblePixels:visible});
 fs.writeFileSync(path.join(output,name+'.png'),picture.toPNG());
}
win.webContents.on('console-message',(_e,...args)=>{const m=typeof args[0]==='object'?args[0].message:args[1];if(/Refused|Failed|Error/.test(m||''))report.errors.push(m)});
async function move(x,y){win.webContents.sendInputEvent({type:'mouseMove',x,y});await wait(80);return win.webContents.executeJavaScript(snap)}
async function state(id,status='running',undo=false){await win.webContents.executeJavaScript(`(async()=>{document.activeElement?.blur();const s=await mintTimer.getState();render({...s,appearance:{mode:'paired',miniAssetId:'${id}'},timer:{...s.timer,phase:'${id.endsWith('-work')?'focus':'shortBreak'}',status:'${status}',remainingSeconds:61,remainingMs:500,totalMs:1000},undo:${undo?"{label:'已跳过',expiresAt:Date.now()+10000}":'null'}});await companionSkin.pending;await document.fonts.ready})()`);}
try{
await win.loadFile(path.join(root,'src/renderer/floating.html'));win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
for(const id of require(path.join(root,'src/companion-themes')).COMPANION_THEMES.flatMap(theme=>[theme.workAssetId,theme.restAssetId])){
await state(id);let s=await move(165,5);check(s.id===id&&s.time==='01:01'&&Math.abs(s.progress-527.3903095558546/2)<1e-8,id+' dynamic fields');check(s.running==='true'&&s.animation==='skinSignalPulse',id+' running breath');
for(const [x,y,on] of [[60,45,false],[165,5,false],[165,100,false],[165,60,true],[149,60,true],[118,60,false],[245,60,false],[165,74,false]]){s=await move(x,y);await wait(80);const stable=await win.webContents.executeJavaScript(snap);check((s.hover!=='none')===on&&(stable.hover!=='none')===on,id+` hover ${x},${y}`);check(s.svgDisplay!=='none',id+` canvas stays visible ${x},${y}`);report.checks.push({id,x,y,snapshot:s});}
s=await move(165,60);for(const b of s.buttons){check(Math.abs(b.width-26)<.001&&Math.abs(b.height-18)<.001&&b.hit===b.id&&b.region==='no-drag',id+' hit '+b.id);check(b.x>=s.drag.x+s.drag.width,id+' drag overlap');}
await capture(id+'-hover');
await win.webContents.executeJavaScript("window.pairedClicks=[];if(!window.pairedWatch){document.addEventListener('click',e=>window.pairedClicks.push(e.target.id));window.pairedWatch=true}");
for(const b of s.buttons){const x=Math.round(b.x+b.width/2),y=Math.round(b.y+b.height/2);await move(x,y);win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x,y});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x,y});await wait(30)}
const clicks=await win.webContents.executeJavaScript('window.pairedClicks');check(s.buttons.every(b=>clicks.includes(b.id)),id+' actual clicks');report.checks.push({id,clicks});
await state(id,'paused');s=await move(165,60);check(s.running==='false'&&s.animation==='none'&&s.play!=='none',id+' pause/play');
await move(165,5);await win.webContents.executeJavaScript('elements.bar.focus()');for(const target of ['toggleButton','resetButton','skipButton','settingsButton']){await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});s=await win.webContents.executeJavaScript(snap);check(s.active===target&&s.hover!=='none',id+' Tab '+target)}
await state(id);await move(165,5);await capture(id+'-normal');
}
await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});check((await win.webContents.executeJavaScript(snap)).animation==='none','reduced motion');
win.setSize(270,142);await state('cloud-rest','paused',true);let s=await move(165,5);check(s.bar.height===106&&s.undo.y>=106&&s.undo.y+s.undo.height<=142,'undo clipping');report.undo=s;fs.writeFileSync(path.join(output,'cloud-rest-undo.png'),(await win.webContents.capturePage()).toPNG());
await win.webContents.executeJavaScript(`(async()=>{const s=await mintTimer.getState();render({...s,appearance:null,timer:{...s.timer,phase:'shortBreak'}})})()`);check(await win.webContents.executeJavaScript("!elements.bar.dataset.companionReady&&getComputedStyle(document.querySelector('#companionSkin')).display==='none'"),'legacy restored');
report.allPassed=!report.failures.length&&!report.errors.length;
}catch(e){report.failures.push(e.stack);report.allPassed=false}finally{fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({allPassed:report.allPassed,failures:report.failures,errors:report.errors}));win.destroy();app.exit(report.allPassed?0:1)}
});


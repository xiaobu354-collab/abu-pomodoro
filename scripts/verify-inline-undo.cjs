// Renderer-only integration checks, all twenty unchanged approved SVG assets.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const r=require('node:child_process').spawnSync(require('electron'),[__filename],{env,stdio:'inherit',windowsHide:true});process.exit(r.status??1);}
const {app,BrowserWindow}=require('electron');
const {COMPANION_THEMES}=require('../src/companion-themes');
const out=process.env.MINT_VERIFY_OUTPUT||path.join(root,'artifacts/undo-hover-lock-20261030');fs.mkdirSync(out,{recursive:true});
app.disableHardwareAcceleration();app.setPath('userData',path.join(out,'isolated-profile'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const report={cases:[],allPassed:false};
app.whenReady().then(async()=>{
  const w=new BrowserWindow({width:1080,height:424,frame:false,show:false,transparent:true,webPreferences:{preload:path.join(root,'scripts/mock-preload.js'),contextIsolation:true,sandbox:true,offscreen:true,backgroundThrottling:false}});
  w.webContents.on('console-message',(_event,details)=>{if(details.level==='error')console.error(details.message);});
  try{
    await w.loadFile(path.join(process.env.MINT_VERIFY_APP_ROOT||root,'src/renderer/floating.html'));w.webContents.setZoomFactor(4);
    const move=async(x,y)=>{w.webContents.sendInputEvent({type:'mouseMove',x:Math.round(x*4),y:Math.round(y*4)});await pause(25);};
    for(const theme of COMPANION_THEMES)for(const rest of [false,true]){
      const id=rest?theme.restAssetId:theme.workAssetId;
      const state={windowMode:'compact',appearance:{mode:'paired',themeId:theme.id,miniAssetId:id},undo:null,
        timer:{phase:rest?'shortBreak':'focus',status:'paused',remainingMs:1042000,remainingSeconds:1042,totalMs:1500000,completedFocusSessions:2},
        settings:{focusTheme:'writing',longBreakInterval:4}};
      await move(5,100);
      await w.webContents.executeJavaScript(`render(${JSON.stringify(state)});void 0`);
      await w.webContents.executeJavaScript(`(async()=>{for(let i=0;i<200;i++){if(document.querySelector('#timerBar').dataset.companionSkin===${JSON.stringify(id)})return;await new Promise(r=>setTimeout(r,10));}throw Error('Theme not loaded');})()`);
      await pause(80);
      const fixed=await w.webContents.executeJavaScript(`Object.fromEntries(['background','character','timeInk','progress'].map(id=>[id,document.querySelector(id==='character'?'#companionSkin [data-geometry="themeCharacter"],#companionSkin [data-geometry="characterScene"]':'#companionSkin [data-geometry="'+id+'"]').outerHTML]))`);
      const undo={label:'已跳过',expiresAt:Date.now()+60000};
      await w.webContents.executeJavaScript(`render(${JSON.stringify({...state,undo})});void 0`);
      await pause(60);
      const info=await w.webContents.executeJavaScript(`(()=>{
        const svg=document.querySelector('#companionSkin>svg'),n=svg.querySelector('[data-geometry="undo-button"]');
        if(!n)return {missing:true};
        const box=n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}};
        return {button:box(n),hit:box(elements.undoButton),row:box(elements.undoRow),rowHidden:elements.undoRow.hidden,label:elements.undoButton.getAttribute('aria-label'),
          phase:getComputedStyle(svg.querySelector('[data-geometry="phaseInk"]')).display,
          controls:getComputedStyle(svg.querySelector('[data-view="hover"]')).display,
          fixed:Object.fromEntries(['background','character','timeInk','progress'].map(id=>[id,svg.querySelector(id==='character'?'[data-geometry="themeCharacter"],[data-geometry="characterScene"]':'[data-geometry="'+id+'"]').outerHTML]))};})()`);
      assert.ok(!info.missing,id+': shared undo component must exist');
      assert.deepEqual(info.fixed,fixed,id+': fixed sources');
      assert.equal(info.rowHidden,false,id+': undo available');assert.equal(info.phase,'none',id+': phase replaced');
      assert.ok(info.label.includes('撤销'),id+': accessible label');
      for(const [k,v]of Object.entries({x:206.5827094549125,y:51.92942828720229,width:37.078125,height:18})){
        assert.ok(Math.abs(info.button[k]-v)<.02,id+': visual '+k+' '+JSON.stringify(info.button));assert.ok(Math.abs(info.hit[k]-v)<.02,id+': hit '+k+' '+JSON.stringify(info.hit));
      }
      // Approach from every side, including the previously failing left-hand
      // path across all three controls. Undo must never be displaced.
      for(const route of [ [[115,60],[130,60],[165,60],[195,60],[225,60]], [[225,85],[225,70],[225,60]], [[255,60],[240,60],[225,60]], [[225,30],[225,50],[225,60]] ]){
        for(const [x,y]of route){
          await move(x,y);
          assert.equal(await w.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#companionSkin>svg>[data-view="hover"]')).display`),'none',id+': undo protected along approach '+x+','+y);
          assert.equal(await w.webContents.executeJavaScript('getComputedStyle(elements.undoRow).opacity'),'1',id+': undo remains visible');
        }
      }
      await move(info.hit.x+info.hit.width/2,info.hit.y+info.hit.height/2);
      assert.equal(await w.webContents.executeJavaScript(`document.elementFromPoint(${info.hit.x+info.hit.width/2},${info.hit.y+info.hit.height/2}).id`),'undoButton',id+': undo hit');
      assert.equal(await w.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#companionSkin>svg>[data-view="normal"]')).display`),'inline',id+': no hover flicker');
      await w.webContents.executeJavaScript('window.undoHits=0;elements.undoButton.addEventListener("click",()=>window.undoHits++,{once:true});void 0');
      for(const type of ['mouseDown','mouseUp'])w.webContents.sendInputEvent({type,x:Math.round((info.hit.x+info.hit.width/2)*4),y:Math.round((info.hit.y+info.hit.height/2)*4),button:'left',clickCount:1});
      await pause(10);assert.equal(await w.webContents.executeJavaScript('window.undoHits'),1,id+': real click');
      await w.webContents.executeJavaScript('document.activeElement?.blur();void 0');
      await move(130,60);
      assert.equal(await w.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#companionSkin [data-view="hover"]')).display`),'none',id+': controls stay locked while undo is active');
      await move(230,60);await move(230,60);
      assert.equal(await w.webContents.executeJavaScript('document.elementFromPoint(230,60).id'),'undoButton',id+': undo has priority over settings');
      await move(5,100);
      await w.webContents.executeJavaScript('elements.bar.focus();void 0');
      w.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await pause(10);
      assert.equal(await w.webContents.executeJavaScript('document.activeElement.id'),'undoButton',id+': keyboard reaches undo');
      assert.equal(await w.webContents.executeJavaScript('getComputedStyle(elements.undoRow).opacity'),'1',id+': undo visible on keyboard focus');
      await w.webContents.executeJavaScript('document.activeElement?.blur();void 0');await move(5,100);await pause(20);
      if(['cloud-work','book-nook-work','bubble-rest'].includes(id))fs.writeFileSync(path.join(out,id+'.png'),(await w.webContents.capturePage()).toPNG());
      // A successful undo clears the lock immediately, not after another timer.
      await w.webContents.executeJavaScript(`render(${JSON.stringify(state)});void 0`);await move(130,60);
      assert.equal(await w.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#companionSkin [data-view="hover"]')).display`),'inline',id+': controls restored when undo is cleared');
      await w.webContents.executeJavaScript(`render(${JSON.stringify({...state,undo})});void 0`);
      assert.equal(await w.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#companionSkin [data-view="hover"]')).display`),'none',id+': undo locks an already-hovered panel');
      await w.webContents.executeJavaScript(`render(${JSON.stringify({...state,undo:{...undo,expiresAt:Date.now()-1}})});void 0`);await pause(10);
      assert.equal(await w.webContents.executeJavaScript('elements.undoRow.hidden'),true,id+': expired undo removed');
      assert.notEqual(await w.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#companionSkin [data-geometry="phaseInk"]')).display`),'none',id+': original label restored');
      await move(230,60);
      assert.equal(await w.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#companionSkin [data-view="hover"]')).display`),'inline',id+': controls restored after expiry');
      assert.equal(await w.webContents.executeJavaScript('document.elementFromPoint(230,60).id'),'settingsButton',id+': settings restored after expiry');
      report.cases.push({id,button:info.button,checks:'geometry, fixed sources, four approach paths, real click, keyboard, lock during undo, release on clear/expiry'});
    }
    report.allPassed=true;fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({allPassed:true,assets:report.cases.length}));w.destroy();app.exit(0);
  }catch(error){console.error(error);w.destroy();app.exit(1);}
});

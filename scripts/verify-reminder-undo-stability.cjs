// Compare both directions of an undo-footer transition with a frozen timer.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const r=require('node:child_process').spawnSync(require('electron'),[__filename],{env,stdio:'inherit',windowsHide:true});process.exit(r.status??1);
}
const {app,BrowserWindow}=require('electron');
const {COMPANION_THEMES}=require('../src/companion-themes');
const {getReminderPack}=require('../src/reminder-content');
const out=process.env.MINT_VERIFY_OUTPUT||path.join(root,'artifacts/reminder-undo-stability-20261030');
fs.mkdirSync(out,{recursive:true});app.disableHardwareAcceleration();app.setPath('userData',path.join(out,'isolated-profile'));
const ids=['reminderCard','mascot','badge','title','body','timer','progress','progressFill','actions','primaryAction','skipRestAction','secondaryAction','tertiaryAction'];
const snapshot=`(()=>{const result={};for(const id of ${JSON.stringify(ids)}){const n=document.getElementById(id),b=n.getBoundingClientRect();result[id]={x:b.x,y:b.y,width:b.width,height:b.height};}return result;})()`;
app.whenReady().then(async()=>{
  const w=new BrowserWindow({width:520,height:300,frame:false,transparent:true,show:false,webPreferences:{preload:path.join(root,'scripts/mock-preload.js'),contextIsolation:true,sandbox:true,offscreen:true,backgroundThrottling:false}});
  const report={allPassed:false,cases:[],maxGeometryDelta:0,outsideFooterPixelChanges:null};
  try{
    await w.loadFile(path.join(process.env.MINT_VERIFY_APP_ROOT||root,'src/renderer/reminder.html'));
    for(const width of [520,420])for(const zoom of [1,1.25]){
      w.setSize(Math.round(width*zoom),Math.round(300*zoom));w.webContents.setZoomFactor(zoom);
      // Window resize and Chromium zoom propagate asynchronously. Begin a pair
      // only after the requested CSS viewport has actually settled.
      await w.webContents.executeJavaScript(`(async()=>{for(let i=0;i<200;i++){if(window.innerWidth===${width}&&window.innerHeight===300){await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return;}await new Promise(r=>setTimeout(r,10));}throw Error('Viewport did not settle');})()`);
      for(const theme of COMPANION_THEMES)for(const variant of [0,1,2])for(const view of ['focusComplete','breakRunning','breakPaused','breakComplete']){
        const key=[width,zoom,theme.id,variant,view].join('-');
        const state={view:view==='breakPaused'?'breakRunning':view,restId:report.cases.length+1,canChangePack:false,appearance:{mode:'paired'},pack:getReminderPack(theme.restPackId,variant),
          timer:{phase:view==='breakComplete'?'focus':'shortBreak',status:view==='breakPaused'?'paused':view==='breakRunning'?'running':'idle',remainingSeconds:298,remainingMs:298000,totalMs:300000},undo:null};
        const draw=async undo=>{
          await w.webContents.executeJavaScript(`(async()=>{render(${JSON.stringify({...state,undo})});el.reminderCard.style.animation='none';await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));})()`);
          return w.webContents.executeJavaScript(snapshot);
        };
        const initial=await draw(null),host=w.getBounds();
        const active={label:'已跳过',expiresAt:Date.now()+60000};
        const capturePair=width===520&&zoom===1&&theme.id==='stars'&&variant===0&&view==='breakRunning';
        let shownImage,footerArea;
        for(const [transition,undo]of [['show',active],['hide',null],['expired',{...active,expiresAt:Date.now()-1}]]){
          const actual=await draw(undo);
          assert.deepEqual(w.getBounds(),host,key+': window bounds '+transition);
          for(const id of ids){
            for(const axis of ['x','y','width','height'])report.maxGeometryDelta=Math.max(report.maxGeometryDelta,Math.abs(actual[id][axis]-initial[id][axis]));
            assert.deepEqual(actual[id],initial[id],key+': '+transition+' must not move '+id);
          }
          assert.equal(await w.webContents.executeJavaScript('el.undoRow.hidden'),transition!=='show',key+': footer visibility '+transition);
          if(transition==='show'){
            const footer=await w.webContents.executeJavaScript(`(()=>{const b=el.undoRow.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};})()`);
            assert.ok(Math.abs(footer.x+footer.width/2-initial.reminderCard.x-initial.reminderCard.width/2)<.02,key+': footer centered');
            for(const id of ['primaryAction','skipRestAction','secondaryAction','tertiaryAction'])if(actual[id].height)assert.ok(actual[id].y+actual[id].height<=footer.y,key+': footer must not overlap '+id);
            if(capturePair){
              await w.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
              shownImage=await w.webContents.capturePage();footerArea=footer;
              fs.writeFileSync(path.join(out,'stars-with-undo.png'),shownImage.toPNG());
            }
          }else if(transition==='hide'&&capturePair){
            await w.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
            const hiddenImage=await w.webContents.capturePage();
            fs.writeFileSync(path.join(out,'stars-without-undo.png'),hiddenImage.toPNG());
            const a=shownImage.toBitmap(),b=hiddenImage.toBitmap(),size=shownImage.getSize();
            assert.deepEqual(hiddenImage.getSize(),size);
            let changes=0;
            for(let y=0;y<size.height;y++)for(let x=0;x<size.width;x++){
              if(x>=footerArea.x-2&&x<=footerArea.x+footerArea.width+2&&y>=footerArea.y-2&&y<=footerArea.y+footerArea.height+2)continue;
              const offset=(y*size.width+x)*4;
              if(a[offset]!==b[offset]||a[offset+1]!==b[offset+1]||a[offset+2]!==b[offset+2]||a[offset+3]!==b[offset+3])changes++;
            }
            report.outsideFooterPixelChanges=changes;
            assert.equal(changes,0,key+': only footer pixels may change');
          }
        }
        report.cases.push({key,geometry:initial});
      }
    }
    report.allPassed=true;fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({allPassed:true,cases:report.cases.length,transitions:report.cases.length*3,maxGeometryDelta:report.maxGeometryDelta}));w.destroy();app.exit(0);
  }catch(error){console.error(error);w.destroy();app.exit(1);}
});

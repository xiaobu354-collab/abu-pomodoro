// Documentation only: mock IPC, temporary profile, no real app startup settings.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(require('electron'),[__filename],{env,stdio:'inherit',windowsHide:true});process.exit(r.status??1);}
const {app,BrowserWindow}=require('electron');
const {getReminderPack}=require('../src/reminder-content');
const root=path.resolve(__dirname,'..'),images=path.join(root,'docs/images');
app.disableHardwareAcceleration();app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'abu-release-docs-')));
app.on('window-all-closed',()=>{});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(w){await w.webContents.executeJavaScript('document.fonts.ready');await w.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.decode()))');await w.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await pause(80);}
function windowFor(width,height){return new BrowserWindow({width,height,frame:false,show:false,backgroundColor:'#ffffff',webPreferences:{preload:path.join(__dirname,'mock-preload.js'),contextIsolation:true,sandbox:true,offscreen:true,backgroundThrottling:false}});}
app.whenReady().then(async()=>{
  fs.mkdirSync(images,{recursive:true});
  const card=windowFor(1040,600);await card.loadFile(path.join(root,'src/renderer/reminder.html'));card.webContents.setZoomFactor(2);
  for(const [pack,view,name]of [['cloud-nap','breakRunning','cloud-card.png'],['picnic','focusComplete','focus-complete-1038.png']]){
    const payload={view,restId:1,canChangePack:false,appearance:{mode:'paired'},pack:getReminderPack(pack),timer:{phase:'shortBreak',status:view==='breakRunning'?'running':'idle',remainingSeconds:298,remainingMs:298000,totalMs:300000},undo:null};
    await card.webContents.executeJavaScript(`render(${JSON.stringify(payload)});el.reminderCard.style.animation='none';void 0`);await ready(card);
    fs.writeFileSync(path.join(images,name),(await card.webContents.capturePage()).toPNG());
  }
  card.destroy();
  const mini=windowFor(1080,424);await mini.loadFile(path.join(root,'src/renderer/floating.html'));mini.webContents.setZoomFactor(4);
  const state={appearance:{mode:'paired',themeId:'cloud',miniAssetId:'cloud-work'},undo:{label:'已跳过',expiresAt:Date.now()+60000},settings:{focusTheme:'writing',longBreakInterval:4},timer:{phase:'focus',status:'paused',remainingSeconds:1499,remainingMs:1499000,totalMs:1500000,completedFocusSessions:0}};
  await mini.webContents.executeJavaScript(`(async()=>{render(${JSON.stringify(state)});await companionSkin.pending;})()`);await ready(mini);
  fs.writeFileSync(path.join(images,'cloud-inline-undo.png'),(await mini.webContents.capturePage()).toPNG());mini.destroy();
  console.log('Captured three isolated 1.0.38 documentation images.');app.quit();
}).catch(error=>{console.error(error);app.exit(1);});

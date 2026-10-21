const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const harnessPath=path.join(__dirname,'support/main-harness.cjs');
const profiles=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'abu-preferences-'));
fs.mkdirSync(profiles,{recursive:true});
function isolatedHarness({readError=false}={}){
 let pendingWrites=0,failAt=Infinity,failRename=false,original;
 const proxy={...fs,
  readFileSync(file,...args){
   if(readError && path.basename(String(file))==='preferences.json'){
    readError=false;original=fs.readFileSync(file,'utf8');
    throw Object.assign(Error('SIMULATED_READ_DENIED'),{code:'EACCES'});
   }
   return fs.readFileSync(file,...args);
  },
  writeFileSync(file,...args){
   if(String(file).endsWith('preferences.json.pending') && ++pendingWrites>=failAt)throw Error('SIMULATED_WRITE_DENIED');
   return fs.writeFileSync(file,...args);
  },
  renameSync(from,to){if(failRename && String(to).endsWith('preferences.json'))throw Error('SIMULATED_RENAME_DENIED');return fs.renameSync(from,to);},
  rmSync(){throw Error('Test profiles must be retained');}
 };
 const realRequire=createRequire(harnessPath),module={exports:{}};
 vm.runInNewContext(fs.readFileSync(harnessPath,'utf8'),{
  require:id=>id==='node:fs'?proxy:id==='node:os'?{...require('node:os'),tmpdir:()=>profiles}:realRequire(id),
  module,exports:module.exports,__dirname:path.dirname(harnessPath),process,console,
  setTimeout,clearTimeout,setImmediate,queueMicrotask
 },{filename:harnessPath});
 return {boot:module.exports.boot,get writes(){return pendingWrites;},get original(){return original;},
  failSecondWrite(){failAt=pendingWrites+2;},failRename(){failRename=true;}};
}
for(const invalid of ['{broken','null','[]','42'])test(`invalid preferences ${invalid} remain intact and block saving`,async()=>{
 const io=isolatedHarness(),h=await io.boot({rawData:invalid,packaged:true,args:['--paired-theme-trial']});
 try{
  let state=await h.invoke('app:get-state');assert.match(state.settingsError,/读取失败/);
  await h.invoke('settings:update',{focusMinutes:15,launchAtLogin:true,pauseShortcut:'Ctrl+Alt+P'});
  await h.invoke('settings:reset');await h.advance(1000);
  assert.equal(fs.readFileSync(path.join(h.dir,'preferences.json'),'utf8'),invalid);
  assert.equal(io.writes,0);assert.equal(h.loginCalls.length,0);assert.equal(h.shortcuts.size,0);
 }finally{h.events.get('will-quit')?.();}
});
test('temporary read denial preserves old settings, progress and startup without later writes',async()=>{
 const io=isolatedHarness({readError:true}),h=await io.boot({packaged:true,args:['--paired-theme-trial'],saved:{settings:{focusMinutes:37,launchAtLogin:false},dailyProgress:{date:'2026-10-20',completedFocusSessions:7}}});
 try{
  const state=await h.invoke('app:get-state');assert.match(state.settingsError,/读取失败/);
  await h.invoke('timer:toggle');await h.advance(1000);await h.invoke('settings:update',{launchAtLogin:true});
  assert.equal(fs.readFileSync(path.join(h.dir,'preferences.json'),'utf8'),io.original);
  assert.equal(io.writes,0);assert.equal(h.loginCalls.length,0);
 }finally{h.events.get('will-quit')?.();}
});
test('settings and idle timer commit together with exactly one write',async()=>{
 const io=isolatedHarness(),h=await io.boot();
 try{
  const before=io.writes;io.failSecondWrite();
  const state=await h.invoke('settings:update',{focusMinutes:15,enabledReminderIds:['cloud-nap']});
  assert.equal(state.settingsError,null);assert.equal(io.writes-before,1);
  assert.equal(state.settings.focusMinutes,15);assert.equal(state.timer.remainingMs,900000);
  assert.equal(h.saved().timerSession.remainingMs,900000);assert.equal(h.saved().timerSession.currentTotalMs,900000);
  assert.deepEqual(Array.from(h.saved().reminderState.catalogIds),['cloud-nap']);
  assert.ok(h.saved().reminderState.remainingIds.every(id=>id==='cloud-nap'));
 }finally{h.events.get('will-quit')?.();}
});
test('failed atomic rename preserves original disk, settings, timer and shortcut',async()=>{
 const io=isolatedHarness(),h=await io.boot();
 try{
  const before=h.saved();io.failRename();
  const state=await h.invoke('settings:update',{focusMinutes:15,pauseShortcut:'Ctrl+Alt+P'});
  assert.equal(state.settings.focusMinutes,5);assert.equal(state.timer.remainingMs,300000);
  assert.match(state.settingsError,/保存失败/);assert.deepEqual(h.saved(),before);assert.equal(h.shortcuts.size,0);
 }finally{h.events.get('will-quit')?.();}
});

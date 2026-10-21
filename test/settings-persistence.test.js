const test=require('node:test');
const assert=require('node:assert/strict');
const {boot}=require('./support/main-harness.cjs');
test('failed settings save preserves memory, timer, disk, shortcut; retry succeeds',async()=>{
 const h=await boot();try{
  const before=await h.invoke('app:get-state');const disk=h.saved();h.failWrites();
  const failed=await h.invoke('settings:update',{focusMinutes:15,pauseShortcut:'Ctrl+Alt+P'});
  assert.equal(failed.settings.focusMinutes,before.settings.focusMinutes);assert.equal(failed.timer.totalMs,before.timer.totalMs);
  assert.deepEqual(h.saved(),disk);assert.equal(h.shortcuts.size,0);assert.match(failed.settingsError,/保存失败/);
  h.failWrites(false);const retried=await h.invoke('settings:update',{focusMinutes:15});assert.equal(retried.settings.focusMinutes,15);assert.equal(retried.settingsError,null);
 }finally{h.close();}
});
test('reset failure is visible and preserves existing choices',async()=>{
 const h=await boot();try{h.failWrites();const s=await h.invoke('settings:reset');assert.equal(s.settings.focusMinutes,5);assert.match(s.settingsError,/保存失败/);}finally{h.close();}
});
test('successful idle duration change persists the same stage displayed in memory',async()=>{
 const h=await boot();try{
  const result=await h.invoke('settings:update',{focusMinutes:15});
  assert.equal(result.timer.remainingMs,900000);
  assert.equal(h.saved().timerSession.remainingMs,result.timer.remainingMs);
  assert.equal(h.saved().timerSession.currentTotalMs,result.timer.totalMs);
 }finally{h.close();}
});
test('packaged startup error still opens application and exposes failure',async()=>{
 const h=await boot({packaged:true,loginFailure:true,args:['--paired-theme-trial']});try{const s=await h.invoke('app:get-state');assert.equal(s.settings.launchAtLogin,true);assert.ok(s.startupError);assert.ok(h.windows.length);}finally{h.close();}
});
test('packaged new startup default and smoke isolation',async()=>{
 for(const smoke of [false,true]){const h=await boot({packaged:true,saved:{settings:{}},args:['--paired-theme-trial',...(smoke?['--smoke-test']:[])]});try{const s=await h.invoke('app:get-state');assert.equal(s.settings.launchAtLogin,true);assert.equal(h.loginCalls.some(x=>x[0]==='set'),!smoke);}finally{h.close();}}
});
test('existing false preferences and Task Manager disable are not re-enabled',async()=>{
 for(const saved of [{settings:{launchAtLogin:false}},{settings:{}}]){
  const h=await boot({packaged:true,saved,args:['--paired-theme-trial'],loginItems:[{name:'MintPomodoro-CloudPairedTrial',enabled:false}]});
  try{assert.equal((await h.invoke('app:get-state')).settings.launchAtLogin,false);assert.equal(h.loginCalls.filter(x=>x[0]==='set').length,0);}finally{h.close();}
 }
});
test('portable restart refreshes own executable only when enabled',async()=>{
 const h=await boot({packaged:true,saved:{settings:{launchAtLogin:true},loginStartupPath:'C:\\old\\app.exe'},args:['--paired-theme-trial'],loginItems:[{name:'MintPomodoro-CloudPairedTrial',path:'C:\\old\\app.exe',enabled:true}]});
 try{const writes=h.loginCalls.filter(x=>x[0]==='set');assert.equal(writes.length,1);assert.equal(writes[0][1].path,process.execPath);assert.equal(writes[0][1].name,'MintPomodoro-CloudPairedTrial');}finally{h.close();}
});
test('rollback restores disabled OS snapshot including original path and args',async()=>{
 const h=await boot({packaged:true,saved:{settings:{launchAtLogin:false}},args:['--paired-theme-trial']});
 try{const original={name:'MintPomodoro-CloudPairedTrial',path:process.execPath,args:['--quiet'],enabled:false};h.setLoginItems([original]);h.failWrites();await h.invoke('settings:update',{launchAtLogin:true});const item=h.getLoginItems()[0];assert.ok(item);assert.equal(item.enabled,false);assert.equal(item.path,original.path);assert.deepEqual(Array.from(item.args),original.args);}finally{h.close();}
});
test('rollback honors external disable after boot instead of stale preference',async()=>{
 const h=await boot({packaged:true,saved:{settings:{launchAtLogin:true}},args:['--paired-theme-trial'],loginItems:[{name:'MintPomodoro-CloudPairedTrial',path:process.execPath,args:[],enabled:true}]});
 try{h.setLoginItems([{name:'MintPomodoro-CloudPairedTrial',path:process.execPath,args:[],enabled:false}]);h.failWrites();await h.invoke('settings:update',{launchAtLogin:false});assert.equal(h.getLoginItems()[0]?.enabled,false);}finally{h.close();}
});
test('idle background persistence failure broadcasts error-only state change',async()=>{
 const h=await boot();try{await h.advance(0);for(const win of h.windows)win.sent.length=0;h.failWrites();await h.invoke('window:toggle-mode');assert.ok(h.windows.some(w=>w.sent.some(x=>x.payload.settingsError)));}finally{h.close();}
});
test('failed disk save rolls startup back and successful retry persists it',async()=>{
 const h=await boot({packaged:true,saved:{settings:{launchAtLogin:false}},args:['--paired-theme-trial']});
 try{h.failWrites();let s=await h.invoke('settings:update',{launchAtLogin:true});assert.equal(s.settings.launchAtLogin,false);assert.match(s.settingsError,/保存失败/);assert.equal(h.loginCalls.filter(x=>x[0]==='set').at(-1)[1].openAtLogin,false);
 h.failWrites(false);s=await h.invoke('settings:update',{launchAtLogin:true});assert.equal(s.settings.launchAtLogin,true);assert.equal(h.saved().settings.launchAtLogin,true);}finally{h.close();}
});
test('unknown legacy path preserves true preference without writing startup or inventing a path',async()=>{
 const h=await boot({packaged:true,saved:{settings:{launchAtLogin:true}},args:['--paired-theme-trial']});
 try{const s=await h.invoke('app:get-state');assert.equal(s.settings.launchAtLogin,true);assert.match(s.startupError,/保留原偏好/);assert.equal(h.saved().settings.launchAtLogin,true);assert.equal(h.saved().loginStartupPath,undefined);assert.equal(h.loginCalls.filter(x=>x[0]==='set').length,0);}finally{h.close();}
});
test('disabled known old path migrates without re-enabling and preserves args',async()=>{
 const old='C:\\old\\cloud.exe';const h=await boot({packaged:true,saved:{settings:{launchAtLogin:false},loginStartupPath:old},args:['--paired-theme-trial'],loginItems:[{name:'MintPomodoro-CloudPairedTrial',path:old,args:['--quiet'],enabled:false}]});
 try{const s=await h.invoke('app:get-state');assert.equal(s.settings.launchAtLogin,false);assert.equal(h.getLoginItems()[0].path,process.execPath);assert.equal(h.getLoginItems()[0].enabled,false);assert.deepEqual(Array.from(h.getLoginItems()[0].args),['--quiet']);assert.equal(h.saved().loginStartupPath,process.execPath);}finally{h.close();}
});

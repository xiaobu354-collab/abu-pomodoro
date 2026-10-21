const test=require('node:test');
const assert=require('node:assert/strict');
const {boot}=require('./support/main-harness.cjs');
async function focusDone(c){await c.invoke('timer:toggle');await c.advance(300_000);}
const card=c=>c.windows.find(w=>w.options.width===520);
test('mini transparent host disables native rectangular window shadow',async t=>{
 const c=await boot();t.after(()=>c.close());
 assert.equal(c.windows[0].options.hasShadow,false);
});
test('upgrade is mini only and native menu remains available',async t=>{
 const c=await boot();t.after(()=>c.close());
 assert.equal(c.windows[0].bounds.width,270);
 assert.equal((await c.invoke('app:get-state')).windowMode,'compact');
 await c.invoke('window:toggle-mode');assert.equal(c.windows[0].bounds.width,270);
 await c.invoke('window:menu');assert.ok(c.popupMenu.some(i=>i.label==='设置'));
 assert.ok(!c.trayMenu.some(i=>i.label?.includes('完整模式')));
});
test('rest card and mini are exclusive and reopening preserves countdown and position',async t=>{
 const c=await boot();t.after(()=>c.close());await focusDone(c);
 assert.equal(c.windows[0].visible,false);assert.equal(card(c).visible,true);
 card(c).setBounds({x:150,y:160,width:520,height:300});
 await c.invoke('reminder:start-break');await c.advance(10_000);
 await c.invoke('reminder:collapse');assert.equal(c.windows[0].visible,true);assert.equal(card(c).visible,false);
 await c.invoke('reminder:reopen');
 assert.equal(c.windows[0].visible,false);assert.equal(card(c).bounds.x,150);
 assert.equal((await c.invoke('app:get-state')).timer.remainingSeconds,50);
});
test('snooze shows waiting bar and reopening cancels scheduled reappearance',async t=>{
 const c=await boot();t.after(()=>c.close());await focusDone(c);
 const id=(await c.invoke('reminder:get-state')).pack.id;
 await c.invoke('reminder:snooze');
 assert.equal((await c.invoke('app:get-state')).waitingForBreak,true);
 await c.invoke('reminder:reopen');await c.invoke('reminder:collapse');await c.advance(120_000);
 assert.equal(card(c).visible,false);assert.equal((await c.invoke('reminder:get-state')).pack.id,id);
});
test('user hidden bar is not resurrected by card collapse but fallback restores nonhidden bar',async t=>{
 const c=await boot();t.after(()=>c.close());await c.invoke('window:hide');await focusDone(c);
 await c.invoke('reminder:collapse');assert.equal(c.windows[0].visible,false);
 const f=await boot({failWindow:true});t.after(()=>f.close());await focusDone(f);
 assert.equal(f.windows[0].visible,true);
});
test('undo running reset subtracts elapsed time, paused reset preserves time',async t=>{
 const c=await boot();t.after(()=>c.close());await c.invoke('timer:toggle');await c.advance(10_000);
 await c.invoke('timer:reset');assert.ok((await c.invoke('app:get-state')).undo);
 await c.advance(2_000);await c.invoke('timer:undo');
 let s=(await c.invoke('app:get-state'));assert.equal(s.timer.remainingSeconds,288);assert.equal(s.timer.status,'running');
 await c.invoke('timer:toggle');await c.invoke('timer:reset');await c.advance(3_000);await c.invoke('timer:undo');
 s=await c.invoke('app:get-state');assert.equal(s.timer.remainingSeconds,288);assert.equal(s.timer.status,'paused');
});
test('undo early finish restores same companion and moved rest card',async t=>{
 const c=await boot();t.after(()=>c.close());await focusDone(c);await c.invoke('reminder:start-break');
 const p=await c.invoke('reminder:get-state');card(c).setBounds({x:220,y:180,width:520,height:300});
 await c.advance(10_000);await c.invoke('reminder:finish-break');await c.advance(2_000);await c.invoke('timer:undo');
 const s=await c.invoke('app:get-state');assert.equal(s.timer.phase,'shortBreak');assert.equal(s.timer.remainingSeconds,48);
 assert.equal((await c.invoke('reminder:get-state')).pack.id,p.pack.id);assert.equal(card(c).bounds.x,220);
});
test('undo expires and new timer actions invalidate it',async t=>{
 const c=await boot();t.after(()=>c.close());await c.invoke('timer:skip');await c.advance(5_001);
 assert.equal((await c.invoke('app:get-state')).undo,null);await c.invoke('timer:undo');
 assert.equal((await c.invoke('app:get-state')).timer.phase,'shortBreak');
 await c.invoke('timer:reset');await c.invoke('timer:toggle');assert.equal((await c.invoke('app:get-state')).undo,null);
});
test('configured shortcut controls only active timer and conflict keeps previous registration',async t=>{
 const c=await boot({blockedShortcuts:['Control+Alt+K']});t.after(()=>c.close());
 let s=await c.invoke('settings:update',{pauseShortcut:'Control+Alt+P'});assert.equal(s.shortcutError,null);
 c.shortcuts.get('Control+Alt+P')();assert.equal((await c.invoke('app:get-state')).timer.status,'idle');
 await c.invoke('timer:toggle');c.shortcuts.get('Control+Alt+P')();assert.equal((await c.invoke('app:get-state')).timer.status,'paused');
 s=await c.invoke('settings:update',{pauseShortcut:'Control+Alt+K'});
 assert.ok(s.shortcutError);assert.equal(s.settings.pauseShortcut,'Control+Alt+P');assert.ok(c.shortcuts.has('Control+Alt+P'));
});
test('changing character leaves timer and rest position unchanged',async t=>{
 const c=await boot();t.after(()=>c.close());await focusDone(c);await c.invoke('reminder:start-break');
 const before=await c.invoke('reminder:get-state');card(c).setBounds({x:180,y:180,width:520,height:300});
 await c.invoke('reminder:change-pack');const after=await c.invoke('reminder:get-state');
 assert.notEqual(after.pack.id,before.pack.id);assert.equal(after.timer.remainingSeconds,before.timer.remainingSeconds);assert.equal(card(c).bounds.x,180);
});
test('invalid shortcut does not unregister the existing valid shortcut',async t=>{
 const c=await boot();t.after(()=>c.close());
 await c.invoke('settings:update',{pauseShortcut:'Control+Alt+P'});
 const s=await c.invoke('settings:update',{pauseShortcut:'nonsense'});
 assert.equal(s.settings.pauseShortcut,'Control+Alt+P');assert.ok(c.shortcuts.has('Control+Alt+P'));assert.ok(s.shortcutError);
});
test('restart resumes one moved card and preserves its chosen copy variant',async t=>{
 const c=await boot();t.after(()=>c.close());await focusDone(c);await c.invoke('reminder:start-break');
 const win=card(c);win.setBounds({x:250,y:120,width:520,height:300});win.emit('move');
 await c.invoke('reminder:toggle-pause');const p=await c.invoke('reminder:get-state');
 const r=await boot({saved:c.saved()});t.after(()=>r.close());
 assert.equal(r.windows[0].visible,false);assert.equal(card(r).bounds.x,250);
 assert.equal((await r.invoke('reminder:get-state')).pack.variantIndex,p.pack.variantIndex);
});
test('renderer crash restores mini and reopening restores card on screen',async t=>{
 const c=await boot();t.after(()=>c.close());await focusDone(c);const win=card(c);
 win.setBounds({x:300,y:140,width:520,height:300});win.emit('move');
 win.webContents.emit('render-process-gone');assert.equal(c.windows[0].visible,true);
 await c.invoke('reminder:reopen');const alive=c.windows.find(w=>w.options.width===520&&!w.destroyed);
 assert.equal(alive.visible,true);assert.equal(alive.bounds.x,300);assert.equal(c.windows[0].visible,false);
});
test('natural completion invalidates undo and undo skip restores role bag',async t=>{
 const c=await boot();t.after(()=>c.close());await focusDone(c);await c.invoke('reminder:start-break');
 const before=c.saved().reminderState;await c.invoke('timer:skip');await c.invoke('timer:undo');
 const after=c.saved().reminderState;assert.deepEqual(after.remainingIds,before.remainingIds);assert.equal(after.currentId,before.currentId);
 await c.advance(59_000);await c.invoke('timer:reset');await c.invoke('timer:undo');await c.advance(1_000);
 assert.equal((await c.invoke('app:get-state')).undo,null);assert.equal((await c.invoke('app:get-state')).timer.phase,'focus');
});
test('mini upgrade clamps a previously partially offscreen long bar position',async t=>{
 const c=await boot({saved:{windowPosition:{x:1800,y:1030}}});t.after(()=>c.close());
 const b=c.windows[0].bounds;assert.equal(b.x,1650);assert.equal(b.y,984);
});
test('role preferences keep current disabled companion, then use the sole enabled role',async t=>{
 const c=await boot();t.after(()=>c.close());await focusDone(c);
 const original=(await c.invoke('reminder:get-state')).pack.id;
 const selected=original==='window-tea'?'stretch':'window-tea';
 await c.invoke('settings:update',{enabledReminderIds:[selected]});
 assert.equal((await c.invoke('reminder:get-state')).pack.id,original);
 await c.invoke('reminder:change-pack');assert.equal((await c.invoke('reminder:get-state')).pack.id,selected);
 await c.invoke('reminder:change-pack');assert.equal((await c.invoke('reminder:get-state')).pack.id,selected);
});
test('smoke hook is attached before restoration yields the first page load',async t=>{
 const c=await boot({args:['--smoke-test']});t.after(()=>c.close());
 await new Promise(resolve=>setTimeout(resolve,600));
 assert.equal(c.exitCode,0);
});
test('system closing rest card acts as collapse and restores mini',async t=>{
 const c=await boot();t.after(()=>c.close());await focusDone(c);card(c).close();
 assert.equal(card(c).visible,false);assert.equal(c.windows[0].visible,true);
 assert.equal((await c.invoke('reminder:get-state')).visible,false);
 await c.invoke('reminder:reopen');assert.equal(card(c).visible,true);
});
test('undo row stays on screen at bottom edge and restores original mini position',async t=>{
 const c=await boot({saved:{windowPosition:{x:100,y:984}}});t.after(()=>c.close());
 await c.invoke('timer:reset');assert.equal(c.windows[0].bounds.height,132);assert.equal(c.windows[0].bounds.y,948);
 await c.advance(5001);assert.equal(c.windows[0].bounds.height,96);assert.equal(c.windows[0].bounds.y,984);
});
for(const cardLoad of ['reject','hang'])test(`card loading ${cardLoad} restores mini and sends one fallback`,async t=>{
 const c=await boot({cardLoad});t.after(()=>c.close());await focusDone(c);
 await new Promise(resolve=>setTimeout(resolve,30));await c.flush();
 assert.equal(c.windows[0].visible,true);assert.equal(c.notifications.length,1);
 assert.equal((await c.invoke('reminder:get-state')).visible,false);
});

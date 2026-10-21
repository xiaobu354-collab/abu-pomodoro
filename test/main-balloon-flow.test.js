const test=require('node:test');
const assert=require('node:assert/strict');
const {boot}=require('./support/main-harness.cjs');
test('completed focus opens a centered card; clicks start and end rest',async t=>{
 const c=await boot();t.after(()=>c.close());
 await c.invoke('timer:toggle');await c.advance(300_000);
 assert.ok(c.handlers.has('reminder:start-break'));
 const card=c.windows.find(w=>w.options.width===520);
 assert.ok(card?.visible);
 assert.deepEqual(card.getBounds(),{x:700,y:390,width:520,height:300});
 assert.equal(c.windows.filter(w=>w.options.width===112).length,0);
 assert.equal(c.notifications.length,0);
 let payload=await c.invoke('reminder:get-state');
 assert.equal(payload.view,'focusComplete');
 const id=payload.pack.id;
 await c.invoke('reminder:start-break');
 assert.equal((await c.invoke('app:get-state')).timer.status,'running');
 await c.invoke('reminder:finish-break');
 payload=await c.invoke('reminder:get-state');
 assert.equal(payload.view,'breakComplete');assert.equal(payload.pack.id,id);
 await c.invoke('reminder:extend-break');
 assert.equal((await c.invoke('app:get-state')).timer.remainingSeconds,120);
});
test('auto-start obeys setting and hides acknowledgement after three seconds',async t=>{
 const c=await boot({auto:true});t.after(()=>c.close());
 await c.invoke('timer:toggle');await c.advance(300_000);
 assert.equal((await c.invoke('reminder:get-state')).view,'breakRunning');
 await c.advance(60_000);
 assert.equal((await c.invoke('reminder:get-state')).view,'focusAutoStarted');
 await c.advance(3_000);
 assert.equal(c.windows.find(w=>w.options.width===520).visible,false);
 assert.equal((await c.invoke('app:get-state')).timer.status,'running');
});
test('window creation failure produces only fallback system notification',async t=>{
 const c=await boot({failWindow:true});t.after(()=>c.close());
 await c.invoke('timer:toggle');await c.advance(300_000);
 assert.equal(c.notifications.length,1);
 assert.equal((await c.invoke('app:get-state')).timer.phase,'shortBreak');
});
test('resetting the current break retains its companion and resets only timer',async t=>{
 const c=await boot();t.after(()=>c.close());
 await c.invoke('timer:toggle');await c.advance(300_000);await c.invoke('reminder:start-break');
 const id=(await c.invoke('reminder:get-state')).pack.id;
 await c.invoke('timer:reset');
 assert.equal((await c.invoke('reminder:get-state')).pack.id,id);
 assert.equal((await c.invoke('app:get-state')).timer.status,'idle');
});
test('invalid preference root is repaired instead of blocking startup',async t=>{
 const c=await boot({rawData:'null'});t.after(()=>c.close());
 assert.equal((await c.invoke('app:get-state')).timer.phase,'focus');
});
test('dragged card stays in place throughout one rest and centers for the next rest',async t=>{
 const c=await boot();t.after(()=>c.close());
 await c.invoke('timer:toggle');await c.advance(300_000);
 const card=c.windows.find(w=>w.options.width===520);
 card.setBounds({x:150,y:160,width:520,height:300});
 await c.invoke('reminder:start-break');
 assert.equal(card.getBounds().x,150);
 await c.invoke('reminder:toggle-pause');await c.invoke('reminder:toggle-pause');
 await c.invoke('reminder:collapse');await c.advance(60_000);
 assert.equal(card.getBounds().x,150);
 await c.invoke('reminder:extend-break');assert.equal(card.getBounds().x,150);
 await c.invoke('reminder:finish-break');await c.invoke('reminder:start-focus');await c.advance(300_000);
 assert.equal(card.getBounds().x,700);
});

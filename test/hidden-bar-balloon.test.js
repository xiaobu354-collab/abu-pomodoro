const test=require('node:test');
const assert=require('node:assert/strict');
const {boot}=require('./support/main-harness.cjs');
test('hidden floating bar still receives centered rest reminder, collapsed card stays hidden until rest completes',async t=>{
 const c=await boot({mode:'compact'});t.after(()=>c.close());
 await c.invoke('timer:toggle');await c.invoke('window:hide');await c.advance(300_000);
 const card=c.windows.find(w=>w.options.width===520);
 assert.ok(card?.visible);
 await c.invoke('reminder:start-break');await c.invoke('reminder:collapse');
 await c.advance(20_000);assert.equal(card.visible,false);
 await c.advance(40_000);assert.equal(card.visible,true);
 assert.equal((await c.invoke('reminder:get-state')).view,'breakComplete');
});
test('timer pause is saved and display changes constrain rather than recenter the card',async t=>{
 const c=await boot();t.after(()=>c.close());
 await c.invoke('timer:toggle');await c.advance(300_000);await c.invoke('reminder:start-break');
 await c.advance(10_000);await c.invoke('reminder:toggle-pause');
 assert.equal(c.saved().timerSession.status,'paused');
 assert.equal(c.saved().timerSession.remainingMs,50_000);
 const card=c.windows.find(w=>w.options.width===520);card.setBounds({x:-5000,y:0,width:520,height:300});
 c.screenEvents.get('display-removed')();
 assert.equal(card.getBounds().x,0);
 card.setBounds({x:200,y:100,width:520,height:300});c.screenEvents.get('display-metrics-changed')();
 assert.equal(card.getBounds().x,200);
});

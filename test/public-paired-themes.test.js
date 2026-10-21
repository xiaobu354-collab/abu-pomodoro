const test=require('node:test');
const assert=require('node:assert/strict');
const {boot}=require('./support/main-harness.cjs');
const options={args:['--paired-theme-trial']};

test('legacy odd counter keeps cloud then checklist pair survives restart and undo back from scarf',async t=>{
  const h=await boot({...options,saved:{timerSession:{companionCycleIndex:7}}});t.after(()=>h.close());
  assert.equal((await h.invoke('app:get-state')).appearance.themeId,'cloud');
  await h.invoke('timer:skip');await h.invoke('reminder:skip-break');
  let state=await h.invoke('app:get-state');assert.equal(state.appearance.miniAssetId,'checklist-work');
  assert.equal(state.timer.companionCycleIndex,8);
  await h.advance(300000);
  let card=await h.invoke('reminder:get-state');assert.equal(card.pack.id,'stretch');
  assert.equal(card.appearance.miniAssetId,'checklist-rest');assert.equal(card.canChangePack,false);
  await h.invoke('reminder:start-break');await h.invoke('timer:toggle');await h.invoke('reminder:collapse');
  const restarted=await boot({...options,saved:h.saved()});t.after(()=>restarted.close());
  assert.equal((await restarted.invoke('app:get-state')).appearance.miniAssetId,'checklist-rest');
  await restarted.invoke('reminder:reopen');
  const before=await restarted.invoke('reminder:get-state');
  await restarted.invoke('reminder:change-pack');
  assert.equal((await restarted.invoke('reminder:get-state')).pack.id,'stretch');
  await restarted.invoke('reminder:finish-break');
  assert.equal((await restarted.invoke('app:get-state')).appearance.miniAssetId,'scarf-work');
  card=await restarted.invoke('reminder:get-state');assert.equal(card.appearance.miniAssetId,'checklist-rest');
  assert.equal(card.pack.id,'stretch');
  await restarted.invoke('timer:undo');
  card=await restarted.invoke('reminder:get-state');
  assert.equal(card.restId,before.restId);assert.deepEqual(card.position,before.position);
  assert.equal(card.timer.companionThemeId,'checklist-stretch');assert.equal(card.pack.id,'stretch');
});

test('paired themes use mini height and one shared identity through work, card and collapsed rest',async t=>{
  const h=await boot(options);t.after(()=>h.close());
  let state=await h.invoke('app:get-state');
  assert.equal(state.appearance?.themeId,'cloud');assert.equal(state.appearance.miniAssetId,'cloud-work');
  assert.equal(h.windows[0].bounds.height,106);
  assert.equal(state.reminderPacks.length,10);assert.equal(state.reminderPacks[0].id,'cloud-nap');
  await h.invoke('timer:toggle');await h.advance(300000);
  let card=await h.invoke('reminder:get-state');
  assert.equal(card.pack.id,'cloud-nap');assert.equal(card.appearance.themeId,'cloud');
  assert.equal(card.canChangePack,false);
  await h.invoke('reminder:start-break');await h.invoke('reminder:collapse');
  state=await h.invoke('app:get-state');assert.equal(state.appearance.miniAssetId,'cloud-rest');
  const id=card.restId;await h.invoke('reminder:change-pack');await h.invoke('reminder:reopen');
  card=await h.invoke('reminder:get-state');assert.equal(card.pack.id,'cloud-nap');assert.equal(card.restId,id);
  const skipped=await h.invoke('reminder:skip-break');assert.equal(skipped.appearance.miniAssetId,'checklist-work');
  assert.equal(h.windows[0].bounds.height,142);
  const undone=await h.invoke('timer:undo');assert.equal(undone.appearance.miniAssetId,'cloud-rest');
  card=await h.invoke('reminder:get-state');assert.equal(card.pack.id,'cloud-nap');assert.equal(card.restId,id);
});

test('paired themes ignore legacy preview cycling and restore the session without consuming another role',async t=>{
  const h=await boot({...options,auto:true});t.after(()=>h.close());
  await h.invoke('window:menu');assert.ok(!h.popupMenu.some(i=>i.label==='预览下一套外观'));
  await h.invoke('timer:toggle');await h.advance(300000);
  const before=await h.invoke('reminder:get-state');
  // Pause before restarting the independent fake clock, just as a paused session
  // has no wall-clock endAt dependency across processes.
  await h.invoke('timer:toggle');await h.invoke('reminder:collapse');
  const saved=h.saved();
  const restarted=await boot({...options,saved});t.after(()=>restarted.close());
  const state=await restarted.invoke('app:get-state');const card=await restarted.invoke('reminder:get-state');
  assert.equal(state.appearance?.miniAssetId,'cloud-rest');assert.equal(card.pack.id,'cloud-nap');assert.equal(card.restId,before.restId);
  assert.equal(state.timer.status,'paused');await restarted.invoke('timer:toggle');
  await restarted.advance(60000);
  const next=await restarted.invoke('app:get-state');const done=await restarted.invoke('reminder:get-state');
  assert.equal(next.appearance.miniAssetId,'checklist-work');assert.equal(next.timer.companionCycleIndex,1);
  assert.equal(done.appearance.restPackId,'cloud-nap');assert.equal(done.appearance.miniAssetId,'cloud-rest');
});

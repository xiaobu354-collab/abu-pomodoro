const test=require('node:test');
const assert=require('node:assert/strict');
const {TimerEngine}=require('../src/timer-engine');
const {DEFAULT_SETTINGS}=require('../src/config');

test('paired cycle identity advances once after rest and survives extension, reset and restore',()=>{
  const timer=new TimerEngine(DEFAULT_SETTINGS,()=>1000);
  assert.equal(timer.snapshot().companionCycleIndex,0);
  timer.skip();assert.equal(timer.snapshot().companionCycleIndex,0);
  timer.skip();assert.equal(timer.snapshot().companionCycleIndex,1);
  timer.reset();assert.equal(timer.snapshot().companionCycleIndex,1);
  timer.startBreakExtension();
  const restored=new TimerEngine(DEFAULT_SETTINGS,()=>1000,0,timer.exportState());
  restored.skip();assert.equal(restored.snapshot().companionCycleIndex,1);
  for(let i=0;i<4;i++){restored.skip();restored.skip();}
  assert.equal(restored.snapshot().companionCycleIndex,5);
  assert.equal(new TimerEngine(DEFAULT_SETTINGS,()=>1000,0,{...timer.exportState(),companionCycleIndex:-1}).snapshot().companionCycleIndex,0);
});

test('one complete cloud theme supplies paired work, rest mini and central pack identities',()=>{
  const {getCompanionAppearance,COMPANION_THEMES}=require('../src/companion-themes');
  assert.equal(COMPANION_THEMES.length,10);
  const work=getCompanionAppearance({phase:'focus',companionCycleIndex:5});
  const rest=getCompanionAppearance({phase:'longBreak',companionCycleIndex:5},'cloud-nap');
  const finishedCard=getCompanionAppearance({phase:'focus',companionCycleIndex:6},'cloud-nap',true);
  assert.equal(work.themeId,'cloud');assert.equal(work.workName,'云朵写字');
  assert.equal(work.miniAssetId,'cloud-work');assert.equal(rest.miniAssetId,'cloud-rest');
  assert.equal(rest.restPackId,'cloud-nap');assert.equal(finishedCard.miniAssetId,'cloud-rest');
  assert.equal(rest.restName,'云朵小睡');assert.deepEqual(work.viewport,{width:270,height:106});
});

test('stable theme survives legacy odd counters, restart and extension while alternating whole pairs',()=>{
  const {getCompanionAppearance}=require('../src/companion-themes');
  const timer=new TimerEngine(DEFAULT_SETTINGS,()=>1000,0,{companionCycleIndex:5});
  assert.equal(timer.snapshot().companionThemeId,'cloud');
  assert.equal(getCompanionAppearance({phase:'focus',companionCycleIndex:5}).themeId,'cloud');
  timer.skip();timer.skip();
  assert.equal(timer.snapshot().companionThemeId,'checklist-stretch');
  assert.equal(getCompanionAppearance(timer.snapshot()).miniAssetId,'checklist-work');
  timer.pause();timer.reset();timer.startBreakExtension();
  const restarted=new TimerEngine(DEFAULT_SETTINGS,()=>1000,0,timer.exportState());
  restarted.skip();assert.equal(restarted.snapshot().companionThemeId,'checklist-stretch');
  restarted.skip();assert.equal(getCompanionAppearance(restarted.snapshot(),'stretch').miniAssetId,'checklist-rest');
  restarted.skip();assert.equal(restarted.snapshot().companionThemeId,'scarf');
  assert.equal(getCompanionAppearance(restarted.snapshot(),'stretch',true).miniAssetId,'checklist-rest');
});

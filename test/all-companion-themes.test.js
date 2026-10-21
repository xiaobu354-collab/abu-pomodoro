const test=require('node:test'),assert=require('node:assert/strict');
const {COMPANION_THEMES,getCompanionAppearance}=require('../src/companion-themes');
const {TimerEngine}=require('../src/timer-engine');
const {DEFAULT_SETTINGS}=require('../src/config');
const ids=['cloud','checklist-stretch','scarf','headphones','watering-sprout','book-nook','hammock','picnic','bubble','stars'];
const packs=['cloud-nap','stretch','window-tea','headphones-beanbag','watering-sprout','book-nook','hammock','snack-picnic','bubble-soak','stargazing'];

test('ten approved themes have unique paired work/rest assets and matching central cards',()=>{
 assert.deepEqual(COMPANION_THEMES.map(t=>t.id),ids);
 assert.deepEqual(COMPANION_THEMES.map(t=>t.restPackId),packs);
 assert.equal(new Set(COMPANION_THEMES.flatMap(t=>[t.workAssetId,t.restAssetId])).size,20);
 for(const theme of COMPANION_THEMES){
  const timer={phase:'focus',companionThemeId:theme.id};
  assert.equal(getCompanionAppearance(timer).miniAssetId,theme.workAssetId);
  assert.equal(getCompanionAppearance({...timer,phase:'shortBreak'},theme.restPackId).miniAssetId,theme.restAssetId);
  const outgoing=getCompanionAppearance({...timer,companionThemeId:'cloud'},theme.restPackId,true);
  assert.equal(outgoing.themeId,theme.id);assert.equal(outgoing.restPackId,theme.restPackId);
 }
});

test('all ten pairs rotate only after rest, survive restore/reset, and wrap to cloud',()=>{
 let timer=new TimerEngine(DEFAULT_SETTINGS,()=>1000);
 for(let i=0;i<10;i++){
  assert.equal(timer.snapshot().companionThemeId,ids[i]);
  timer.skip();assert.notEqual(timer.phase,'focus');
  assert.equal(timer.snapshot().companionThemeId,ids[i]);
  const saved=timer.exportState();timer=new TimerEngine(DEFAULT_SETTINGS,()=>1000,0,saved);
  assert.equal(timer.snapshot().companionThemeId,ids[i]);
  timer.reset();assert.equal(timer.snapshot().companionThemeId,ids[i]);
  timer.skip();assert.equal(timer.phase,'focus');
  assert.equal(timer.snapshot().companionThemeId,ids[(i+1)%10]);
 }
 assert.equal(timer.snapshot().companionCycleIndex,10);
});

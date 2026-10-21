const test=require('node:test');
const assert=require('node:assert/strict');
const {createLoginStartup}=require('../src/login-startup');
function fixture(options={}){
  let items=[],calls=[];
  const app={getLoginItemSettings(query){calls.push(['get',query]);return {launchItems:items.filter(item=>(item.path||'C:\\Cloud\\Cloud.exe')===query.path)};},setLoginItemSettings(value){calls.push(['set',value]);items=items.filter(item=>item.name!==value.name);if(value.openAtLogin)items.push({...value,args:value.args||[],enabled:value.enabled});}};
  return {api:createLoginStartup({app,packaged:true,paired:true,execPath:'C:\\Cloud\\Cloud.exe',...options}),calls,setItems(value){items=value;}};
}
test('portable startup writes exact executable and independent name, supports disable',()=>{
  const f=fixture();assert.equal(f.api.apply(true),true);
  const write=f.calls.find(x=>x[0]==='set')[1];
  assert.equal(write.path,'C:\\Cloud\\Cloud.exe');assert.equal(write.name,'MintPomodoro-CloudPairedTrial');
  assert.equal(f.api.read(),true);assert.equal(f.api.apply(false),false);
});
test('query honors own disabled item and ignores other products',()=>{
  const f=fixture();f.setItems([{name:'MintPomodoro',enabled:true},{name:'MintPomodoro-CloudPairedTrial',enabled:false}]);assert.equal(f.api.read(),false);
});
test('smoke and development never query or write system startup',()=>{
  for(const options of [{smoke:true},{packaged:false}]){const f=fixture(options);assert.equal(f.api.apply(true),true);assert.equal(f.api.read(true),true);assert.equal(f.calls.length,0);}
});
test('refused writes and unreadable status fail rather than report enabled',()=>{
  for(const app of [{setLoginItemSettings(){},getLoginItemSettings(){return {launchItems:[]};}},{setLoginItemSettings(){},getLoginItemSettings(){throw Error('denied');}}]){
    const api=createLoginStartup({app,packaged:true,paired:true,execPath:'C:\\Cloud.exe'});assert.throws(()=>api.apply(true));
  }
});
test('known old path is queried explicitly and disabled snapshot can be restored exactly',()=>{
  const old='C:\\OldCloud\\Cloud.exe',f=fixture({getKnownPath:()=>old});
  f.setItems([{name:'MintPomodoro',path:old,enabled:true},{name:'MintPomodoro-CloudPairedTrial',path:old,args:['--quiet'],enabled:false}]);
  const snapshot=f.api.snapshot();assert.equal(snapshot.path,old);assert.equal(snapshot.enabled,false);
  assert.equal(f.api.apply(true),true);f.api.restore(snapshot);
  assert.deepEqual(f.api.snapshot(),snapshot);
  assert.ok(f.calls.some(([action,query])=>action==='get'&&query.path===old));
});

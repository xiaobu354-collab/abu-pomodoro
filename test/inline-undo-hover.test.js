const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

test('active inline undo survives every mouse approach and restores controls only when cleared or expired',{timeout:90000},()=>{
  const result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/verify-inline-undo.cjs')],{
    encoding:'utf8',windowsHide:true,timeout:85000,env:process.env
  });
  assert.ifError(result.error);
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout,/"allPassed":true,"assets":20/);
});

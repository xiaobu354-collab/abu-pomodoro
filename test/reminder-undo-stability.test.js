const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

test('reminder content stays fixed when undo is shown, hidden or expired across themes and sizes',{timeout:90000},()=>{
  const result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/verify-reminder-undo-stability.cjs')],{encoding:'utf8',windowsHide:true,timeout:85000,env:process.env});
  assert.ifError(result.error);
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout,/"allPassed":true,"cases":480,"transitions":1440,"maxGeometryDelta":0/);
});

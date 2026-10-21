const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
// Twenty skins each exercise hover, pointer clicks, Tab focus, pause and capture.
// Keep the child timeout below the test timeout so failures retain diagnostics.
test('paired work and rest remain visibly painted through hover, not merely clickable',{timeout:180000},()=>{
  const result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/verify-companion-skin.cjs')],{
    encoding:'utf8',windowsHide:true,timeout:175000,env:{...process.env,
      MINT_VERIFY_APP_ROOT:path.resolve(__dirname,'..'),
      MINT_VERIFY_OUTPUT:fs.mkdtempSync(path.join(os.tmpdir(),'abu-visible-'))}
  });
  assert.ifError(result.error);
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout,/"allPassed":true/);
});

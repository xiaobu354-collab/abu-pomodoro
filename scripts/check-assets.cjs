const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const baseline = require('../test/fixtures/public-assets.json');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const tags = svg => [...svg.matchAll(/<[^>]*data-geometry="([^"]+)"[^>]*>/g)];
const commonNames = ['background','equalizer','timeInk','button-pause','icon-pause',
  'button-reset','icon-reset','button-skip','icon-skip','button-settings','icon-settings','progress','progressFill'];

function validateSvg(svg, expectedPngs, rootId) {
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'SVG IDs must be unique');
  if (rootId) assert.ok(ids.includes(rootId), `missing ${rootId}`);
  for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(ref), `unresolved reference ${ref}`);
  for (const [, ref] of svg.matchAll(/(?:xlink:)?href="#([^"]+)"/g)) assert.ok(ids.includes(ref), `unresolved href ${ref}`);
  for (const [, ref] of svg.matchAll(/(?:xlink:)?href="([^"]+)"/g)) {
    assert.match(ref, /^(?:#|data:image\/png;base64,)/, 'images must be embedded PNGs or local references');
  }
  assert.doesNotMatch(svg, /<(?:script|foreignObject)\b|\bon\w+\s*=|file:|artifacts[\\/]/i);
  assert.doesNotMatch(svg.replaceAll('http://www.w3.org/2000/svg','').replaceAll('http://www.w3.org/1999/xlink',''), /https?:\/\//i);
  const pngs = [...svg.matchAll(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g)].map(([,data]) => {
    const bytes = Buffer.from(data, 'base64');
    assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a', 'embedded bytes must be PNG');
    assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0);
    return hash(bytes);
  });
  assert.deepEqual(pngs, expectedPngs, 'embedded PNG bytes/order changed');
  return ids;
}

function checkAssets(root = path.resolve(__dirname, '..')) {
  const read = file => fs.readFileSync(path.join(root, file));
  const json = file => JSON.parse(read(file).toString('utf8'));
  for (const [file, digest] of Object.entries(baseline.assets)) assert.equal(hash(read(file)), digest, `${file} changed`);
  const manifest = json('assets/companion-skins/manifest.json');
  const approval = json('assets/companion-skins/approval.json');
  assert.equal(approval.releaseVersion, '1.0.33');
  assert.equal(manifest.layoutVersion, 3);
  assert.deepEqual(manifest.viewport, {width:270,height:106});
  assert.deepEqual(manifest.background, {x:10,y:41,width:250,height:40});
  assert.equal(manifest.skins.length, 20);
  assert.equal(new Set(manifest.skins.map(s => s.id)).size, 20);
  assert.deepEqual(Object.keys(approval.skins).sort(), manifest.skins.map(s => s.id).sort());
  const onDisk = fs.readdirSync(path.join(root,'assets/companion-skins')).filter(f => f.endsWith('.svg')).sort();
  assert.deepEqual(onDisk, manifest.skins.map(s => s.file).sort());
  let sharedGeometry;
  for (const skin of manifest.skins) {
    assert.equal(skin.file, `${skin.id}.svg`);
    assert.equal(skin.status, 'approved');
    const file = `assets/companion-skins/${skin.file}`, svg = read(file).toString('utf8');
    const digest = hash(Buffer.from(svg));
    assert.equal(digest, skin.sha256);
    assert.equal(digest, approval.skins[skin.id]);
    assert.equal(digest, baseline.assets[file]);
    const ids = validateSvg(svg, baseline.embeddedPngs[file], 'companionSkinSvg');
    assert.ok(ids.every(id => id === 'companionSkinSvg' || id.startsWith(`${skin.id}-`)));
    assert.match(svg, new RegExp(`data-skin="${skin.id}"`));
    assert.match(svg, /width="270" height="106" viewBox="-46 -188\.6 1242 487\.6"/);
    const geometry = tags(svg).filter(m => commonNames.includes(m[1]));
    assert.deepEqual(geometry.map(m => m[1]), commonNames);
    const normalized = geometry.map(m => m[0].replace(/url\(#[^)]+\)/g,'url(#REF)'));
    sharedGeometry ||= normalized;
    assert.deepEqual(normalized, sharedGeometry, `${skin.id}: controls/text/progress must share geometry`);
    assert.equal(tags(svg).filter(m => m[1] === 'phaseInk').length, 1);
  }
  assert.deepEqual(manifest.hitLayout.buttonBodies.map(b => b.id), ['pause','reset','skip','settings']);
  for (const button of manifest.hitLayout.buttonBodies) {
    assert.equal(button.width, 26); assert.equal(button.height,18);
    assert.ok(button.x >= 10 && button.x + button.width <= 260);
    assert.ok(button.y >= 41 && button.y + button.height <= 81);
  }
  const focus = json('assets/focus-skins/manifest.json');
  assert.deepEqual(focus.skins.map(s => s.id), ['01','02','03']);
  for (const skin of focus.skins) {
    const file = `assets/focus-skins/${skin.file}`, svg = read(file).toString('utf8');
    assert.equal(hash(Buffer.from(svg)), skin.sha256);
    assert.equal(skin.layoutVersion, 2);
    assert.equal(skin.viewBox, '-55 -225 1486 528');
    validateSvg(svg, baseline.embeddedPngs[file], 'focusSkinSvg');
    for (const name of ['background','progress','progressFill','timeInk','phaseInk','button-pause','button-reset','button-skip','button-settings']) {
      assert.equal(tags(svg).filter(m => m[1] === name).length, 1, `${file}: ${name}`);
    }
    for (const [name,type] of Object.entries(skin.typography)) {
      assert.ok(svg.includes(`x="${type.x}" y="${type.baseline}" class="skin-${name}" font-size="${type.size}" letter-spacing="${type.letterSpacing}"`));
    }
  }
  for (const file of ['assets/companion-skins/manifest.json','assets/companion-skins/approval.json','assets/focus-skins/manifest.json']) {
    assert.doesNotMatch(read(file).toString(), /"(?:source|validation|reviewDirectory|conversation)"\s*:/);
  }
  const ico = read('assets/icon.ico');
  assert.equal(ico.readUInt16LE(2),1); assert.equal(ico.readUInt16LE(4),9);
  [16,20,24,32,40,48,64,128,256].forEach((size,index) => {
    const at = 6+index*16, length=ico.readUInt32LE(at+8), offset=ico.readUInt32LE(at+12);
    assert.equal(ico[at] || 256,size); assert.equal(ico[at+1] || 256,size);
    assert.equal(ico.readUInt16LE(at+6),32); assert.ok(offset+length<=ico.length);
    assert.equal(ico.readUInt32BE(offset+16),size); assert.equal(ico.readUInt32BE(offset+20),size);
  });
  return {allPassed:true,releaseVersion:baseline.releaseVersion,assetFiles:Object.keys(baseline.assets).length,companionSkins:20,focusSkins:3};
}

module.exports = {checkAssets,validateSvg};
if (require.main === module) {
  try { console.log(JSON.stringify(checkAssets())); }
  catch (error) { console.error(error.stack); process.exitCode = 1; }
}

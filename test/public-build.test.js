const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const builder = require('../scripts/build-portable.cjs');
const root = path.resolve(__dirname, '..');
const fixture = () => fs.mkdtempSync(path.join(os.tmpdir(), 'abu-public-build-'));

test('archive verification lists and extracts nested files using native asar paths', async () => {
  const asar = require('@electron/asar');
  const { listArchiveFiles, extractArchiveFile } = require('../scripts/archive-files.cjs');
  const directory = fixture(), source = path.join(directory, 'source');
  fs.mkdirSync(path.join(source, 'assets', 'branding'), { recursive: true });
  fs.writeFileSync(path.join(source, 'assets', 'branding', 'nested.txt'), 'nested bytes');
  fs.writeFileSync(path.join(source, 'package.json'), '{"version":"1.0.33"}');
  const archive = path.join(directory, 'fixture.asar');
  await asar.createPackage(source, archive);
  assert.deepEqual(listArchiveFiles(archive), ['assets/branding/nested.txt', 'package.json']);
  assert.equal(extractArchiveFile(archive, 'assets/branding/nested.txt').toString(), 'nested bytes');
  assert.equal(extractArchiveFile(archive, 'package.json').toString(), '{"version":"1.0.33"}');
});

test('open-source security build pins Electron 43.8.1 without changing app version', () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  assert.equal(metadata.version, '1.0.33');
  assert.equal(metadata.devDependencies.electron, '43.8.1');
  assert.equal(typeof builder.assertElectronVersion, 'function');
  assert.doesNotThrow(() => builder.assertElectronVersion('43.8.1'));
  for (const version of ['43.2.0', '43.8.0', '43.8.2', '^43.8.1', undefined]) {
    assert.throws(() => builder.assertElectronVersion(version), /Electron 43\.8\.1 is required/);
  }
});

test('application license copy plan never overwrites Electron runtime license files', () => {
  assert.equal(typeof builder.getLegalCopyPlan, 'function');
  const plan = builder.getLegalCopyPlan();
  assert.deepEqual(plan, [
    {source:'LICENSE', destination:'LICENSE.app.txt'},
    {source:'ASSET-LICENSE.md', destination:'ASSET-LICENSE.md'},
    {source:'THIRD_PARTY_NOTICES.md', destination:'THIRD_PARTY_NOTICES.md'},
  ]);
  for (const {destination} of plan) {
    assert.notEqual(destination.toLowerCase(), 'license');
    assert.notEqual(destination.toLowerCase(), 'licenses.chromium.html');
  }
});

test('public build selects version 1.0.33 and refuses an existing destination without changes', () => {
  const dir = fixture(), options = builder.getBuildOptions(dir);
  assert.equal(options.version, '1.0.33');
  assert.equal(options.output, path.join(dir, 'dist', 'AbuPomodoro-1.0.33-win32-x64'));
  assert.doesNotThrow(() => builder.assertOutputCanStart(options));
  fs.mkdirSync(options.output, {recursive:true});
  const sentinel = path.join(options.output, 'retained.txt');
  fs.writeFileSync(sentinel, 'original bytes');
  assert.throws(() => builder.assertOutputCanStart(options), /Refusing to overwrite/);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'original bytes');
});

function peFixture() {
  const dir = fixture();
  const from = path.join(dir, 'from'), to = path.join(dir, 'to');
  fs.mkdirSync(from); fs.mkdirSync(to);
  const source = path.join(from, 'App.exe'), destination = path.join(to, 'App.exe');
  fs.writeFileSync(source, 'edited executable'); fs.writeFileSync(destination, 'old executable');
  fs.writeFileSync(path.join(from, 'excluded.ico'), 'not a release file');
  return {from, to, source, destination};
}

test('PE copy invokes robocopy for one executable and verifies the resulting hash', () => {
  const {from, to, source, destination} = peFixture();
  let calls = 0;
  const digest = builder.copyEditedExecutable(source, destination, (command, args) => {
    calls++;
    assert.match(command, /robocopy(?:\.exe)?$/i);
    assert.deepEqual(args.slice(0, 3), [from, to, 'App.exe']);
    assert.ok(!args.some(arg => /^\/(?:MIR|PURGE|MOVE|MOV)$/i.test(arg)));
    fs.copyFileSync(source, destination);
    return {status:1};
  });
  assert.equal(calls, 1);
  assert.equal(digest, crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'));
  assert.deepEqual(fs.readdirSync(to), ['App.exe']);
});

test('PE copy rejects error, invalid status, and success with wrong destination bytes', () => {
  const {source, destination} = peFixture();
  for (const status of [8,16,null,-1,undefined,1.5]) {
    assert.throws(() => builder.copyEditedExecutable(source, destination, () => ({status})), /robocopy failed/i);
  }
  const error = new Error('spawn failed');
  assert.throws(() => builder.copyEditedExecutable(source, destination, () => ({error,status:null})), error);
  for (const status of [0,1,7]) {
    assert.throws(() => builder.copyEditedExecutable(source, destination, () => ({status})), /hash mismatch/i);
  }
});

test('public build validates production inputs and limits package paths to the public allowlist', () => {
  assert.doesNotThrow(() => builder.validateInputs(root));
  const files = builder.getPackageFiles(root);
  assert.ok(files.length > 40);
  for (const file of files) {
    assert.equal(path.isAbsolute(file), false);
    assert.doesNotMatch(file, /(?:^|[\\/])\.\.(?:[\\/]|$)/);
    assert.match(file.replaceAll('\\','/'), /^(?:src\/|assets\/|package\.json$|LICENSE$|ASSET-LICENSE\.md$|THIRD_PARTY_NOTICES\.md$)/);
  }
  for (const file of ['src/main.js', 'assets/icon.ico', 'package.json', 'LICENSE', 'ASSET-LICENSE.md', 'THIRD_PARTY_NOTICES.md']) assert.ok(files.includes(file));
});

function packageFixture() {
  const dir=fixture();
  fs.mkdirSync(path.join(dir,'src')); fs.mkdirSync(path.join(dir,'assets'));
  for (const file of ['package.json','LICENSE','ASSET-LICENSE.md','THIRD_PARTY_NOTICES.md']) fs.writeFileSync(path.join(dir,file),'fixture');
  fs.writeFileSync(path.join(dir,'src','main.js'),'fixture');
  return dir;
}

test('package file listing does not include unrelated root files or directories', () => {
  const dir=packageFixture();
  fs.mkdirSync(path.join(dir,'private-data'));
  fs.writeFileSync(path.join(dir,'private-data','local.txt'),'excluded');
  fs.writeFileSync(path.join(dir,'unrelated.txt'),'excluded');
  assert.deepEqual(builder.getPackageFiles(dir).sort(),
    ['src/main.js','package.json','LICENSE','ASSET-LICENSE.md','THIRD_PARTY_NOTICES.md'].sort());
});

test('package file listing rejects nested profile directories rather than silently packaging them', () => {
  const dir=packageFixture();
  fs.mkdirSync(path.join(dir,'src','test-profile'));
  fs.writeFileSync(path.join(dir,'src','test-profile','local.txt'),'retained fixture');
  assert.throws(() => builder.getPackageFiles(dir), /Private entry not permitted/);
});

test('package file listing rejects directory links without following them', () => {
  const dir=packageFixture(), target=fixture();
  fs.writeFileSync(path.join(target,'local.txt'),'retained fixture');
  fs.symlinkSync(target,path.join(dir,'assets','linked'),process.platform==='win32'?'junction':'dir');
  assert.throws(() => builder.getPackageFiles(dir), /Symlink not permitted/);
});

// Windows-only, allow-listed portable build; never edits an existing output.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const executableName = 'MintPomodoro-CloudTrial.exe';
const legalFiles = ['LICENSE', 'ASSET-LICENSE.md', 'THIRD_PARTY_NOTICES.md'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const electronVersion = '43.8.1';
function assertElectronVersion(version) {
  if (version !== electronVersion) throw new Error('Electron ' + electronVersion + ' is required');
}
function getLegalCopyPlan() {
  return legalFiles.map(source => ({ source, destination: source === 'LICENSE' ? 'LICENSE.app.txt' : source }));
}

function getBuildOptions(directory) {
  return { version: '1.0.33', output: path.join(directory, 'dist', 'AbuPomodoro-1.0.33-win32-x64') };
}
function assertOutputCanStart({ output }) {
  if (fs.existsSync(output)) throw new Error('Refusing to overwrite an existing output: ' + output);
}
function getPackageFiles(directory) {
  const files = [];
  function visit(relative) {
    if (relative.split(/[\\/]/).some(part => /^(?:node_modules|test|\.git|\.env(?:\..*)?|.*profile.*|.*backup.*)$/i.test(part))) throw new Error('Private entry not permitted: ' + relative);
    const absolute = path.join(directory, relative), stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error('Symlink not permitted: ' + relative);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(path.join(relative, name));
    } else if (stat.isFile()) files.push(relative.replaceAll('\\', '/'));
    else throw new Error('Unsupported package entry: ' + relative);
  }
  for (const name of ['src', 'assets', 'package.json', ...legalFiles]) visit(name);
  return files;
}
function validateInputs(directory) {
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
  if (metadata.version !== '1.0.33' || metadata.pairedThemeTrialBuild !== true) throw new Error('Wrong release metadata');
  const { COMPANION_THEMES } = require(path.join(directory, 'src/companion-themes'));
  if (COMPANION_THEMES.length !== 10) throw new Error('Expected ten paired themes');
  const skinDir = path.join(directory, 'assets/companion-skins');
  const manifest = JSON.parse(fs.readFileSync(path.join(skinDir, 'manifest.json')));
  const approval = JSON.parse(fs.readFileSync(path.join(skinDir, 'approval.json')));
  const ids = COMPANION_THEMES.flatMap(t => [t.workAssetId, t.restAssetId]);
  if (new Set(ids).size !== 20 || manifest.skins.length !== 20) throw new Error('Expected twenty mini skins');
  for (const id of ids) {
    const skin = manifest.skins.find(s => s.id === id);
    const hash = sha(fs.readFileSync(path.join(skinDir, id + '.svg')));
    if (!skin || skin.sha256 !== hash || approval.skins[id] !== hash) throw new Error('Skin hash mismatch: ' + id);
  }
  if (manifest.viewport.width !== 270 || manifest.viewport.height !== 106 || manifest.background.width !== 250 || manifest.background.height !== 40) throw new Error('Mini geometry mismatch');
  const icon = fs.readFileSync(path.join(directory, 'assets/icon.ico'));
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  if (icon.length < 150 || icon.readUInt16LE(2) !== 1 || icon.readUInt16LE(4) !== sizes.length) throw new Error('Incomplete felt icon');
  sizes.forEach((size, i) => {
    const entry = 6 + i * 16, offset = icon.readUInt32LE(entry + 12), length = icon.readUInt32LE(entry + 8);
    if ((icon[entry] || 256) !== size || offset + length > icon.length || length < 24 || icon.readUInt32BE(offset + 16) !== size) throw new Error('Invalid felt icon representation');
  });
  return manifest;
}
function copyEditedExecutable(source, destination, run = spawnSync) {
  if (path.basename(source) !== path.basename(destination)) throw new Error('PE copy requires the same executable filename');
  const expected = sha(fs.readFileSync(source));
  const result = run('robocopy', [path.dirname(source), path.dirname(destination), path.basename(source), '/COPY:DAT', '/IS', '/IT', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (!Number.isInteger(result.status) || result.status < 0 || result.status > 7) throw new Error('PE robocopy failed: ' + result.status);
  if (!fs.existsSync(destination) || sha(fs.readFileSync(destination)) !== expected) throw new Error('PE copy hash mismatch');
  return expected;
}
async function build() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Portable build currently supports Windows x64 only');
  const options = getBuildOptions(root);
  assertOutputCanStart(options);
  validateInputs(root);
  const files = getPackageFiles(root);
  const asar = require('@electron/asar');
  const electronPackage = require.resolve('electron/package.json');
  assertElectronVersion(JSON.parse(fs.readFileSync(electronPackage)).version);
  const runtime = path.join(path.dirname(electronPackage), 'dist');
  if (!fs.existsSync(path.join(runtime, 'electron.exe'))) throw new Error('Electron runtime missing; run npm ci with install scripts enabled');
  const editor = path.join(path.dirname(require.resolve('electron-winstaller/package.json')), 'vendor/rcedit.exe');
  if (!fs.existsSync(editor)) throw new Error('Windows PE editor missing');
  // Reserve the final directory atomically so concurrent runs cannot overwrite it.
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.mkdirSync(options.output);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'abu-pomodoro-build-'));
  const source = path.join(temporary, 'app');
  for (const relative of files) {
    const destination = path.join(source, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
  }
  const copy = spawnSync('robocopy', [runtime, options.output, '/E', '/COPY:DAT', '/DCOPY:DAT', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { stdio: 'inherit', windowsHide: true });
  if (copy.error || !Number.isInteger(copy.status) || copy.status < 0 || copy.status > 7) throw copy.error || new Error('Electron runtime copy failed');
  const executable = path.join(options.output, executableName);
  fs.renameSync(path.join(options.output, 'electron.exe'), executable);
  const pe = path.join(temporary, executableName), icon = path.join(temporary, 'icon.ico');
  fs.copyFileSync(executable, pe);
  fs.copyFileSync(path.join(root, 'assets/icon.ico'), icon);
  const edit = spawnSync(editor, [pe, '--set-icon', icon, '--set-file-version', options.version, '--set-product-version', options.version, '--set-version-string', 'ProductName', '阿不番茄钟', '--set-version-string', 'FileDescription', '阿不番茄钟 · 正式版'], { stdio: 'inherit', windowsHide: true });
  if (edit.error || edit.status !== 0) throw edit.error || new Error('PE edit failed: ' + edit.status);
  copyEditedExecutable(pe, executable);
  const archive = path.join(options.output, 'resources/app.asar');
  await asar.createPackage(source, archive);
  for (const { source: name, destination } of getLegalCopyPlan()) fs.copyFileSync(path.join(root, name), path.join(options.output, destination), fs.constants.COPYFILE_EXCL);
  for (const name of ['LICENSE', 'LICENSES.chromium.html']) {
    if (sha(fs.readFileSync(path.join(runtime, name))) !== sha(fs.readFileSync(path.join(options.output, name)))) throw new Error('Runtime license changed: ' + name);
  }
  const report = { version: options.version, electronVersion, productName: '阿不番茄钟', executable: executableName, asarSha256: sha(fs.readFileSync(archive)), exeSha256: sha(fs.readFileSync(executable)), files: files.map(file => ({ file, sha256: sha(fs.readFileSync(path.join(source, file))) })), skins: validateInputs(root).skins.map(({ id, sha256 }) => ({ id, sha256 })) };
  fs.writeFileSync(path.join(options.output, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(options.output);
}
module.exports = { getBuildOptions, assertOutputCanStart, getPackageFiles, validateInputs, copyEditedExecutable, executableName, legalFiles, getLegalCopyPlan, assertElectronVersion, electronVersion };
if (require.main === module) build().catch(error => { console.error(error.stack); process.exitCode = 1; });

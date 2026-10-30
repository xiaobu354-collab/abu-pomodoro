// Only reports relative filenames and check categories, never matched secrets.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const allowedRoots = new Set(['src', 'assets', 'scripts', 'test', 'docs']);
const allowedFiles = new Set(['package.json', 'package-lock.json', '.gitignore', '.gitattributes', 'README.md', 'LICENSE', 'ASSET-LICENSE.md', 'THIRD_PARTY_NOTICES.md']);
const localOnly = new Set(['node_modules', 'dist', 'artifacts', '.git']);
const forbidden = /^(?:\.env(?:\..*)?|.*profile.*|.*backup.*|release|\.aws|\.codex|\.agents)$/i;
const textExtension = /\.(?:js|cjs|mjs|json|md|txt|css|html|svg|ya?ml)$/i;
const sensitive = [/(?:[A-Z]:[\\/](?:Users|codex|DevCache)[\\/]|E:[\\/]codex-abu[\\/])/i, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{20,})\b/];
const findings = [];
let checked = 0;
for (const name of ['package.json', 'package-lock.json', 'README.md', 'LICENSE', 'ASSET-LICENSE.md', 'THIRD_PARTY_NOTICES.md']) {
  if (!fs.existsSync(path.join(root, name))) findings.push({ file: name, check: 'required-file-missing' });
}
function visit(relative) {
  const absolute = path.join(root, relative), stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) { findings.push({ file: relative, check: 'symlink' }); return; }
  if (forbidden.test(path.basename(relative))) { findings.push({ file: relative, check: 'private-entry' }); return; }
  if (stat.isDirectory()) { for (const name of fs.readdirSync(absolute)) visit(path.posix.join(relative, name)); return; }
  checked++;
  if (!textExtension.test(relative) || relative === 'scripts/check-public-package.cjs') return;
  const text = fs.readFileSync(absolute, 'utf8');
  if (sensitive.some(pattern => pattern.test(text))) findings.push({ file: relative, check: 'sensitive-text' });
}
for (const name of fs.readdirSync(root)) {
  if (localOnly.has(name)) continue; // excluded from Git by .gitignore; never part of a source export
  if (!allowedRoots.has(name) && !allowedFiles.has(name)) { findings.push({ file: name, check: 'unexpected-root' }); continue; }
  visit(name);
}
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
if (metadata.version !== '1.0.38' || metadata.pairedThemeTrialBuild !== true || metadata.scripts.start !== 'electron . --paired-theme-trial') findings.push({ file: 'package.json', check: 'release-metadata' });
console.log(JSON.stringify({ allPassed: findings.length === 0, checkedFiles: checked, findings }, null, 2));
process.exitCode = findings.length ? 1 : 0;

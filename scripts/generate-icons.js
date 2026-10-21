// Derive all application icons from the approved source, never procedural artwork.
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(require('electron'), [path.join(__dirname, 'render-felt-icons.cjs')], {
  windowsHide: true,
  encoding: 'utf8',
  env
});
if (result.error) throw result.error;
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;


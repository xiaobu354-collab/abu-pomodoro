const path = require('node:path');
const { spawn } = require('node:child_process');

function handleSquirrelEvent({
  app,
  argv = process.argv,
  execPath = process.execPath,
  platform = process.platform,
  spawnProcess = spawn
}) {
  if (platform !== 'win32') return false;

  const event = argv[1];
  const target = path.basename(execPath);
  const updateExe = path.resolve(path.dirname(execPath), '..', 'Update.exe');

  function runUpdate(args) {
    try {
      const child = spawnProcess(updateExe, args, { detached: true });
      child.once('close', () => app.quit());
      child.once('error', () => app.quit());
    } catch {
      app.quit();
    }
  }

  if (event === '--squirrel-install' || event === '--squirrel-updated') {
    runUpdate([`--createShortcut=${target}`]);
    return true;
  }
  if (event === '--squirrel-uninstall') {
    runUpdate([`--removeShortcut=${target}`]);
    return true;
  }
  if (event === '--squirrel-obsolete') {
    app.quit();
    return true;
  }
  return false;
}

module.exports = { handleSquirrelEvent };

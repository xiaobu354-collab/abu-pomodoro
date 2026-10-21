const asar = require('@electron/asar');
const path = require('node:path');

function listArchiveFiles(archive) {
  return asar.listPackage(archive)
    .map(file => file.replace(/^[\\/]+/, ''))
    .filter(file => !asar.statFile(archive, file).files)
    .map(file => file.replaceAll('\\', '/').replace(/^\//, ''))
    .sort();
}
function extractArchiveFile(archive, relative) {
  return asar.extractFile(archive, path.normalize(relative));
}
module.exports = { listArchiveFiles, extractArchiveFile };

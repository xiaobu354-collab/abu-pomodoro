// Headless Electron helper: nativeImage is already supplied by this app's runtime.
const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const assets = path.join(__dirname, '..', 'assets');

try {
  const source = nativeImage.createFromPath(path.join(assets, 'branding', 'tomato-felt-v2.png'));
  if (source.isEmpty()) throw new Error('Approved felt icon source is missing or invalid');
  const images = sizes.map((size) => source.resize({ width: size, height: size, quality: 'best' }));
  const pngs = images.map((image) => image.toPNG());
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(pngs[index].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += pngs[index].length;
  });
  const image = images[images.length - 1];
  const bitmap = image.toBitmap();
  let alphaMin = 255;
  let alphaMax = 0;
  let partialAlphaPixels = 0;
  for (let index = 3; index < bitmap.length; index += 4) {
    const alpha = bitmap[index];
    alphaMin = Math.min(alphaMin, alpha);
    alphaMax = Math.max(alphaMax, alpha);
    if (alpha > 0 && alpha < 255) partialAlphaPixels += 1;
  }
  const cornerAlpha = [0, 255, 255 * 256, 256 * 256 - 1].map((index) => bitmap[index * 4 + 3]);
  if (alphaMin !== 0 || alphaMax < 250 || cornerAlpha.some(Boolean)) {
    throw new Error('Felt icon transparency validation failed');
  }
  fs.writeFileSync(path.join(assets, 'icon.png'), pngs[pngs.length - 1]);
  fs.writeFileSync(path.join(assets, 'icon.ico'), Buffer.concat([header, ...pngs]));
  process.stdout.write(JSON.stringify({ sizes, ...image.getSize(), alphaMin, alphaMax, partialAlphaPixels, cornerAlpha }) + '\n');
  app.exit(0);
} catch (error) {
  process.stderr.write(error.stack + '\n');
  app.exit(1);
}


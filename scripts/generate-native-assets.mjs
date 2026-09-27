import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Temporary native artwork: a pixel moon over water using Moonwater's existing night palette.
// Keeping this renderer in the repo makes the generated platform sizes reproducible.
const out = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };
const pixel = (x, y) => {
  const d = (x - 32) ** 2 + (y - 23) ** 2;
  if (d <= 15 ** 2 && !((x - 39) ** 2 + (y - 19) ** 2 <= 14 ** 2)) return [246, 218, 157, 255];
  if (y === 44 && x >= 11 && x <= 52 && x % 8 < 6) return [103, 193, 207, 255];
  if (y === 49 && x >= 17 && x <= 57 && (x + 3) % 10 < 7) return [61, 133, 160, 255];
  if (y === 54 && x >= 8 && x <= 48 && x % 9 < 6) return [52, 99, 134, 255];
  if ((x + y * 3) % 127 === 0 && y < 40) return [125, 184, 196, 255];
  return [16, 26, 40, 255];
};

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(size, splash = false) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1); rows[row] = 0;
    for (let x = 0; x < size; x++) {
      const sx = splash ? Math.floor((x / size * 64 - 13) * 64 / 38) : Math.floor(x * 64 / size);
      const sy = splash ? Math.floor((y / size * 64 - 13) * 64 / 38) : Math.floor(y * 64 / size);
      const c = splash && (sx < 0 || sx > 63 || sy < 0 || sy > 63) ? [16, 26, 40, 255] : pixel(sx, sy);
      rows.set(c, row + 1 + x * 4);
    }
  }
  const chunk = (type, data) => {
    const name = Buffer.from(type); const payload = Buffer.concat([name, data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(payload)); return Buffer.concat([len, payload, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

out('resources/moonwater-app-icon.png', png(1024));
out('resources/moonwater-splash-placeholder.png', png(1024, true));
for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  const dir = `android/app/src/main/res/mipmap-${density}`;
  out(`${dir}/ic_launcher.png`, png(size));
  out(`${dir}/ic_launcher_round.png`, png(size));
  out(`${dir}/ic_launcher_foreground.png`, png(Math.round(size * 2.25)));
}
for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  for (const prefix of ['', 'drawable-port-', 'drawable-land-']) {
    const dir = prefix ? `android/app/src/main/res/${prefix}${density}` : 'android/app/src/main/res/drawable';
    out(`${dir}/splash.png`, png(size, true));
  }
}
const iosIcon = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png';
out(iosIcon, png(1024));
for (const file of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  out(`ios/App/App/Assets.xcassets/Splash.imageset/${file}`, png(1024, true));
}

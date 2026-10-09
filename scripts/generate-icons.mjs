// Generates icons/icon{16,48,128}.png — dark rounded square with an orange
// upward "repost" arrow. No dependencies; run via `npm run icons`.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [18, 20, 28, 255];
const FG = [255, 69, 0, 255];
const RADIUS_RATIO = 0.18;

function makePixel(size) {
  const radius = Math.max(1, Math.round(size * RADIUS_RATIO));
  const cx = (size - 1) / 2;
  const headBottom = size * 0.52;
  const stemHalf = Math.max(1, size * 0.11);
  const wing = size * 0.3;
  return (x, y) => {
    const dx = Math.min(x, size - 1 - x);
    const dy = Math.min(y, size - 1 - y);
    if (dx + dy < radius) return [0, 0, 0, 0];
    let inside = false;
    if (y >= size * 0.16 && y <= headBottom) {
      const t = (y - size * 0.16) / (headBottom - size * 0.16);
      inside = Math.abs(x - cx) <= wing * t;
    }
    if (y > size * 0.46 && y <= size * 0.86 && Math.abs(x - cx) <= stemHalf) inside = true;
    return inside ? FG : BG;
  };
}

mkdirSync(join(ROOT, 'icons'), { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(join(ROOT, 'icons', `icon${size}.png`), png(size, makePixel(size)));
  console.log(`icons/icon${size}.png`);
}

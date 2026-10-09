// Generates assets/social-preview.png (1280x640) — a GitHub social preview
// banner: dark rounded background, orange repost arrow, and a bitmap wordmark.
// No dependencies; run via `npm run social`.
//
// Note: GitHub does not expose an API to set the social preview, so after
// generating this file, upload it manually in Settings -> Social preview.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const W = 1280;
const H = 640;

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

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    rgba.copy(raw, o, y * width * 4, (y + 1) * width * 4);
    o += width * 4;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG_TOP = [15, 17, 23];
const BG_BOTTOM = [28, 32, 44];
const GRID = [40, 46, 62];
const FG = [255, 69, 0];
const WHITE = [244, 246, 250];
const MUTED = [150, 158, 180];

const GLYPHS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
};

const buf = Buffer.alloc(W * H * 4);

function setPx(x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function fillRect(x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(x, y, color);
}

function radioLine(x, y) {
  const t = y / (H - 1);
  const c = [
    Math.round(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t),
    Math.round(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t),
    Math.round(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t),
  ];
  return c;
}

function drawText(text, x, y, scale, color, tracking = 1) {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch] || GLYPHS[' '];
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] === '#') fillRect(cx + gx * scale, y + gy * scale, scale, scale, color);
      }
    }
    cx += (5 + tracking) * scale;
  }
  return cx;
}

function textWidth(text, scale, tracking = 1) {
  return text.length * (5 + tracking) * scale - tracking * scale;
}

function drawArrow(cx, cy, size) {
  const radius = Math.max(1, Math.round(size * 0.18));
  const centerX = cx + (size - 1) / 2;
  const centerY = cy + (size - 1) / 2;
  const headBottom = cy + size * 0.52;
  const stemHalf = Math.max(1, size * 0.11);
  const wing = size * 0.3;
  for (let y = cy; y < cy + size; y++) {
    for (let x = cx; x < cx + size; x++) {
      const dx = Math.min(x - cx, cx + size - 1 - x);
      const dy = Math.min(y - cy, cy + size - 1 - y);
      if (dx + dy < radius) continue;
      let inside = false;
      if (y >= cy + size * 0.16 && y <= headBottom) {
        const t = (y - (cy + size * 0.16)) / (headBottom - (cy + size * 0.16));
        inside = Math.abs(x - centerX) <= wing * t;
      }
      if (y > cy + size * 0.46 && y <= cy + size * 0.86 && Math.abs(x - centerX) <= stemHalf) inside = true;
      if (inside) setPx(x, y, FG);
    }
  }
  void centerY;
}

function roundedCard(x, y, w, h, radius) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const dx = Math.min(xx - x, x + w - 1 - xx);
      const dy = Math.min(yy - y, y + h - 1 - yy);
      if (dx + dy < radius) continue;
      setPx(xx, yy, radioLine(xx, yy));
    }
  }
}

for (let y = 0; y < H; y++) {
  const line = radioLine(0, y);
  fillRect(0, y, W, 1, line);
}

for (let x = 0; x < W; x += 40) fillRect(x, 0, 1, H, GRID.map((c) => c));
for (let y = 0; y < H; y += 40) fillRect(0, y, W, 1, GRID);

roundedCard(80, 70, W - 160, H - 140, 28);

drawArrow(150, H / 2 - 90, 180);

const title1 = 'SAVED REPOST';
const title2 = 'RECOMMENDER';
const tx = 420;
drawText(title1, tx, 210, 9, WHITE, 1.4);
drawText(title2, tx, 300, 9, FG, 1.4);

fillRect(tx, 410, textWidth('RANK  YOUR  SAVED  POSTS', 4, 1.4), 4, GRID.map((c) => c + 30));
drawText('RANK  YOUR  SAVED  POSTS', tx, 440, 4, MUTED, 1.4);

mkdirSync(join(ROOT, 'assets'), { recursive: true });
const out = join(ROOT, 'assets', 'social-preview.png');
writeFileSync(out, encodePng(W, H, buf));
console.log('assets/social-preview.png');

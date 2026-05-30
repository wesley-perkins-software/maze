/**
 * Generates public/og-default.png — a branded 1200×630 PNG for social sharing.
 * Uses pure Node.js (zlib only, no external dependencies).
 * Run: node scripts/generate-og.mjs
 */
import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 1200;
const H = 630;

// ── CRC32 ────────────────────────────────────────────────────────────────────
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[i] = c;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  const db = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const lb = Buffer.allocUnsafe(4); lb.writeUInt32BE(db.length);
  const cb = Buffer.allocUnsafe(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, db])));
  return Buffer.concat([lb, tb, db, cb]);
}

// ── Pixel buffer ─────────────────────────────────────────────────────────────
const px = new Uint8Array(W * H * 3);

function set(x, y, r, g, b) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = r; px[i + 1] = g; px[i + 2] = b;
}

function rect(x0, y0, w, h, r, g, b) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      set(x0 + dx, y0 + dy, r, g, b);
}

// ── Background: dark-to-medium navy gradient ─────────────────────────────────
for (let y = 0; y < H; y++) {
  const t = y / (H - 1);
  const r = Math.round(10 + t * 5);
  const g = Math.round(18 + t * 8);
  const b = Math.round(38 + t * 15);
  for (let x = 0; x < W; x++) set(x, y, r, g, b);
}

// ── Maze generation (seeded DFS) ─────────────────────────────────────────────
const COLS = 22, ROWS = 11;
let seed = 0xcafe1234;
function rand() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 0xffffffff;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const MN = 1, ME = 2, MS = 4, MW = 8;
const grid = new Array(COLS * ROWS).fill(MN | ME | MS | MW);
const vis = new Uint8Array(COLS * ROWS);
const DIRS = [[0, -1, MN, MS], [1, 0, ME, MW], [0, 1, MS, MN], [-1, 0, MW, ME]];
const stk = [[0, 0]]; vis[0] = 1;
while (stk.length) {
  const [cx, cy] = stk[stk.length - 1];
  const dirs = shuffle([0, 1, 2, 3]);
  let moved = false;
  for (const di of dirs) {
    const [dx, dy, wall, opp] = DIRS[di];
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
    const ni = ny * COLS + nx;
    if (vis[ni]) continue;
    grid[cy * COLS + cx] &= ~wall;
    grid[ni] &= ~opp;
    vis[ni] = 1;
    stk.push([nx, ny]);
    moved = true; break;
  }
  if (!moved) stk.pop();
}

// ── Render maze ───────────────────────────────────────────────────────────────
const CELL = 44;
const WALL_T = 4;
const MZ_W = COLS * CELL + WALL_T;
const MZ_H = ROWS * CELL + WALL_T;
const OX = Math.floor((W - MZ_W) / 2);
const OY = Math.floor((H - MZ_H) / 2);

// Blue accent: #2563eb → rgb(37, 99, 235)
const [WR, WG, WB] = [55, 115, 245]; // slightly lighter for dark bg

// Outer border
rect(OX, OY, MZ_W, WALL_T, WR, WG, WB);                      // top
rect(OX, OY + MZ_H - WALL_T, MZ_W, WALL_T, WR, WG, WB);      // bottom
rect(OX, OY, WALL_T, MZ_H, WR, WG, WB);                      // left
rect(OX + MZ_W - WALL_T, OY, WALL_T, MZ_H, WR, WG, WB);      // right

// Entry gap (top wall of cell 0,0) and exit gap (bottom wall of last cell)
rect(OX + WALL_T, OY, CELL - WALL_T, WALL_T, 10, 18, 45);
rect(OX + (COLS - 1) * CELL + WALL_T, OY + MZ_H - WALL_T, CELL - WALL_T, WALL_T, 10, 18, 45);

for (let cy = 0; cy < ROWS; cy++) {
  for (let cx = 0; cx < COLS; cx++) {
    const cell = grid[cy * COLS + cx];
    const x0 = OX + cx * CELL;
    const y0 = OY + cy * CELL;

    // South wall
    if (cell & MS)
      rect(x0, y0 + CELL, CELL + WALL_T, WALL_T, WR, WG, WB);

    // East wall
    if (cell & ME)
      rect(x0 + CELL, y0, WALL_T, CELL + WALL_T, WR, WG, WB);
  }
}

// ── Build PNG ────────────────────────────────────────────────────────────────
const scanlines = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  const off = y * (1 + W * 3);
  scanlines[off] = 0;
  for (let x = 0; x < W; x++) {
    const si = (y * W + x) * 3;
    const di = off + 1 + x * 3;
    scanlines[di] = px[si]; scanlines[di + 1] = px[si + 1]; scanlines[di + 2] = px[si + 2];
  }
}

const compressed = deflateSync(scanlines, { level: 6 });

const ihdr = Buffer.allocUnsafe(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = join(__dirname, '../public/og-default.png');
writeFileSync(out, png);
console.log(`Generated ${out} (${(png.length / 1024).toFixed(1)} KB)`);

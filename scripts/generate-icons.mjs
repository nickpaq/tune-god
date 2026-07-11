// Generates simple placeholder PWA icons (solid background + centered "T")
// with zero external dependencies, since no image toolchain is available.
// Replace public/pwa-*.png and apple-touch-icon.png with real artwork later.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const BG = [0x1a, 0x1b, 0x22]; // dark slate
const FG = [0x6c, 0xcc, 0xff]; // accent blue

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Draws a simple monogram: solid rounded-ish square with a centered "T"
// glyph made of two filled rectangles.
function makeIcon(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const setPixel = (x, y, rgb) => {
    const rowStart = y * (1 + size * 4) + 1;
    const idx = rowStart + x * 4;
    raw[idx] = rgb[0];
    raw[idx + 1] = rgb[1];
    raw[idx + 2] = rgb[2];
    raw[idx + 3] = 255;
  };

  const margin = Math.round(size * 0.12);
  const barThickness = Math.round(size * 0.14);
  const topY = Math.round(size * 0.28);
  const stemWidth = barThickness;

  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter byte: none
    for (let x = 0; x < size; x++) {
      const inBounds = x >= margin && x < size - margin && y >= margin && y < size - margin;
      let color = BG;
      if (inBounds) {
        const inTopBar = y >= topY && y < topY + barThickness && x >= margin + barThickness && x < size - margin - barThickness;
        const inStem = x >= size / 2 - stemWidth / 2 && x < size / 2 + stemWidth / 2 && y >= topY && y < size - margin;
        if (inTopBar || inStem) color = FG;
      }
      setPixel(x, y, color);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

const targets = [
  ["public/pwa-192.png", 192],
  ["public/pwa-512.png", 512],
  ["public/apple-touch-icon.png", 180],
];

for (const [path, size] of targets) {
  writeFileSync(path, makeIcon(size));
  console.log(`wrote ${path} (${size}x${size})`);
}

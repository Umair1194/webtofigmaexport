import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as zlib from "zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const iconsDir = path.join(repoRoot, "apps/chrome-extension/public/icons");

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
}

const crcTable = createCRC32Table();
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, "ascii");
  data.copy(buf, 8);
  const crc = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function generatePng(size) {
  // Generate RGBA image data with purple-to-indigo gradient and white "F" shape
  const rowLength = size * 4 + 1; // 1 filter byte per row
  const rawData = Buffer.alloc(rowLength * size);

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowLength;
    rawData[rowOffset] = 0; // Filter type None
    const t = y / size;

    for (let x = 0; x < size; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      // Gradient background: from #6366f1 (99, 102, 241) to #a855f7 (168, 85, 247)
      let r = Math.round(99 + (168 - 99) * t);
      let g = Math.round(102 + (85 - 102) * t);
      let b = Math.round(241 + (247 - 241) * t);
      let a = 255;

      // Rounded corner mask
      const cornerRadius = size * 0.22;
      const dx = Math.max(0, Math.max(cornerRadius - x, x - (size - 1 - cornerRadius)));
      const dy = Math.max(0, Math.max(cornerRadius - y, y - (size - 1 - cornerRadius)));
      if (dx * dx + dy * dy > cornerRadius * cornerRadius) {
        a = 0;
      }

      // Draw stylized "F" glyph in the center if inside
      const nx = x / size;
      const ny = y / size;
      const isVerticalStem = nx >= 0.28 && nx <= 0.44 && ny >= 0.24 && ny <= 0.76;
      const isTopBar = nx >= 0.28 && nx <= 0.72 && ny >= 0.24 && ny <= 0.38;
      const isMidBar = nx >= 0.28 && nx <= 0.62 && ny >= 0.46 && ny <= 0.58;

      if (a > 0 && (isVerticalStem || isTopBar || isMidBar)) {
        r = 255;
        g = 255;
        b = 255;
      }

      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // Bit depth
  ihdrData[9] = 6; // Color type RGBA
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdrChunk = makeChunk("IHDR", ihdrData);

  // IDAT chunk
  const idatChunk = makeChunk("IDAT", deflated);

  // IEND chunk
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

[16, 32, 48, 128].forEach((size) => {
  const png = generatePng(size);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), png);
  console.log(`Generated icon-${size}.png`);
});

console.log("Extension icons generated successfully.");

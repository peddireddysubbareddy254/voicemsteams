// Builds the Teams app package: appPackage/build/teams-voice-app.zip
// Usage (PowerShell): $env:TAB_DOMAIN="myhost.example.com"; npm run package:teams
import { deflateRawSync, deflateSync, crc32 } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "appPackage", "build");

const TAB_DOMAIN = (process.env.TAB_DOMAIN || "localhost:5173")
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "");
const TEAMS_APP_ID = process.env.TEAMS_APP_ID || "b8fac257-948d-45b6-b3b5-a3b30f7640f6";

// ---------- PNG icon generation (no external deps) ----------
function png(size, pixel) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = y * stride + 1 + x * 4;
      const [r, g, b, a] = pixel(x, y);
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Sound-wave bars glyph.
function inWave(x, y, size) {
  const bars = [0.35, 0.6, 0.85, 0.6, 0.35];
  const barW = size * 0.09;
  const gap = size * 0.05;
  const total = bars.length * barW + (bars.length - 1) * gap;
  const startX = (size - total) / 2;
  for (let i = 0; i < bars.length; i++) {
    const bx = startX + i * (barW + gap);
    const h = bars[i] * size * 0.6;
    const by = (size - h) / 2;
    if (x >= bx && x < bx + barW && y >= by && y < by + h) return true;
  }
  return false;
}

const color = png(192, (x, y) => {
  if (inWave(x, y, 192)) return [255, 255, 255, 255];
  const t = (x + y) / 384;
  return [Math.round(79 + t * 44), Math.round(82 + t * 49), Math.round(178 + t * 57), 255];
});
const outline = png(32, (x, y) => (inWave(x, y, 32) ? [255, 255, 255, 255] : [0, 0, 0, 0]));

// ---------- Manifest ----------
const manifest = readFileSync(join(root, "appPackage", "manifest.template.json"), "utf8")
  .replaceAll("${{TAB_DOMAIN}}", TAB_DOMAIN)
  .replaceAll("${{TEAMS_APP_ID}}", TEAMS_APP_ID);
JSON.parse(manifest);

// ---------- Minimal ZIP writer ----------
function zip(files) {
  const parts = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name);
    const comp = deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, comp);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += 30 + nameBuf.length + comp.length;
  }
  const cdSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...centrals, end]);
}

mkdirSync(outDir, { recursive: true });
const files = [
  ["manifest.json", Buffer.from(manifest)],
  ["color.png", color],
  ["outline.png", outline],
];
for (const [name, data] of files) writeFileSync(join(outDir, name), data);
writeFileSync(join(outDir, "teams-voice-app.zip"), zip(files));

console.log(`Teams package created for https://${TAB_DOMAIN}`);
console.log(`  ${join(outDir, "teams-voice-app.zip")}`);

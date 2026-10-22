// Placeholder images for demo records (no external files needed): a dark
// radiograph-like panel for X-rays and a white page with grey lines for
// reports. Minimal PNG encoder on top of zlib.
import zlib from "node:zlib";

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

// paint(x, y) -> [r, g, b]
export function png(width, height, paint) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const o = y * stride + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const noise = (x, y, seed) => {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return n - Math.floor(n);
};

// A periapical-style view: dark field, soft bone texture, two or three
// bright tooth shapes with darker root canals. `variant` changes the layout.
export function xrayImage(variant = 0, width = 480, height = 360) {
  const teeth = [
    { cx: 0.32, top: 0.18, w: 0.11, h: 0.62 },
    { cx: 0.52, top: 0.14, w: 0.12, h: 0.68 },
    { cx: 0.72, top: 0.2, w: 0.1, h: 0.58 },
  ].slice(0, 2 + (variant % 2));
  return png(width, height, (x, y) => {
    const u = x / width;
    const v = y / height;
    const vignette = 1 - Math.hypot(u - 0.5, v - 0.5) * 1.1;
    let lum = 28 + 40 * Math.max(0, vignette) + 18 * noise(x >> 2, y >> 2, variant);
    // bone line below the crowns
    if (v > 0.55) lum += 35 * Math.min(1, (v - 0.55) * 4) * (0.7 + 0.3 * noise(x >> 3, 0, variant));
    for (const t of teeth) {
      const dx = (u - t.cx) / (t.w / 2);
      const dy = (v - t.top) / t.h;
      if (dy < 0 || dy > 1) continue;
      const taper = dy < 0.45 ? 1 : 1 - (dy - 0.45) * 1.3; // crown wide, root narrow
      if (Math.abs(dx) <= taper) {
        const edge = 1 - Math.abs(dx) / taper;
        lum = 150 + 90 * Math.pow(edge, 0.6) - 30 * dy;
        if (Math.abs(dx) < 0.22 && dy > 0.35) lum -= 70; // root canal
        if (variant % 3 === 1 && t === teeth[0] && dy < 0.3 && dx > 0.3) lum -= 90; // a carious patch
      }
    }
    const g = clamp(lum);
    return [clamp(g * 0.92), clamp(g * 0.96), g];
  });
}

// A scanned lab/report page: white with a header bar and ruled lines.
export function reportImage(variant = 0, width = 420, height = 560) {
  return png(width, height, (x, y) => {
    const header = y > 28 && y < 70 && x > 32 && x < width - 32;
    if (header) return variant % 2 ? [31, 122, 102] : [52, 84, 150];
    const lineGap = 26;
    const inText = y > 110 && y < height - 60 && x > 44 && x < width - 44 - ((variant * 37 + y) % 120);
    if (inText && y % lineGap < 6) return [96, 96, 104];
    if (x < 12 || x > width - 12 || y < 10 || y > height - 10) return [226, 226, 230];
    const grain = 248 + 6 * noise(x, y, variant);
    return [clamp(grain), clamp(grain), clamp(grain)];
  });
}

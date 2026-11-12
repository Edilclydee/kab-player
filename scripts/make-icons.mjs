// Draws the app icons (PNG) with no dependencies: dark tile, amber disc, play triangle.
import { deflateSync, crc32 } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';

const BG = [14, 14, 16], DISC = [245, 165, 36], TRI = [26, 18, 3];

function inTriangle(x, y, [a, b, c]) {
  const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const d1 = s([x, y], a, b), d2 = s([x, y], b, c), d3 = s([x, y], c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function draw(size) {
  const SS = 4; // supersampling per axis
  const r = 0.34; // disc radius (fits the maskable safe zone)
  const tri = [[0.43, 0.355], [0.43, 0.645], [0.66, 0.5]];
  const px = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    px[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
        let c = BG;
        if ((u - 0.5) ** 2 + (v - 0.5) ** 2 <= r * r) c = inTriangle(u, v, tri) ? TRI : DISC;
        acc = acc.map((a, i) => a + c[i]);
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let i = 0; i < 3; i++) px[o + i] = Math.round(acc[i] / (SS * SS));
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(px, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir('site/icons', { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await writeFile(`site/icons/${name}`, draw(size));
  console.log('wrote', name);
}
await writeFile('site/icons/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="22" fill="#0e0e10"/><circle cx="50" cy="50" r="38" fill="#f5a524"/>
<path d="M41 33.5v33L67 50z" fill="#1a1203"/></svg>
`);
console.log('wrote icon.svg');

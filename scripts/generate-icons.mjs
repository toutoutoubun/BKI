import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const outDir = path.resolve('src-tauri/icons');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function pngFromRgba(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const stride = width * 4;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rows[y * (stride + 1)] = 0;
    rgba.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND'),
  ]);
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const put = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const index = (y * size + x) * 4;
    const alpha = color[3] / 255;
    const inverse = 1 - alpha;
    rgba[index] = Math.round(color[0] * alpha + rgba[index] * inverse);
    rgba[index + 1] = Math.round(color[1] * alpha + rgba[index + 1] * inverse);
    rgba[index + 2] = Math.round(color[2] * alpha + rgba[index + 2] * inverse);
    rgba[index + 3] = Math.round(color[3] + rgba[index + 3] * inverse);
  };
  const fillRect = (x, y, width, height, color) => {
    for (let yy = Math.round(y); yy < Math.round(y + height); yy += 1) {
      for (let xx = Math.round(x); xx < Math.round(x + width); xx += 1) put(xx, yy, color);
    }
  };
  const fillCircle = (cx, cy, radius, color) => {
    const minX = Math.floor(cx - radius);
    const maxX = Math.ceil(cx + radius);
    const minY = Math.floor(cy - radius);
    const maxY = Math.ceil(cy + radius);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) put(x, y, color);
      }
    }
  };
  const fillRoundedRect = (x, y, width, height, radius, color) => {
    const right = x + width;
    const bottom = y + height;
    for (let yy = Math.floor(y); yy < Math.ceil(bottom); yy += 1) {
      for (let xx = Math.floor(x); xx < Math.ceil(right); xx += 1) {
        const nearX = xx < x + radius ? x + radius : xx > right - radius ? right - radius : xx;
        const nearY = yy < y + radius ? y + radius : yy > bottom - radius ? bottom - radius : yy;
        if ((xx - nearX) ** 2 + (yy - nearY) ** 2 <= radius ** 2) put(xx, yy, color);
      }
    }
  };
  const fillPolygon = (points, color) => {
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += 1) {
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x += 1) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
          const [xi, yi] = points[i];
          const [xj, yj] = points[j];
          const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
          if (intersects) inside = !inside;
        }
        if (inside) put(x, y, color);
      }
    }
  };
  const drawLine = (x1, y1, x2, y2, width, color) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let step = 0; step <= steps; step += 1) {
      const t = steps ? step / steps : 0;
      fillCircle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, width / 2, color);
    }
  };

  const scale = size / 512;
  fillRoundedRect(24 * scale, 24 * scale, 464 * scale, 464 * scale, 104 * scale, [28, 63, 92, 255]);
  fillRoundedRect(52 * scale, 52 * scale, 408 * scale, 408 * scale, 76 * scale, [41, 95, 126, 255]);
  fillRoundedRect(98 * scale, 80 * scale, 316 * scale, 352 * scale, 28 * scale, [247, 250, 252, 255]);
  fillPolygon(
    [
      [342 * scale, 80 * scale],
      [414 * scale, 152 * scale],
      [342 * scale, 152 * scale],
    ],
    [219, 229, 236, 255],
  );
  fillRoundedRect(128 * scale, 132 * scale, 126 * scale, 18 * scale, 8 * scale, [55, 80, 101, 230]);
  fillRoundedRect(128 * scale, 172 * scale, 226 * scale, 12 * scale, 6 * scale, [176, 190, 201, 255]);
  fillRoundedRect(128 * scale, 202 * scale, 188 * scale, 12 * scale, 6 * scale, [196, 207, 215, 255]);
  fillRoundedRect(128 * scale, 232 * scale, 226 * scale, 12 * scale, 6 * scale, [196, 207, 215, 255]);
  fillRoundedRect(138 * scale, 308 * scale, 34 * scale, 70 * scale, 10 * scale, [44, 139, 104, 255]);
  fillRoundedRect(198 * scale, 274 * scale, 34 * scale, 104 * scale, 10 * scale, [47, 111, 166, 255]);
  fillRoundedRect(258 * scale, 244 * scale, 34 * scale, 134 * scale, 10 * scale, [44, 139, 104, 255]);
  fillRoundedRect(318 * scale, 288 * scale, 34 * scale, 90 * scale, 10 * scale, [47, 111, 166, 255]);
  drawLine(128 * scale, 396 * scale, 366 * scale, 396 * scale, 8 * scale, [55, 80, 101, 255]);
  drawLine(132 * scale, 350 * scale, 205 * scale, 306 * scale, 10 * scale, [214, 114, 68, 255]);
  drawLine(205 * scale, 306 * scale, 274 * scale, 342 * scale, 10 * scale, [214, 114, 68, 255]);
  drawLine(274 * scale, 342 * scale, 358 * scale, 254 * scale, 10 * scale, [214, 114, 68, 255]);
  fillCircle(132 * scale, 350 * scale, 12 * scale, [214, 114, 68, 255]);
  fillCircle(205 * scale, 306 * scale, 12 * scale, [214, 114, 68, 255]);
  fillCircle(274 * scale, 342 * scale, 12 * scale, [214, 114, 68, 255]);
  fillCircle(358 * scale, 254 * scale, 12 * scale, [214, 114, 68, 255]);

  return pngFromRgba(size, size, rgba);
}

function writeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

function writeIcns(images) {
  const types = new Map([
    [16, 'icp4'],
    [32, 'icp5'],
    [64, 'icp6'],
    [128, 'ic07'],
    [256, 'ic08'],
    [512, 'ic09'],
    [1024, 'ic10'],
  ]);
  const chunks = images.map(({ size, data }) => {
    const block = Buffer.alloc(8);
    block.write(types.get(size), 0, 4, 'ascii');
    block.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([block, data]);
  });
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(8 + chunks.reduce((sum, item) => sum + item.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}

fs.mkdirSync(outDir, { recursive: true });

const standardPngs = [
  [32, '32x32.png'],
  [128, '128x128.png'],
  [256, '128x128@2x.png'],
  [512, 'icon.png'],
].map(([size, filename]) => {
  const data = drawIcon(size);
  fs.writeFileSync(path.join(outDir, filename), data);
  return { size, data };
});

const icoImages = [16, 32, 48, 64, 128, 256].map((size) => ({ size, data: drawIcon(size) }));
fs.writeFileSync(path.join(outDir, 'icon.ico'), writeIco(icoImages));

const icnsImages = [16, 32, 64, 128, 256, 512, 1024].map((size) => ({ size, data: drawIcon(size) }));
fs.writeFileSync(path.join(outDir, 'icon.icns'), writeIcns(icnsImages));

console.log(`Generated ${standardPngs.length + 2} icon asset(s) in ${outDir}`);


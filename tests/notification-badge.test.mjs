import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';

test('notification badge is a 96px monochrome silhouette with transparent margins and center', async () => {
  const png = await readFile(new URL('../ogritech-notification-badge.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.equal(width, 96); assert.equal(height, 96);
  assert.equal(png[24], 8); assert.equal(png[25], 6); assert.equal(png[28], 0);
  const chunks = [];
  for (let at = 8; at < png.length;) {
    const size = png.readUInt32BE(at);
    if (png.toString('ascii', at + 4, at + 8) === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + size));
    at += size + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4, pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      const prediction = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)][filter];
      pixels[y * stride + x] = (raw[y * (stride + 1) + x + 1] + prediction) & 255;
    }
  }
  let solid = 0, transparent = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) transparent++;
    if (pixels[i + 3] > 128) {
      solid++;
      assert.ok(Math.abs(pixels[i] - pixels[i + 1]) <= 2 && Math.abs(pixels[i + 1] - pixels[i + 2]) <= 2);
    }
  }
  assert.ok(solid > width * height * .15 && solid < width * height * .65);
  assert.ok(transparent > width * height * .3, 'The opaque square that caused the regression must be absent.');
  for (let n = 0; n < width; n++) {
    for (const at of [n, (height - 1) * width + n, n * width, n * width + width - 1]) assert.equal(pixels[at * 4 + 3], 0);
  }
  assert.equal(pixels[(48 * width + 48) * 4 + 3], 0, 'The central opening stays transparent.');
});

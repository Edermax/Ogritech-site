import {readFile, writeFile, access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// Prepare the monochrome source for the Notifications API's 96px alpha mask.
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('assets/branding/notification-badge-source.png', root));
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executablePath = process.env.OGRITECH_BROWSER_PATH || await access(edge).then(() => edge, () => undefined);
const browser = await chromium.launch({headless: true, executablePath});
try {
  const page = await browser.newPage();
  const png = await page.evaluate(async data => {
    const image = new Image(); image.src = 'data:image/png;base64,' + data;
    await image.decode();
    const original = document.createElement('canvas');
    original.width = image.width; original.height = image.height;
    const context = original.getContext('2d', {willReadFrequently: true});
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let left = image.width, top = image.height, right = 0, bottom = 0;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      if (pixels[(y * image.width + x) * 4 + 3] > 8) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    if (left >= right || top >= bottom) throw Error('The badge source is empty.');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
    const output = canvas.getContext('2d');
    output.imageSmoothingQuality = 'high';
    const width = right - left + 1, height = bottom - top + 1, scale = 80 / Math.max(width, height);
    output.drawImage(image, left, top, width, height, (96 - width * scale) / 2, (96 - height * scale) / 2, width * scale, height * scale);
    return canvas.toDataURL('image/png').split(',')[1];
  }, source.toString('base64'));
  const path = new URL('ogritech-notification-badge.png', root);
  await writeFile(path, Buffer.from(png, 'base64'));
  console.log(fileURLToPath(path));
} finally {await browser.close();}

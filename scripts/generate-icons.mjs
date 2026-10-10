// 生成扩展图标：从 docs/design/assets/logo-source.png 派生各尺寸 PNG。
// 源素材是用户提供的圆形徽章插画，裁圆与定尺寸的过程记录在 artifacts/logo/prepare-source.py。
// 输出到 public/icon/，WXT 会按文件名自动写进 manifest.icons。
//
// 用法：pnpm icons
// 缩放交给本机 Chrome 的无头截图，可用 CHROME_PATH 覆盖可执行文件位置。

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceFile = join(root, 'docs', 'design', 'assets', 'logo-source.png');
const pngDir = join(root, 'public', 'icon');
const tmpDir = join(root, 'node_modules', '.cache', 'icon-render');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : undefined,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const chrome = CHROME_CANDIDATES.find(candidate => existsSync(candidate));
if (!chrome) {
  throw new Error('找不到 Chrome。请设置 CHROME_PATH 指向可执行文件后重试。');
}
if (!existsSync(sourceFile)) {
  throw new Error(`缺少源素材 ${sourceFile}，请先准备 docs/design/assets/logo-source.png。`);
}

const sourceDataUri = `data:image/png;base64,${readFileSync(sourceFile).toString('base64')}`;
const SIZES = [16, 32, 48, 96, 128];

/** 渲染单个尺寸：把源素材按目标像素铺满页面，交给无头 Chrome 截图，保留圆外透明。 */
function renderPng(size, outFile) {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}img{display:block;width:${size}px;height:${size}px}</style>
</head><body><img src="${sourceDataUri}" width="${size}" height="${size}" alt=""></body></html>`;
  const htmlPath = join(tmpDir, `icon-${size}.html`);
  writeFileSync(htmlPath, html, 'utf8');

  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    `--user-data-dir=${join(tmpDir, 'profile')}`,
    `--window-size=${size},${size}`,
    `--screenshot=${outFile}`,
    `file:///${htmlPath.replace(/\\/g, '/')}`,
  ], { stdio: 'ignore' });

  const png = readFileSync(outFile);
  const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  if (width !== size || height !== size) {
    throw new Error(`${outFile} 实际输出 ${width}x${height}，期望 ${size}x${size}`);
  }
}

mkdirSync(pngDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });

for (const size of SIZES) {
  renderPng(size, join(pngDir, `${size}.png`));
  console.log(`public/icon/${size}.png`);
}
console.log('图标已更新，源素材为 docs/design/assets/logo-source.png');

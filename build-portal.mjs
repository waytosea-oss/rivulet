/* Build a standalone zip for CrazyGames or Poki.
   node build-portal.mjs
   node build-portal.mjs --sdk poki
   node build-portal.mjs --sdk crazygames
   The zip has no hub link, no stats endpoint, and no remote script
   unless you pass --sdk. */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
let sdk = '';
const si = argv.indexOf('--sdk');
if (si >= 0) sdk = (argv[si + 1] || '').toLowerCase();
if (sdk === 'crazy') sdk = 'crazygames';
if (sdk && sdk !== 'poki' && sdk !== 'crazygames') {
  console.error('Unknown SDK. Use poki or crazygames.');
  process.exit(1);
}

const files = ['index.html', 'style.css', 'ads.js', 'audio.js', 'sim.js', 'levels.js', 'game.js', 'fluid.js', 'vendor/three.module.min.js'];
const outDir = path.join(root, 'dist');
const stage = path.join(outDir, 'rivulet');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(path.join(stage, 'vendor'), { recursive: true });

for (const f of files) {
  const src = path.join(root, f);
  const dest = path.join(stage, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let text = fs.readFileSync(src);
  if (f === 'index.html') {
    let html = text.toString('utf8');
    html = html.replace(/\s*<script src="\.\.\/track\.js"><\/script>\s*/, '\n');
    const stamp = '<script>window.RIVULET_PORTAL=1;window.RIVULET_SDK=' + JSON.stringify(sdk) + ';</script>\n';
    html = html.replace('<script src="ads.js"></script>', stamp + '<script src="ads.js"></script>');
    text = Buffer.from(html);
  }
  if (f === 'ads.js') {
    let js = text.toString('utf8');
    const poki = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';
    const crazy = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
    if (sdk !== 'poki') js = js.split(poki).join('');
    if (sdk !== 'crazygames') js = js.split(crazy).join('');
    text = Buffer.from(js);
  }
  if (f === 'vendor/three.module.min.js') {
    let js = text.toString('utf8');
    js = js.replace(/https:\/\/discourse\.threejs\.org\/[^"'\\\s)]+/g, '');
    text = Buffer.from(js);
  }
  fs.writeFileSync(dest, text);
}

const zipName = sdk ? 'rivulet-' + sdk + '.zip' : 'rivulet-portal.zip';
const zipPath = path.join(outDir, zipName);
fs.rmSync(zipPath, { force: true });
execFileSync('zip', ['-r', '-X', zipPath, 'rivulet'], { cwd: outDir });

const banned = [/tilo/i, /trigger-tech/, /\.\.\/track/, /collect\.php/];
const allowHost = sdk === 'poki' ? 'game-cdn.poki.com' : sdk === 'crazygames' ? 'sdk.crazygames.com' : null;
const httpRe = /https?:\/\/[^\s"'`)>]+/g;
let bad = 0;
for (const f of files) {
  const body = fs.readFileSync(path.join(stage, f), 'utf8');
  for (const re of banned) if (re.test(body)) { console.error('Banned text in', f, re); bad++; }
  const urls = body.match(httpRe) || [];
  for (const u of urls) {
    if (u.indexOf('www.w3.org') >= 0) continue;
    if (allowHost && u.indexOf(allowHost) >= 0) continue;
    console.error('External URL in', f, u);
    bad++;
  }
}
if (bad) { console.error('Zip failed the portal check.'); process.exit(1); }
const size = fs.statSync(zipPath).size;
console.log('Wrote', zipPath, '(' + Math.round(size / 1024) + ' KB)', sdk ? 'SDK ' + sdk : 'stub SDK');

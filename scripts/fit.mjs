import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 8912;
const VIEWPORTS = [[1920, 1080], [1600, 900], [1440, 900], [1366, 768], [1280, 800],
  [1180, 820], [1024, 768], [834, 1112], [768, 1024], [430, 932], [414, 896],
  [390, 844], [375, 667], [360, 780], [320, 568]];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.webp': 'image/webp' };

const server = await new Promise(r => {
  const s = createServer(async (req, res) => {
    const p = normalize(decodeURIComponent(req.url.split('?')[0]));
    const f = join(ROOT, p === '/' ? 'index.html' : p);
    try { await stat(f); res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); }
    catch { res.writeHead(404); res.end(); }
  });
  s.listen(PORT, () => r(s));
});

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN });
let failed = 0;

for (const [w, h] of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1400);
  const r = await page.evaluate(() => {
    const h1 = document.querySelector('.hero h1');
    const cta = document.querySelector('.hero-cta');
    if (!h1 || !cta) return { missing: !h1 ? '.hero h1' : '.hero-cta' };
    const cs = getComputedStyle(h1);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.1;
    const rect = h1.getBoundingClientRect();
    return {
      fontSize: Math.round(parseFloat(cs.fontSize)),
      lines: Math.round(rect.height / lh),
      overflowX: h1.scrollWidth > h1.clientWidth + 1,
      docScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ctaBottom: Math.round(cta.getBoundingClientRect().bottom),
    };
  });
  if (r.missing) {
    console.log(`FAIL selector not found: ${r.missing}`);
    await page.close();
    await browser.close();
    server.close();
    process.exit(1);
  }
  const flags = [];
  if (r.overflowX) flags.push('H1-OVERFLOW');
  if (r.docScrollX) flags.push('DOC-SCROLL-X');
  if (r.ctaBottom > h) flags.push('CTA-BELOW-FOLD');
  if (flags.length) failed++;
  console.log(`${String(w).padStart(5)}x${String(h).padEnd(5)} fs=${String(r.fontSize).padStart(3)} ` +
    `lines=${r.lines} ctaBottom=${String(r.ctaBottom).padStart(4)}/${h} ` +
    `slack=${String(h - r.ctaBottom).padStart(4)}px ${flags.join(' ')}`);
  await page.close();
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} viewport(s) with problems` : '\nfits at all 15 viewports');
process.exit(failed ? 1 : 0);

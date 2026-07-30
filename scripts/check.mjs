import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PAGES = ['/index.html', '/aiden.html', '/audit.html', '/tools.html',
  '/programme.html',
  '/the-brain.html', '/proof.html',
  '/case-studies/mother-london.html', '/case-studies/uncommon.html',
  '/case-studies/alt-shift.html', '/case-studies/monigle.html',
  '/case-studies/collinson.html'];
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp' };

function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(req.url.split('?')[0]));
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    try {
      await stat(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  // Port 0 asks the OS for a free ephemeral port instead of a fixed one, so
  // concurrent runs (this repo will have several agents running this
  // repeatedly across the next eleven tasks) never collide on the same
  // socket, and a leaked listener from a crashed run never blocks the next.
  return new Promise(r => server.listen(0, () => r(server)));
}

const server = await serve();
const PORT = server.address().port;
let browser;
let failed = 0;

try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN });

  for (const path of PAGES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = [], bad = [], hosts = new Set();
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('response', r => {
      if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(0, 60));
      try { const h = new URL(r.url()).hostname; if (h !== 'localhost') hosts.add(h); } catch {}
    });

    const res = await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'load' });
    if (!res || res.status() >= 400) {
      console.log('FAIL ' + path.padEnd(36) + ' page did not load (' + (res && res.status()) + ')');
      failed++; await page.close(); continue;
    }

    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 400) {
      await page.evaluate(v => scrollTo(0, v), y);
      await page.waitForTimeout(60);
    }
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(3000);

    const r = await page.evaluate(() => {
      const effective = el => {
        let o = 1, n = el;
        while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
        return o;
      };
      return {
        brokenImages: [...document.images]
          .filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src.slice(-40)),
        curlyAttributes: [...new Set([...document.querySelectorAll('*')]
          .flatMap(e => [...e.classList]).filter(c => /[“”]/.test(c)))],
        invisibleIndices: [...document.querySelectorAll('.fade-in')]
          .map((e, i) => [i, effective(e)])
          .filter(([, o]) => o < 0.05)
          .map(([i]) => i),
        deadAnchors: [...document.querySelectorAll('a[href^="#"]')]
          .map(a => a.getAttribute('href'))
          .filter(h => h !== '#' && !document.getElementById(h.slice(1))),
        dashes: /[–—]/.test(document.body.innerText),
        words: document.body.innerText.trim().split(/\s+/).filter(Boolean).length,
        height: document.documentElement.scrollHeight,
      };
    });

    // The first opacity reading races the IntersectionObserver: scrolling past
    // an element faster than a frame can be reported leaves it looking stuck
    // when the callback simply never fired yet. Give each candidate a second
    // chance: force a real scroll to it on its own (an unconditional scroll,
    // since the element is by definition already in view, which is exactly
    // why the observer missed it the first time), then check whether the
    // observer actually toggles the visible class this time before reading
    // opacity. That separates two different failure modes: the observer
    // never firing even after a forced scroll, versus the class being applied
    // but the element still not becoming visible once the 0.8s transition
    // (index.html:836-841) has had time to run.
    let invisible = 0, neverFired = 0;
    for (const idx of r.invisibleIndices) {
      await page.evaluate(i => {
        document.querySelectorAll('.fade-in')[i].scrollIntoView({ block: 'center' });
      }, idx);
      let fired = true;
      try {
        // The page sets scroll-behavior: smooth globally (index.html:146), so
        // the forced scroll above is an animation, not an instant jump, and
        // the observer cannot fire until it settles. Measured directly: one
        // element took 885ms to gain the class after a forced scroll, so the
        // budget has to clear that with margin rather than assume near-instant
        // delivery.
        await page.waitForFunction(
          i => document.querySelectorAll('.fade-in')[i].classList.contains('visible'),
          idx, { timeout: 2000 }
        );
      } catch {
        fired = false;
      }
      if (!fired) { neverFired++; continue; }
      await page.waitForTimeout(900);
      const stillBad = await page.evaluate(i => {
        const effective = el => {
          let o = 1, n = el;
          while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
          return o;
        };
        return effective(document.querySelectorAll('.fade-in')[i]) < 0.05;
      }, idx);
      if (stillBad) invisible++;
    }

    const problems = [];
    if (errs.length) problems.push('js:' + errs.slice(0, 2).join(' '));
    if (bad.length) problems.push('http:' + bad.join(','));
    if (r.brokenImages.length) problems.push('img:' + r.brokenImages.join(','));
    if (r.curlyAttributes.length) problems.push('curly-attr:' + r.curlyAttributes.length);
    if (invisible) problems.push('invisible:' + invisible);
    if (neverFired) problems.push('observer-never-fired:' + neverFired);
    if (r.deadAnchors.length) problems.push('anchor:' + r.deadAnchors.join(','));
    if (r.dashes) problems.push('dash');
    for (const h of hosts) if (h !== 'res.cloudinary.com') problems.push('external-host:' + h);

    if (problems.length) failed++;
    console.log((problems.length ? 'FAIL ' : 'ok   ') + path.padEnd(36) +
      String(r.words).padStart(6) + 'w ' + String(r.height).padStart(6) + 'px  ' + problems.join(' | '));
    await page.close();
  }
} finally {
  if (browser) await browser.close();
  server.close();
}

console.log(failed ? `\n${failed} page(s) with problems` : '\nall pages clean');
process.exit(failed ? 1 : 0);

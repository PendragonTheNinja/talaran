// Renders the four YouTube thumbnails to trailer/out/thumb-<n>.jpg (1280x720).
//   node trailer/thumbs.js   (from the repo root)
const { chromium } = require('playwright')
const { execFileSync } = require('child_process')
const http = require('http'), fs = require('fs'), path = require('path')
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(__dirname, 'out')
const TYPES = { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg' }
async function main() {
    fs.mkdirSync(OUT, { recursive: true })
    const server = await new Promise(res => { const s = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end() } r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r) }).listen(0, () => res(s)) })
    const browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
    await page.goto(`http://localhost:${server.address().port}/trailer/index.html?render`)
    await page.evaluate(() => window.ready)
    for (let n = 0; n < 4; n++) {
        const url = await page.evaluate(n => { window.thumb(n); return document.getElementById('c').toDataURL('image/png') }, n)
        const big = path.join(OUT, `thumb-${n + 1}-1920.png`)
        fs.writeFileSync(big, Buffer.from(url.split(',')[1], 'base64'))
        execFileSync('convert', [big, '-resize', '1280x720', '-quality', '92', path.join(OUT, `thumb-${n + 1}.jpg`)])
    }
    await browser.close(); server.close()
}
main().catch(e => { console.error(e); process.exit(1) })

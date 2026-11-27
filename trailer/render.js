// Renders the trailer frame by frame to MP4 with the cut music.
//   node trailer/render.js                 -> trailer/out/talaran-trailer.mp4
//   node trailer/render.js --stills 1,14,40 -> trailer/out/still-<t>.jpg (for checking)
//   add --vertical for the 9:16 social cut (talaran-trailer-9x16.mp4)
// Run from the repo root; it serves the repo on a local port so the page can read
// the game's images.
const { chromium } = require('playwright')
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(__dirname, 'out')
const FPS = Number(process.env.FPS || 30)
const VERTICAL = process.argv.includes('--vertical')
const [VW, VH] = VERTICAL ? [1080, 1920] : [1920, 1080]
const TYPES = { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.js': 'text/javascript' }

function serve() {
    return new Promise(res => {
        const s = http.createServer((req, resp) => {
            const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]))
            if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { resp.writeHead(404); return resp.end() }
            resp.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' })
            fs.createReadStream(p).pipe(resp)
        }).listen(0, () => res(s))
    })
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true })
    const server = await serve()
    const port = server.address().port
    const browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: VW, height: VH } })
    page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') console.log('page:', m.text()) })
    await page.goto(`http://localhost:${port}/trailer/index.html?render${VERTICAL ? '&vertical' : ''}`)
    await page.evaluate(() => window.ready)
    const grab = t => page.evaluate(t => { window.render(t); return document.getElementById('c').toDataURL('image/jpeg', 0.93) }, t)

    const si = process.argv.indexOf('--stills')
    if (si > 0) {
        for (const t of process.argv[si + 1].split(',').map(Number)) {
            const url = await grab(t)
            fs.writeFileSync(path.join(OUT, `still-${VERTICAL ? 'v' : ''}${t}.jpg`), Buffer.from(url.split(',')[1], 'base64'))
        }
    } else {
        const duration = await page.evaluate(() => window.DURATION)
        const frames = Math.round(duration * FPS)
        const file = path.join(OUT, VERTICAL ? 'talaran-trailer-9x16.mp4' : 'talaran-trailer.mp4')
        const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
            '-i', path.join(__dirname, 'music-cut.mp3'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] })
        for (let f = 0; f < frames; f++) {
            const url = await grab(f / FPS)
            const buf = Buffer.from(url.split(',')[1], 'base64')
            if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r))
            if (f % (FPS * 5) === 0) console.log(`frame ${f}/${frames}`)
        }
        ff.stdin.end()
        await new Promise(r => ff.on('close', r))
        console.log('wrote', file)
    }
    await browser.close(); server.close()
}
main().catch(e => { console.error(e); process.exit(1) })

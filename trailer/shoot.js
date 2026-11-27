// Captures real game screens for the trailer from a local server and client
// (README.md, "Game screens"). Each shot logs in as a player, opens the game,
// runs optional steps, and saves trailer/shots/<name>.png at 1920x1080.
//   node trailer/shoot.js <name> [player] [steps.json]
// steps: [{ "click": "text=Museum" } | { "wait": 800 } | { "eval": "js" } | { "clip": [x,y,w,h] }]
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const API = process.env.API || 'http://localhost:3000'
const APP = process.env.APP || 'http://localhost:5173'

// Logins are cached: the auth rate limit refuses a burst of them.
const CACHE = path.join(__dirname, 'shots', '.logins.json')
async function loginAs(name) {
    let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')) } catch { }
    if (cache[name]) return cache[name]
    const l = await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, password: 'trailerpass1' }) })).json()
    if (!l.token) throw new Error('login failed for ' + name + ': ' + JSON.stringify(l))
    cache[name] = l; fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(cache))
    return l
}

async function main() {
    const [name, player = 'Pendragon', stepsArg = '[]'] = process.argv.slice(2)
    const steps = JSON.parse(fs.existsSync(stepsArg) ? fs.readFileSync(stepsArg, 'utf8') : stepsArg)
    const login = await loginAs(player)
    const browser = await chromium.launch()
    // others standing about: logged in on pages of their own, so they show in Players Here
    for (const other of (process.env.ALSO || '').split(',').filter(Boolean)) {
        const l = await loginAs(other)
        const op = await (await browser.newContext()).newPage()
        await op.addInitScript(([t, p]) => { localStorage.setItem('talaran_token', t); localStorage.setItem('talaran_player', JSON.stringify(p)) }, [l.token, l.player])
        await op.goto(APP + '/game')
        await op.waitForSelector('text=Players Here', { timeout: 60000 }).catch(() => console.log('slow page for', other))
    }
    const page =await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
    await page.addInitScript(([t, p]) => { localStorage.setItem('talaran_token', t); localStorage.setItem('talaran_player', JSON.stringify(p)) }, [login.token, login.player])
    await page.goto(APP + '/game')
    await page.waitForSelector('text=Players Here', { timeout: 60000 })
    await page.waitForTimeout(2500)
    let clip
    for (const s of steps) {
        if (s.click) await page.locator(s.click).first().click({ timeout: 5000 }).catch(e => console.log('click failed', s.click, e.message.split('\n')[0]))
        if (s.wait) await page.waitForTimeout(s.wait)
        if (s.eval) await page.evaluate(s.eval)
        if (s.sql) require('child_process').execFileSync('/tmp/claude-0/q.sh', [s.sql])
        if (s.shot) { await page.screenshot({ path: path.join(__dirname, 'shots', s.shot + '.png') }) }
        if (s.clip) clip = { x: s.clip[0], y: s.clip[1], width: s.clip[2], height: s.clip[3] }
    }
    fs.mkdirSync(path.join(__dirname, 'shots'), { recursive: true })
    await page.bringToFront()
    await page.screenshot({ path: path.join(__dirname, 'shots', name + '.png'), clip })
    await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })

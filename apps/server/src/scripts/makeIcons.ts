/**
 * Item icons from raw generated images (Nathan's workflow, 2026-11-21).
 *
 *   pnpm icons:make                      every image in design/icon-inbox
 *   pnpm icons:make -- --in <folder>     another folder
 *   pnpm icons:make -- --force           replace icons that already exist
 *   pnpm icons:make -- --out <folder>    write somewhere else (to try settings)
 *   pnpm icons:make -- --threshold 30    how dark counts as background (0-255)
 *
 * Each image must be NAMED FOR ITS ITEM: "Kelpie's Bridle.jpg" becomes
 * apps/client/public/images/items/Kelpies_Bridle.png, by the game's own rule
 * (getItemIcon in apps/client/src/lib/items.ts: spaces to underscores,
 * apostrophes dropped, iconOverrides.json first). Underscores in the file name
 * are read as spaces, so "Kelpies_Bridle.jpg" works too.
 *
 * What it does to each one, for art made on a black background:
 *   1. Background: near-black pixels joined to the edge of the picture, plus
 *      any large, flat-black region the item closes round (the hole of a ring,
 *      the loop of a cord). Shadow inside the item is kept: it is never as
 *      black, or as even, as the background.
 *   2. A soft edge: pixels beside the background take their opacity from their
 *      brightness, so hairs, fuzz, and frayed ends fade out rather than being
 *      cut off square.
 *   3. No black halo: an edge pixel's color is un-mixed from the black behind
 *      it (art on black is color x opacity, so color = seen / opacity).
 *   4. Trimmed to the item, scaled so its longest side is 116 px, and centred
 *      on a 128 x 128 transparent square: how the 341 shipped icons sit (their
 *      longest side is 116 px at the median, measured 2026-11-21).
 *   5. A contact sheet, _contact-sheet.png in the inbox, showing every result
 *      on light, dark, and Stonehold-brown, to check them at a glance.
 *
 * Images that are already transparent skip steps 1 to 3. Nothing here touches
 * the database or the server; it only reads and writes image files.
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const REPO = path.resolve(__dirname, '../../../..');
const CANVAS = 128;
const ITEM_SIDE = 116;
const SOFT_BAND = 3;            // px beside the background that get a soft edge
const SOFT_TOP = 48;            // brightness at and above which an edge pixel is solid
const HOLE_SHARE = 0.002;       // an enclosed dark region this share of the picture or more may be a hole
const HOLE_MEAN = 2.5;          // ...if it is as flat black as the background (true black is 0 to 3; shadow is not)
const WORK_SIDE = 1024;         // large inputs are worked at this size

function arg(name: string): string | null {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] ?? null : null;
}
const FORCE = process.argv.includes('--force');
const IN_DIR = path.resolve(REPO, arg('in') ?? 'design/icon-inbox');
const OUT_DIR = path.resolve(REPO, arg('out') ?? 'apps/client/public/images/items');
// Measured on Flow's output (2026-11-21): the background is 0 to 3 (JPEG specks to
// 16), an item's deepest shadow 5 to 40. Higher eats shadow; lower leaves specks.
const THRESHOLD = Number(arg('threshold') ?? 8);

const overrides: Record<string, string> = (() => {
    try {
        return JSON.parse(fs.readFileSync(path.join(REPO, 'apps/client/src/lib/iconOverrides.json'), 'utf8'));
    } catch { return {}; }
})();

/** The icon file for an item name, exactly as getItemIcon builds it. */
export function iconFileFor(itemName: string): string {
    return (overrides[itemName] ?? itemName.replace(/ /g, '_').replace(/'/g, '')) + '.png';
}

/** A file's item name: its base name, underscores read as spaces. */
function itemNameOf(file: string): string {
    return path.basename(file, path.extname(file)).replace(/_/g, ' ').trim();
}

/** Remove a black background: returns RGBA bytes with the item cut out. */
function cutOut(rgb: Buffer, w: number, h: number, channels: number): Buffer {
    const n = w * h;
    const lum = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        const o = i * channels;
        lum[i] = Math.max(rgb[o], rgb[o + 1], rgb[o + 2]);
    }

    // 1. Dark regions, labelled; background is those touching the edge, or big.
    const dark = new Uint8Array(n);
    for (let i = 0; i < n; i++) dark[i] = lum[i] <= THRESHOLD ? 1 : 0;
    const label = new Int32Array(n).fill(-1);
    const background = new Uint8Array(n);
    const stack = new Int32Array(n);
    const minHole = Math.max(64, Math.round(n * HOLE_SHARE));
    for (let start = 0; start < n; start++) {
        if (!dark[start] || label[start] !== -1) continue;
        let top = 0, size = 0, edge = false, sum = 0;
        const members: number[] = [];
        stack[top++] = start; label[start] = start;
        while (top) {
            const p = stack[--top];
            members.push(p); size++; sum += lum[p];
            const x = p % w, y = (p - x) / w;
            if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
            const near = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
            for (const q of near) {
                if (q >= 0 && dark[q] && label[q] === -1) { label[q] = start; stack[top++] = q; }
            }
        }
        // Joined to the edge: background. Closed in by the item: a hole only if it
        // is big and as flat black as the background, never the item's own shadow.
        if (edge || (size >= minHole && sum / size <= HOLE_MEAN)) for (const p of members) background[p] = 1;
    }

    // 2. Distance from the background, out to the soft band.
    const dist = new Uint8Array(n).fill(255);
    let frontier: number[] = [];
    for (let i = 0; i < n; i++) if (background[i]) { dist[i] = 0; frontier.push(i); }
    for (let d = 1; d <= SOFT_BAND && frontier.length; d++) {
        const next: number[] = [];
        for (const p of frontier) {
            const x = p % w, y = (p - x) / w;
            const near = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
            for (const q of near) if (q >= 0 && dist[q] === 255) { dist[q] = d; next.push(q); }
        }
        frontier = next;
    }

    // 3. Opacity, and color un-mixed from black at the soft edge.
    const out = Buffer.alloc(n * 4);
    for (let i = 0; i < n; i++) {
        const o = i * channels, t = i * 4;
        let a = 255;
        if (background[i]) a = 0;
        else if (dist[i] <= SOFT_BAND) a = Math.max(0, Math.min(255, Math.round(255 * (lum[i] - THRESHOLD) / (SOFT_TOP - THRESHOLD))));
        if (a > 0 && a < 255) {
            out[t] = Math.min(255, Math.round(rgb[o] * 255 / a));
            out[t + 1] = Math.min(255, Math.round(rgb[o + 1] * 255 / a));
            out[t + 2] = Math.min(255, Math.round(rgb[o + 2] * 255 / a));
        } else {
            out[t] = rgb[o]; out[t + 1] = rgb[o + 1]; out[t + 2] = rgb[o + 2];
        }
        out[t + 3] = a;
    }
    return out;
}

async function makeIcon(file: string): Promise<Buffer> {
    let img = sharp(file).rotate();
    const meta = await img.metadata();
    if ((meta.width ?? 0) > WORK_SIDE || (meta.height ?? 0) > WORK_SIDE) {
        img = img.resize(WORK_SIDE, WORK_SIDE, { fit: 'inside' });
    }
    let rgba: Buffer, w: number, h: number;
    const alreadyClear = meta.hasAlpha && (await sharp(file).stats()).channels[3]?.min < 250;
    if (alreadyClear) {
        const r = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        rgba = r.data; w = r.info.width; h = r.info.height;
    } else {
        const r = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
        w = r.info.width; h = r.info.height;
        rgba = cutOut(r.data, w, h, r.info.channels);
    }
    // 4. Trim to the item, scale to the frame, centre.
    const trimmed = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
        .png().toBuffer()
        .then(b => sharp(b).trim({ threshold: 1 }).toBuffer());
    const fitted = await sharp(trimmed)
        .resize(ITEM_SIDE, ITEM_SIDE, { fit: 'inside', kernel: 'lanczos3' })
        .toBuffer({ resolveWithObject: true });
    return sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: fitted.data, left: Math.floor((CANVAS - fitted.info.width) / 2), top: Math.floor((CANVAS - fitted.info.height) / 2) }])
        .png({ compressionLevel: 9 })
        .toBuffer();
}

/** Every result on three backgrounds, one row an icon, with its file name. */
async function contactSheet(rows: { name: string; png: Buffer }[], to: string): Promise<void> {
    const cell = 144, label = 260, bgs = [{ r: 236, g: 230, b: 216 }, { r: 24, g: 22, b: 20 }, { r: 74, g: 58, b: 42 }];
    const width = label + cell * bgs.length, height = cell * rows.length;
    const layers: sharp.OverlayOptions[] = [];
    rows.forEach((row, i) => {
        bgs.forEach((bg, j) => {
            layers.push({ input: { create: { width: cell, height: cell, channels: 4, background: { ...bg, alpha: 1 } } }, left: label + j * cell, top: i * cell });
            layers.push({ input: row.png, left: label + j * cell + (cell - CANVAS) / 2, top: i * cell + (cell - CANVAS) / 2 });
        });
        const safe = row.name.replace(/[&<>"]/g, '');
        layers.push({ input: Buffer.from(`<svg width="${label}" height="${cell}"><text x="12" y="${cell / 2 + 6}" font-family="sans-serif" font-size="17" fill="#222">${safe}</text></svg>`), left: 0, top: i * cell });
    });
    await sharp({ create: { width, height: Math.max(height, 1), channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
        .composite(layers).png().toFile(to);
}

async function main(): Promise<void> {
    if (!fs.existsSync(IN_DIR)) {
        fs.mkdirSync(IN_DIR, { recursive: true });
        console.log(`Made ${path.relative(REPO, IN_DIR)}. Put the images there, each named for its item, and run this again.`);
        return;
    }
    const files = fs.readdirSync(IN_DIR)
        .filter(f => /\.(png|jpe?g|webp)$/i.test(f) && !f.startsWith('_'))
        .map(f => path.join(IN_DIR, f));
    if (!files.length) { console.log(`Nothing in ${path.relative(REPO, IN_DIR)}.`); return; }
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const sheet: { name: string; png: Buffer }[] = [];
    let made = 0, skipped = 0;
    for (const file of files) {
        const name = itemNameOf(file);
        const target = path.join(OUT_DIR, iconFileFor(name));
        if (fs.existsSync(target) && !FORCE) {
            console.log(`  skip  ${name}: ${path.basename(target)} exists (--force to replace)`);
            skipped++;
            continue;
        }
        try {
            const png = await makeIcon(file);
            fs.writeFileSync(target, png);
            sheet.push({ name: path.basename(target), png });
            console.log(`  made  ${name} -> ${path.relative(REPO, target)}`);
            made++;
        } catch (err) {
            console.log(`  FAIL  ${name}: ${(err as Error).message}`);
        }
    }
    if (sheet.length) {
        const to = path.join(IN_DIR, '_contact-sheet.png');
        await contactSheet(sheet, to);
        console.log(`\n${made} made, ${skipped} skipped. Check them: ${path.relative(REPO, to)}`);
    } else {
        console.log(`\n${made} made, ${skipped} skipped.`);
    }
}

if (require.main === module) {
    main().catch(err => { console.error(err); process.exit(1); });
}

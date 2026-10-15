// The shape in a museum case nobody has filled for you (Nathan, 2026-10-15).
//
// A case you have not given shows no name, only the item's outline. It used to
// be drawn in the browser by darkening the real icon, which meant the page was
// handed the real picture at /images/items/<Item_Name>.png: open it in a new
// tab and the filename said what it was, and turning the filter off showed the
// art. Now the server cuts the outline itself and serves it from an address
// that names only the case (/api/museum-silhouette/<caseId>.png), and the
// museum's state sends no name or item id for such a case (services/museum.ts).
//
// The outline keeps only the art's transparency: every pixel black, at
// SILHOUETTE_ALPHA of its own opacity, so nothing of the drawing survives.

import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import db from '../db'
import { logger } from '../lib/logger'

/** The client app, whose public/images/items holds the art (apps/client). */
const CLIENT_DIR = process.env.CLIENT_DIR || path.resolve(__dirname, '../../../client')
const ITEM_IMAGE_DIR = path.join(CLIENT_DIR, 'public/images/items')
/** Art whose filename does not follow from the item's name; the client reads the same file (lib/items.ts). */
const OVERRIDES_FILE = path.join(CLIENT_DIR, 'src/lib/iconOverrides.json')

const SIZE = 128
const SILHOUETTE_ALPHA = 0.6

export const SILHOUETTE_URL_PREFIX = '/api/museum-silhouette/'
export const silhouetteUrl = (caseId: number) => `${SILHOUETTE_URL_PREFIX}${caseId}.png`

let overrides: Record<string, string> | null = null

async function iconFile(itemName: string): Promise<string> {
    if (!overrides) {
        overrides = await fs.readFile(OVERRIDES_FILE, 'utf8')
            .then(text => JSON.parse(text) as Record<string, string>)
            .catch(() => ({}))
    }
    const base = overrides[itemName] ?? itemName.replace(/ /g, '_').replace(/'/g, '')
    return path.join(ITEM_IMAGE_DIR, `${base}.png`)
}

/** Cut outlines, by file and its modified time, so new art is picked up without a restart. */
const cache = new Map<string, Buffer>()

/** The outline for one case, or null when there is no such case or no art for it yet. */
export async function caseSilhouette(caseId: number): Promise<Buffer | null> {
    if (!Number.isInteger(caseId) || caseId <= 0) return null
    try {
        const row = await db('museum_cases as c').join('items as i', 'i.id', 'c.item_id')
            .where('c.id', caseId).where('i.is_active', true).select('i.name').first()
        if (!row) return null
        const file = await iconFile(row.name)
        const stat = await fs.stat(file).catch(() => null)
        if (!stat) return null
        const key = `${file}:${stat.mtimeMs}`
        const hit = cache.get(key)
        if (hit) return hit

        const { data, info } = await sharp(file)
            .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true })
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 0
            data[i + 1] = 0
            data[i + 2] = 0
            data[i + 3] = Math.round(data[i + 3] * SILHOUETTE_ALPHA)
        }
        const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
            .png({ compressionLevel: 9 })
            .toBuffer()
        cache.set(key, png)
        return png
    } catch (err) {
        logger.error(`caseSilhouette (case ${caseId}): ${err}`)
        return null
    }
}

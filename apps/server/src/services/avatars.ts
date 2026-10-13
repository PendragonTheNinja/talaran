// Player avatars: the picture beside a forum post, on a profile and on your
// side of a fight (players.avatar_url).
//
// The browser sends the ORIGINAL file and the square the player chose on it;
// the cut, the resize and the encoding all happen here. So every avatar is
// re-encoded by the server whatever arrived (no metadata such as a phone's GPS
// position survives, and nothing a browser could be tricked into running is
// stored), and an animated GIF stays animated, which a crop done in a canvas
// would lose.
//
// Files live on disk under AVATAR_DIR, outside git, named by player and
// content hash so a new upload is a new URL and the old one can be cached for
// ever. They are served from /api/avatars (index.ts mounts the directory ahead
// of the API's no-store header and rate limit), and the stored URL is that
// path; the client prefixes the API host (lib/assets.ts avatarSrc).

import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import sharp from 'sharp'
import db from '../db'
import { logger } from '../lib/logger'
import { afterCommit } from '../lib/afterCommit'
import { SERVER_ERROR } from '../lib/serviceResult'

/** Where avatar files are written. Outside git, so a pull never touches them; include it in backups. */
export const AVATAR_DIR = process.env.AVATAR_DIR || path.resolve(__dirname, '../../uploads/avatars')
/** The public path they are served at. */
export const AVATAR_URL_PREFIX = '/api/avatars/'

/** What the player may send, before processing. */
export const AVATAR_MAX_UPLOAD_BYTES = 4 * 1024 * 1024
/** The stored square, in pixels. */
export const AVATAR_SIZE = 256
/** The smallest square a player may pick from the original. */
const MIN_CROP = 32
/** An animation longer than this is refused rather than stored at any size. */
const MAX_FRAMES = 300
/** What the stored file may weigh after encoding (an animation can be large). */
const MAX_STORED_BYTES = 2 * 1024 * 1024
const FORMATS = new Set(['jpeg', 'png', 'webp', 'gif'])

export interface Crop { x: number; y: number; size: number }

type Result = { ok: true; avatarUrl: string } | { ok: false; error: string }

const fileOf = (url: string | null | undefined): string | null =>
    url && url.startsWith(AVATAR_URL_PREFIX) ? path.join(AVATAR_DIR, path.basename(url)) : null

async function removeFile(url: string | null | undefined): Promise<void> {
    const file = fileOf(url)
    if (!file) return
    try { await fs.unlink(file) } catch { /* already gone */ }
}

/** Whole numbers only: the crop comes from the client. */
function cleanCrop(raw: Record<string, unknown>): Crop | null {
    const n = (v: unknown) => Math.floor(Number(v))
    const crop = { x: n(raw.x), y: n(raw.y), size: n(raw.size) }
    return Object.values(crop).every(Number.isFinite) && crop.x >= 0 && crop.y >= 0 && crop.size >= MIN_CROP ? crop : null
}

/**
 * Cut the chosen square out of the original, every frame of it, and store it
 * as WebP at AVATAR_SIZE. Refuses anything that is not a still or animated
 * JPEG, PNG, WebP or GIF, a crop that leaves the picture, and an animation
 * too long or too heavy once encoded.
 */
export async function processAvatar(buf: Buffer, rawCrop: Record<string, unknown>): Promise<{ ok: true; data: Buffer } | { ok: false; error: string }> {
    const crop = cleanCrop(rawCrop)
    if (!crop) return { ok: false, error: 'Choose a part of the picture to use.' }
    let meta: sharp.Metadata
    try {
        // limitInputPixels guards against a tiny file that decodes to a huge one.
        meta = await sharp(buf, { animated: true, limitInputPixels: 40_000_000 }).metadata()
    } catch {
        return { ok: false, error: 'That file is not a picture we can read.' }
    }
    if (!meta.format || !FORMATS.has(meta.format)) return { ok: false, error: 'Use a PNG, JPEG, WebP or GIF.' }
    const pages = meta.pages ?? 1
    if (pages > MAX_FRAMES) return { ok: false, error: `That animation is too long (${MAX_FRAMES} frames at most).` }
    const width = meta.width ?? 0
    // An animation's height is every frame stacked; one frame is pageHeight.
    const height = meta.pageHeight ?? meta.height ?? 0
    if (crop.x + crop.size > width || crop.y + crop.size > height) return { ok: false, error: 'Choose a part of the picture to use.' }

    try {
        const data = await sharp(buf, { animated: pages > 1, limitInputPixels: 40_000_000 })
            .extract({ left: crop.x, top: crop.y, width: crop.size, height: crop.size })
            .resize(AVATAR_SIZE, AVATAR_SIZE)
            .webp({ quality: 82, effort: 4 })
            .toBuffer()
        if (data.length > MAX_STORED_BYTES) return { ok: false, error: 'That animation is too heavy. Try a shorter one.' }
        return { ok: true, data }
    } catch (err) {
        logger.error(`processAvatar: ${err}`)
        return { ok: false, error: 'That picture could not be used. Try another.' }
    }
}

/**
 * Set a player's avatar from an upload. The file is written first, under a
 * new name; the row is changed under a lock, and the old file removed after
 * the commit, so two uploads at once each leave a consistent row and no
 * stray file but the loser's (removed too).
 */
export async function setAvatar(playerId: number, buf: Buffer, rawCrop: Record<string, unknown>): Promise<Result> {
    try {
        const player = await db('players').where({ id: playerId }).select('is_guest', 'avatar_blocked').first()
        if (!player) return { ok: false, error: 'Player not found.' }
        if (player.is_guest) return { ok: false, error: 'Claim your character to choose a picture.' }
        if (player.avatar_blocked) return { ok: false, error: 'You cannot change your picture. Message the staff if you think this is wrong.' }

        const processed = await processAvatar(buf, rawCrop)
        if (!processed.ok) return processed

        const name = `${playerId}-${crypto.createHash('sha256').update(processed.data).digest('hex').slice(0, 16)}.webp`
        await fs.mkdir(AVATAR_DIR, { recursive: true })
        await fs.writeFile(path.join(AVATAR_DIR, name), processed.data)
        const avatarUrl = AVATAR_URL_PREFIX + name

        return await db.transaction(async (trx) => {
            const row = await trx('players').where({ id: playerId }).forNoKeyUpdate().select('avatar_url', 'avatar_blocked').first()
            // Blocked between the check above and here: keep nothing.
            if (row.avatar_blocked) {
                afterCommit(trx, () => removeFile(avatarUrl))
                return { ok: false as const, error: 'You cannot change your picture. Message the staff if you think this is wrong.' }
            }
            await trx('players').where({ id: playerId }).update({ avatar_url: avatarUrl })
            if (row.avatar_url !== avatarUrl) afterCommit(trx, () => removeFile(row.avatar_url))
            return { ok: true as const, avatarUrl }
        })
    } catch (err) {
        logger.error(`setAvatar error (player ${playerId}): ${err}`)
        return { ok: false, error: SERVER_ERROR }
    }
}

/**
 * Remove a player's avatar: their own choice, or a moderator's (who may also
 * stop them setting another, `block`). The file goes after the commit.
 */
export async function clearAvatar(playerId: number, opts: { block?: boolean } = {}): Promise<{ ok: true; had: boolean } | { ok: false; error: string }> {
    try {
        return await db.transaction(async (trx) => {
            const row = await trx('players').where({ id: playerId }).forNoKeyUpdate().select('avatar_url').first()
            if (!row) return { ok: false as const, error: 'Player not found.' }
            await trx('players').where({ id: playerId }).update({
                avatar_url: null,
                ...(opts.block !== undefined ? { avatar_blocked: opts.block } : {}),
            })
            afterCommit(trx, () => removeFile(row.avatar_url))
            return { ok: true as const, had: !!row.avatar_url }
        })
    } catch (err) {
        logger.error(`clearAvatar error (player ${playerId}): ${err}`)
        return { ok: false, error: SERVER_ERROR }
    }
}

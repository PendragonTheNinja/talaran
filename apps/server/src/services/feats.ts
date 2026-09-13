import db from '../db'
import { logger } from '../lib/logger'
import { levelFromXp } from './xp'

// ── Feats ─────────────────────────────────────────────────────────
//
// Evaluated from data the game already keeps: player_stats counters and
// player_skills XP. Nothing here needs its own tracking, which is the reason
// forty feats cost one table and no new writes on the hot path.
//
// WHEN THIS RUNS. Not on every action. An action completes hundreds of times an
// hour and a feat can only be crossed once, so evaluation happens when the
// player opens the panel and after a level up. Both are moments the player is
// already waiting on a response, and a feat arriving a few seconds after the
// level rather than the same instant costs nothing.

export interface FeatRow {
    slug: string
    name: string
    description: string
    title: string | null
    /** The fallback character, drawn when no image exists for the key yet. */
    badge: string | null
    /** Stable name, and the image filename. Null on most feats. */
    badgeKey: string | null
    category: string
    isHidden: boolean
    earnedAt: string | null
    /** Where they are now, against what the feat wants. Null when hidden and unearned. */
    progress: number | null
    target: number
}

/**
 * Everything needed to judge a player, in two queries.
 *
 * Deliberately loaded once and passed around rather than queried per feat:
 * forty feats would otherwise be forty round trips to answer a question the
 * database can answer twice.
 */
async function snapshot(playerId: number) {
    const stats = await db('player_stats').where({ player_id: playerId }).first()

    const skillRows = await db('player_skills as ps')
        .join('skills as s', 's.id', 'ps.skill_id')
        .where('ps.player_id', playerId)
        .select('s.name as name', 'ps.xp as xp')

    const levels = new Map<string, number>()
    let totalLevel = 0
    for (const row of skillRows as any[]) {
        const level = levelFromXp(Number(row.xp) || 0)
        levels.set(row.name, level)
        totalLevel += level
    }

    return { stats, levels, totalLevel }
}

/** How far along a player is, in the feat's own units. */
function measure(feat: any, snap: Awaited<ReturnType<typeof snapshot>>): number {
    switch (feat.criterion_kind) {
        case 'stat': {
            const raw = snap.stats?.[feat.criterion_target]
            return Number(raw ?? 0)
        }
        case 'skill':
            return snap.levels.get(feat.criterion_target) ?? 0
        case 'total_level':
            return snap.totalLevel
        case 'breadth': {
            // criterion_target holds the level each skill must reach, and
            // criterion_value how many skills must reach it.
            const bar = Number(feat.criterion_target) || 1
            let count = 0
            for (const level of snap.levels.values()) if (level >= bar) count++
            return count
        }
        default:
            return 0
    }
}

/**
 * Award anything newly earned, and return it.
 *
 * Safe to call as often as you like: the unique index on (player_id, feat_id)
 * means a double call inserts nothing the second time, so no lock is needed and
 * two requests racing cannot produce a duplicate.
 */
export async function evaluateFeats(playerId: number): Promise<{ slug: string; name: string; title: string | null }[]> {
    try {
        const snap = await snapshot(playerId)
        const all = await db('feats').where({ is_active: true })
        const earned = new Set(
            (await db('player_feats').where({ player_id: playerId }).select('feat_id'))
                .map((r: any) => r.feat_id),
        )

        const fresh: { slug: string; name: string; title: string | null }[] = []
        for (const feat of all as any[]) {
            if (earned.has(feat.id)) continue
            if (measure(feat, snap) < Number(feat.criterion_value)) continue

            const inserted = await db('player_feats')
                .insert({ player_id: playerId, feat_id: feat.id })
                .onConflict(['player_id', 'feat_id'])
                .ignore()
                .returning('id')

            // onConflict.ignore returns nothing when the row already existed,
            // which is how a race resolves without either side reporting a feat
            // twice.
            if (inserted.length > 0) {
                fresh.push({ slug: feat.slug, name: feat.name, title: feat.title })
            }
        }
        return fresh
    } catch (err) {
        // A feat is a garnish. If this throws, the action that triggered it
        // should still succeed, so the failure is logged and swallowed.
        logger.error(`evaluateFeats error for player ${playerId}: ${err}`)
        return []
    }
}

/**
 * The panel: everything visible, with progress.
 *
 * Hidden feats are omitted entirely until earned, and then shown with the rest.
 * Showing them greyed with their name intact would defeat the point of hiding
 * them, and showing a locked row with the name blanked just invites guessing.
 */
export async function listFeats(playerId: number): Promise<{
    feats: FeatRow[]
    earnedCount: number
    totalCount: number
    titles: string[]
    /** Earned badges, key and glyph together so the client can try art first. */
    badges: { key: string; glyph: string | null }[]
    wornTitle: string | null
    wornBadge: string | null
}> {
    await evaluateFeats(playerId)

    const snap = await snapshot(playerId)
    const all = await db('feats').where({ is_active: true }).orderBy('display_order')
    const mine = new Map<number, string>(
        (await db('player_feats').where({ player_id: playerId }).select('feat_id', 'earned_at'))
            .map((r: any) => [r.feat_id, r.earned_at]),
    )

    const feats: FeatRow[] = []
    for (const feat of all as any[]) {
        const earnedAt = mine.get(feat.id) ?? null
        if (feat.is_hidden && !earnedAt) continue

        feats.push({
            slug: feat.slug,
            name: feat.name,
            description: feat.description,
            title: feat.title,
            badge: feat.badge ?? null,
            badgeKey: feat.badge_key ?? null,
            category: feat.category,
            isHidden: !!feat.is_hidden,
            earnedAt: earnedAt ? new Date(earnedAt).toISOString() : null,
            progress: Math.min(measure(feat, snap), Number(feat.criterion_value)),
            target: Number(feat.criterion_value),
        })
    }

    const player = await db('players').where({ id: playerId }).first()
    const titles = feats.filter(f => f.earnedAt && f.title).map(f => f.title as string)
    const badges = feats
        .filter(f => f.earnedAt && f.badgeKey)
        .map(f => ({ key: f.badgeKey as string, glyph: f.badge }))

    return {
        feats,
        // Counts the visible list, so an unearned hidden feat cannot be deduced
        // from the denominator moving.
        earnedCount: feats.filter(f => f.earnedAt).length,
        totalCount: feats.length,
        titles,
        badges,
        wornTitle: player?.worn_title ?? null,
        wornBadge: player?.worn_badge ?? null,
    }
}

/**
 * The glyph for a worn badge key, for the surfaces that draw a name.
 *
 * Chat and the location list need the fallback character alongside the key.
 * Kept here so the mapping lives with the badges rather than being repeated in
 * every route that shows a player's name.
 */
export async function badgeGlyph(key: string | null): Promise<string | null> {
    if (!key) return null
    const feat = await db('feats').where({ badge_key: key }).first()
    return feat?.badge ?? null
}

/**
 * Wear a badge you have earned, or none.
 *
 * Same shape as wearTitle and for the same reason: checked against what the
 * player actually holds, or the column is a free text field anyone can set to
 * the mastery symbol they never earned.
 */
export async function wearBadge(playerId: number, badge: string | null): Promise<{ ok: boolean; error?: string }> {
    try {
        if (badge === null) {
            await db('players').where({ id: playerId }).update({ worn_badge: null })
            return { ok: true }
        }

        const owns = await db('player_feats as pf')
            .join('feats as f', 'f.id', 'pf.feat_id')
            .where('pf.player_id', playerId)
            // Matched on the key: the glyph is presentation and changes with the
            // art, the key is what the player owns.
            .where('f.badge_key', badge)
            .first()
        if (!owns) return { ok: false, error: 'You have not earned that badge.' }

        await db('players').where({ id: playerId }).update({ worn_badge: badge })
        return { ok: true }
    } catch (err) {
        logger.error(`wearBadge error: ${err}`)
        return { ok: false, error: 'Server error' }
    }
}

/** Wear a title you have earned, or none at all. */
export async function wearTitle(playerId: number, title: string | null): Promise<{ ok: boolean; error?: string }> {
    try {
        if (title === null) {
            await db('players').where({ id: playerId }).update({ worn_title: null })
            return { ok: true }
        }

        // Checked against what they have actually earned rather than trusted
        // from the client, or a title is just a text field anyone can set.
        const owns = await db('player_feats as pf')
            .join('feats as f', 'f.id', 'pf.feat_id')
            .where('pf.player_id', playerId)
            .where('f.title', title)
            .first()
        if (!owns) return { ok: false, error: 'You have not earned that title.' }

        await db('players').where({ id: playerId }).update({ worn_title: title })
        return { ok: true }
    } catch (err) {
        logger.error(`wearTitle error: ${err}`)
        return { ok: false, error: 'Server error' }
    }
}

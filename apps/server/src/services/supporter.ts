import db from '../db'
import { logger } from '../lib/logger'
import { pushToPlayer } from '../lib/realtime'

// Supporter badges (docs/taler-perks-ideas.md; Nathan, 2026-11-27): given, never
// sold, by what a player has given in all: $5, $20, $50, $100, $1,000. They are
// feat rows of category 'Supporter' (criterion_kind 'supporter', the threshold in
// US cents as criterion_value), so every surface that shows a worn badge (chat,
// Players Here, the forum, profiles) shows them unchanged; the Feats list leaves
// them out, since they are thanks, not achievements. Granted and taken back here
// only, never by evaluateFeats: a refund or chargeback that drops a player below
// a step takes its badge away, and the badge comes off if it was worn.

export const SUPPORTER_CATEGORY = 'Supporter'

/**
 * What a player has given in all, in US cents: each purchase's dollars, scaled
 * by the share of its Talers still standing after refunds and chargebacks
 * (taler_adjustments.talers is signed; reversals restore it).
 */
export async function supportCents(playerId: number): Promise<number> {
    const { rows } = await db.raw(`
        SELECT coalesce(sum(p.usd_cents * greatest(0, p.talers + coalesce(a.moved, 0))::numeric / nullif(p.talers, 0)), 0) AS cents
        FROM taler_purchases p
        LEFT JOIN (SELECT purchase_id, sum(talers) AS moved FROM taler_adjustments GROUP BY purchase_id) a ON a.purchase_id = p.id
        WHERE p.player_id = ?`, [playerId])
    return Math.floor(Number(rows[0]?.cents ?? 0))
}

/**
 * Bring a player's supporter badges into line with what they have given:
 * grant every step reached, take back any no longer reached. Idempotent, so it
 * is safe after every purchase, every adjustment, and on opening the Feats
 * panel (which also gives the badges to those who gave before they existed).
 * Returns the badges newly given.
 */
export async function syncSupporter(playerId: number, announce = true): Promise<{ name: string; badge: string | null }[]> {
    try {
        const steps = await db('feats').where({ category: SUPPORTER_CATEGORY, criterion_kind: 'supporter', is_active: true })
            .orderBy('criterion_value').select('id', 'name', 'badge', 'badge_key', 'criterion_value')
        if (!steps.length) return []
        const cents = await supportCents(playerId)
        const fresh: { name: string; badge: string | null }[] = []
        for (const step of steps) {
            if (cents >= Number(step.criterion_value)) {
                const inserted = await db('player_feats').insert({ player_id: playerId, feat_id: step.id })
                    .onConflict(['player_id', 'feat_id']).ignore().returning('id')
                if (inserted.length) fresh.push({ name: step.name, badge: step.badge ?? null })
            } else {
                const removed = await db('player_feats').where({ player_id: playerId, feat_id: step.id }).delete()
                if (removed && step.badge_key) {
                    await db('players').where({ id: playerId, worn_badge: step.badge_key }).update({ worn_badge: null })
                }
            }
        }
        if (announce) {
            for (const f of fresh) pushToPlayer(playerId, 'supporter_badge', { name: f.name, badge: f.badge })
        }
        return fresh
    } catch (err) {
        logger.error(`[supporter] sync for player ${playerId} failed: ${err}`)
        return []
    }
}

/** How many names the museums' Patrons plaque holds (Nathan, 2026-11-27). */
export const PATRONS_SHOWN = 10

/**
 * The Patrons plaque: those who have given most, in order, by name and place
 * only, never by how much. Anyone may leave themselves off it
 * (player_settings.hide_from_patrons, Settings > Profile).
 */
export async function topPatrons(limit = PATRONS_SHOWN): Promise<{ rank: number; name: string }[]> {
    const { rows } = await db.raw(`
        SELECT pl.username AS name,
               sum(p.usd_cents * greatest(0, p.talers + coalesce(a.moved, 0))::numeric / nullif(p.talers, 0)) AS cents,
               min(p.created_at) AS first_at
        FROM taler_purchases p
        JOIN players pl ON pl.id = p.player_id
        LEFT JOIN player_settings s ON s.player_id = p.player_id
        LEFT JOIN (SELECT purchase_id, sum(talers) AS moved FROM taler_adjustments GROUP BY purchase_id) a ON a.purchase_id = p.id
        WHERE coalesce(s.hide_from_patrons, false) = false
        GROUP BY pl.id, pl.username
        HAVING sum(p.usd_cents * greatest(0, p.talers + coalesce(a.moved, 0))::numeric / nullif(p.talers, 0)) > 0
        ORDER BY cents DESC, first_at ASC
        LIMIT ?`, [limit])
    return rows.map((r: any, i: number) => ({ rank: i + 1, name: r.name }))
}

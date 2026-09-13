import db from '../db'
import { logger } from '../lib/logger'

// ── Records ───────────────────────────────────────────────────────
//
// The game has been keeping item_firsts since July: who first pulled each item
// out of the world, and from what. Nothing ever read it. This is the part that
// tells people.
//
// TWO KINDS. A world first on a NOTABLE item, and the first player to reach a
// milestone level in a skill. Both are permanent, both happen once ever, and
// both go to the server channel, which persists in chat_messages and therefore
// survives a refresh. A player who was asleep can scroll back and see it.
//
// WHAT IS NOT ANNOUNCED. Anything you can walk to a place and gather on purpose.
// The first poor lanai log is not a story, it is Tuesday, and on a fresh server
// one player would fill the channel with a hundred of them in an hour. Only
// secondary drops qualify: the things that turn up rather than the things you
// went out for.

/** Levels worth telling the world about. */
export const MILESTONE_LEVELS = [25, 50, 75, 100]

/**
 * Put a line in the server channel.
 *
 * Persisted first, emitted second. If the insert fails the announcement is
 * dropped rather than shown to whoever happens to be online and lost forever,
 * which would make the scrollback lie.
 *
 * No banner. The admin announcement raises one because an admin has something
 * to say; a world first is a thing that happened, and interrupting everyone
 * mid-action for it would wear thin by the second week.
 */
async function announce(playerId: number, message: string): Promise<void> {
    try {
        const now = new Date()
        await db('chat_messages').insert({
            player_id: playerId,
            channel: 'server',
            message,
            player_name: '[SERVER]',
            guild_tag: null,
            region: null,
            guild_id: null,
            sent_at: now,
        })

        const { io } = await import('../index')
        io.emit('chat_world', {
            id: Date.now(),
            channel: 'server',
            playerName: '[SERVER]',
            guildTag: null,
            message,
            timestamp: now.toTimeString().slice(0, 5),
            isAnnouncement: true,
        })
    } catch (err) {
        // Never let a announcement break the action that earned it.
        logger.error(`announce failed: ${err}`)
    }
}

/**
 * A world first on a secondary drop.
 *
 * Called with drops only, never with the main output of a gathering action.
 * The caller is the one that knows the difference, so the rule lives at the
 * call site rather than in a list of item names here that would go stale the
 * first time a new drop is added.
 */
export async function announceWorldFirstDrop(
    playerId: number,
    itemName: string,
): Promise<void> {
    try {
        const player = await db('players').where({ id: playerId }).first()
        if (!player) return
        await announce(playerId, `${player.username} is the first in Talaran to find ${aOrAn(itemName)}.`)
    } catch (err) {
        logger.error(`announceWorldFirstDrop failed: ${err}`)
    }
}

/** "a Wild Hive", "an Amber Bead". Small thing, but it reads wrong otherwise. */
function aOrAn(name: string): string {
    return /^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`
}

/**
 * The first player to reach a milestone level in a skill.
 *
 * Claimed once per (skill, level) for the whole server, by unique index rather
 * than by checking first, so two players levelling in the same tick cannot both
 * be told they were first.
 */
export async function claimSkillMilestone(
    playerId: number,
    skillName: string,
    level: number,
): Promise<void> {
    if (!MILESTONE_LEVELS.includes(level)) return

    try {
        const inserted = await db('skill_milestone_firsts')
            .insert({ skill_name: skillName, level, player_id: playerId })
            .onConflict(['skill_name', 'level'])
            .ignore()
            .returning('id')

        // Nothing back means somebody already holds it.
        if (!Array.isArray(inserted) || inserted.length === 0) return

        const player = await db('players').where({ id: playerId }).first()
        if (!player) return

        await announce(
            playerId,
            level >= 100
                ? `${player.username} is the first in Talaran to master ${skillName}.`
                : `${player.username} is the first in Talaran to reach ${skillName} ${level}.`,
        )
    } catch (err) {
        logger.error(`claimSkillMilestone failed: ${err}`)
    }
}

/** The hall of records, for a page that wants to show them all. */
export async function listRecords(): Promise<{
    milestones: { skill: string; level: number; player: string; at: string }[]
    items: { item: string; player: string; source: string | null; at: string }[]
}> {
    const milestones = await db('skill_milestone_firsts as m')
        .join('players as p', 'p.id', 'm.player_id')
        .orderBy([{ column: 'm.skill_name' }, { column: 'm.level' }])
        .select('m.skill_name as skill', 'm.level as level', 'p.username as player', 'm.achieved_at as at')

    const items = await db('item_firsts as f')
        .join('players as p', 'p.id', 'f.player_id')
        .join('items as i', 'i.id', 'f.item_id')
        .orderBy('f.created_at', 'desc')
        .limit(200)
        .select('i.name as item', 'p.username as player', 'f.source as source', 'f.created_at as at')

    return {
        milestones: milestones.map((m: any) => ({ ...m, at: new Date(m.at).toISOString() })),
        items: items.map((i: any) => ({ ...i, at: new Date(i.at).toISOString() })),
    }
}

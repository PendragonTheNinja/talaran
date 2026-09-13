import type { Knex } from 'knex';

/**
 * Badges.
 *
 * A title is a phrase and belongs where there is room for one: a profile, a
 * panel heading. Chat is not that place. A line reading
 * "[Pendragon, Master of the Anvil]: anyone selling planks" pushes the message
 * itself off the end, and forty players wearing one would make the channel
 * unreadable.
 *
 * So a badge: one character, worn beside the name exactly where guild_tag
 * already sits, which is the proof that a small marker there does not crowd
 * anything.
 *
 * NOT EVERY TITLE GRANTS ONE. A badge only means something if it is rare, and
 * if every feat handed one out then everybody wears a symbol and it becomes
 * furniture. Only the eleven masteries and the three breadth feats carry one:
 * the things that took a very long time.
 *
 * Symbols are single characters rather than images because they have to render
 * inline in a chat line at body size. If you would rather have art later, the
 * column holds whatever you put in it and the client draws it as text, so the
 * change is a renderer swap and not a schema one.
 */

const BADGES: Record<string, string> = {
    // The eleven masteries. One per trade, so a badge says which summit.
    'master-woodcutter': '❦',
    'master-miner': '◈',
    'master-fisher': '✧',
    'master-forager': '☘',
    'master-hunter': '✢',
    'master-farmer': '✤',
    'master-stockman': '✥',
    'master-smith': '⚒',
    'master-wright': '✜',
    'master-crafter': '❖',
    'master-cook': '✦',

    // Breadth. Rarer than any single mastery, and marked as such.
    'jack-of-the-parish': '⚑',
    'every-trade-in-talaran': '✣',
    'total-1000': '⚜',
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('feats', 'badge'))) {
        await knex.schema.alterTable('feats', (t) => {
            // One character, or null for the great majority of feats.
            t.string('badge', 8).nullable();
        });
    }

    if (!(await knex.schema.hasColumn('players', 'worn_badge'))) {
        await knex.schema.alterTable('players', (t) => {
            t.string('worn_badge', 8).nullable();
        });
    }

    for (const [slug, badge] of Object.entries(BADGES)) {
        await knex('feats').where({ slug }).update({ badge });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('players', 'worn_badge')) {
        await knex.schema.alterTable('players', (t) => t.dropColumn('worn_badge'));
    }
    if (await knex.schema.hasColumn('feats', 'badge')) {
        await knex.schema.alterTable('feats', (t) => t.dropColumn('badge'));
    }
}

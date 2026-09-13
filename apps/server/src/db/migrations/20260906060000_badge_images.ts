import type { Knex } from 'knex';

/**
 * Badges become images, with the glyph as the fallback.
 *
 * The first pass stored the glyph itself in players.worn_badge, which works
 * only as long as a badge IS a character. An image needs a stable filename, and
 * "⚒.png" is not one.
 *
 * So the glyph stops being the identity and becomes the fallback:
 *
 *   feats.badge_key    stable name, and the image filename
 *   feats.badge        the character to draw when no image exists yet
 *   players.worn_badge now holds the KEY, not the character
 *
 * The client tries /images/badges/{key}.png and falls back to the glyph when it
 * is missing, so art can arrive one badge at a time with nothing to coordinate.
 * Drop in master-smith.png and that badge is a picture; the rest keep their
 * characters until their turn comes.
 *
 * badge_key is set from the slug rather than being the slug, because a slug is
 * an identifier for a feat and this is a filename. They happen to match today.
 * If a feat is ever renamed, the art should not have to be.
 */

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('feats', 'badge_key'))) {
        await knex.schema.alterTable('feats', (t) => {
            t.string('badge_key', 60).nullable();
        });
    }

    // Widened FIRST. The column was sized for one character, so writing a key
    // into it before this throws "value too long for type character varying(8)"
    // and the whole migration rolls back.
    await knex.schema.alterTable('players', (t) => {
        t.string('worn_badge', 60).nullable().alter();
    });

    // Every badge-bearing feat gets a key matching its slug.
    const bearers = await knex('feats').whereNotNull('badge').select('id', 'slug', 'badge');
    for (const feat of bearers as any[]) {
        await knex('feats').where({ id: feat.id }).update({ badge_key: feat.slug });
    }

    // Anyone already wearing a glyph is moved onto the key for the same badge,
    // so nobody has to go and re-pick what they were already wearing.
    for (const feat of bearers as any[]) {
        await knex('players').where({ worn_badge: feat.badge }).update({ worn_badge: feat.slug });
    }
}

export async function down(knex: Knex): Promise<void> {
    // Put the glyphs back on any player wearing a key.
    const bearers = await knex('feats').whereNotNull('badge_key').select('badge_key', 'badge');
    for (const feat of bearers as any[]) {
        await knex('players').where({ worn_badge: feat.badge_key }).update({ worn_badge: feat.badge });
    }

    if (await knex.schema.hasColumn('feats', 'badge_key')) {
        await knex.schema.alterTable('feats', (t) => t.dropColumn('badge_key'));
    }
}

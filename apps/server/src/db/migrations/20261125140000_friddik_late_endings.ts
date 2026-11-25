import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// A late leg now ends a Friddik errand there (Nathan, 2026-11-25;
// services/errands.ts). The first legs of the two-leg errands said what would
// happen next ("Hold on. I'll write back."), so their late lines are rewritten
// to close: the birthday card misses Mother's birthday, and the ladder letter
// gets no reply. {late} is the lateness to the second.

const POOL = 'friddick';

const LATE_FIRST_LEG: Record<string, { late: string[]; very_late: string[] }> = {
    birthday_card: {
        late: ['{late} late. By the time it got round to Christopher, her birthday would be over.', 'I\'ll send her a letter instead. She\'ll say she likes letters better. She won\'t mean it.'],
        very_late: ['Her birthday\'s been and gone. She\'ll have had a card from everyone but us.', 'Again.'],
    },
    strong_words: {
        late: ['This is {late} late. He\'ll think I kept him waiting on purpose.', 'I\'m not writing back. He can wait a while himself.'],
        very_late: ['By the time this got to me, I\'d forgotten I ever had his ladder.', 'I\'m not answering a letter this old.'],
    },
};

const BEFORE: Record<string, { late: string[]; very_late: string[] }> = {
    birthday_card: {
        late: ['He\'ll say I held it up. I didn\'t. You did.', 'I\'ll sign it in bigger letters anyway.'],
        very_late: ['This is last year\'s card, isn\'t it.', 'I\'ll sign it again.'],
    },
    strong_words: {
        late: ['This took {late} longer than it should have. He\'ll think I kept him waiting on purpose.', 'Hold on. I\'ll write back.'],
        very_late: ['By the time this got to me, I\'d forgotten I ever had his ladder.', 'Now I remember. Hold on.'],
    },
};

async function setFirstLeg(knex: Knex, lines: Record<string, { late: string[]; very_late: string[] }>): Promise<void> {
    for (const [key, words] of Object.entries(lines)) {
        const row = await knex('errands').where({ key, pool: POOL }).first('id', 'legs');
        if (!row) throw new Error(`friddik_late_endings: no errand "${key}"`);
        const legs = typeof row.legs === 'string' ? JSON.parse(row.legs) : row.legs;
        legs[0] = { ...legs[0], late: words.late, very_late: words.very_late };
        await knex('errands').where({ id: row.id }).update({ legs: JSON.stringify(legs), updated_at: knex.fn.now() });
    }
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await setFirstLeg(knex, LATE_FIRST_LEG);
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await setFirstLeg(knex, BEFORE);
}

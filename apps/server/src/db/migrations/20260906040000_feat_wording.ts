import type { Knex } from 'knex';

/**
 * Feat wording and numbers.
 *
 * Mostly trimming. Several descriptions carried a second sentence doing nothing
 * the first had not already done, which reads as the game nudging you rather
 * than stating a fact. A feat should say what you did and stop.
 *
 * TWO REAL CORRECTIONS, not style:
 *
 * Off the Map asked for 10 locations and Taiar has 13, so it fired three stops
 * early and called it "every corner".
 *
 * The distance feats rest on total_distance_traveled, which was declared in
 * April and never written to by anything. They could not be earned at all.
 * gameTick now records it on arrival, in base travel SECONDS: the untravelled
 * time for a road, so a rider and a walker cover the same ground. The
 * thresholds here are set in those units rather than an invented mile.
 */

type Change = {
    slug: string;
    name?: string;
    description?: string;
    title?: string | null;
    criterion_value?: number;
};

const CHANGES: Change[] = [
    // Trimmed. The second sentence was commentary, not a fact.
    { slug: 'grain-and-figure', description: 'Chop five hundred excellent logs.' },
    { slug: 'the-nose-for-it', description: 'Discover fifty veins.' },
    { slug: 'patience-of-the-bank', description: 'Land three thousand fish.' },
    { slug: 'the-million', description: 'Earn ten million experience.', title: 'the Millionaire' },

    // "Take" is what a gamekeeper says and nobody else. A hunting feat should
    // read the way a player would describe it.
    { slug: 'the-first-snare', name: 'The First Snare', description: 'Bring down a hundred animals.' },
    { slug: 'quiet-feet', description: 'Bring down a thousand animals.' },

    // Taiar has thirteen places to stand, not ten.
    { slug: 'off-the-map', description: 'Set foot in all thirteen corners of Taiar Island.', criterion_value: 13 },

    // Measured in base travel seconds, the only distance the game actually
    // keeps. Roughly forty journeys and four hundred.
    { slug: 'the-long-road', description: 'Spend five thousand seconds on the road.', criterion_value: 5000 },
    { slug: 'shoe-leather', description: 'Spend fifty thousand seconds on the road. There were horses available.', criterion_value: 50000 },

    // Three feats reading "N All Told" in a row is a list, not a ladder.
    { slug: 'total-500', name: 'A Broad Hand', description: 'Reach total level 500.' },
    { slug: 'total-1000', name: 'The Whole Parish', description: 'Reach total level 1000.' },
];

export async function up(knex: Knex): Promise<void> {
    for (const change of CHANGES) {
        const { slug, ...fields } = change;
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fields)) {
            if (v !== undefined) patch[k] = v;
        }
        if (Object.keys(patch).length === 0) continue;
        await knex('feats').where({ slug }).update(patch);
    }
}

export async function down(knex: Knex): Promise<void> {
    const revert: Change[] = [
        { slug: 'grain-and-figure', description: 'Take five hundred excellent logs. Anyone can swing an axe; reading the tree is the trade.' },
        { slug: 'the-nose-for-it', description: 'Discover fifty veins. Some people walk past them all their lives.' },
        { slug: 'patience-of-the-bank', description: 'Land three thousand fish. The river does not hurry and neither do you.' },
        { slug: 'the-million', description: 'Earn a million experience. Sit down for a moment.', title: null },
        { slug: 'the-first-snare', description: 'Take a hundred animals.' },
        { slug: 'quiet-feet', description: 'Take a thousand animals.' },
        { slug: 'off-the-map', description: 'Set foot in every corner of Taiar Island.', criterion_value: 10 },
        { slug: 'the-long-road', description: 'Walk a thousand miles of it.', criterion_value: 1000 },
        { slug: 'shoe-leather', description: 'Walk ten thousand miles. There were horses available.', criterion_value: 10000 },
        { slug: 'total-500', name: 'Five Hundred All Told', description: 'Reach total level 500.' },
        { slug: 'total-1000', name: 'A Thousand All Told', description: 'Reach total level 1000.' },
    ];
    for (const change of revert) {
        const { slug, ...fields } = change;
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fields)) {
            if (v !== undefined) patch[k] = v;
        }
        await knex('feats').where({ slug }).update(patch);
    }
}

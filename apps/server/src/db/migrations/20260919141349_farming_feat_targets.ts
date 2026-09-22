import type { Knex } from 'knex';

/**
 * Two Farming feats asked for things the game cannot do.
 *
 * FIRST FURROW wanted a hundred plots tilled. A plot returns to `tilled` after
 * harvest rather than to `empty`, so a plot is tilled exactly once, when it is
 * built — and plotCapForLevel caps a farm at 20 plots, reached around Farming
 * 57. The lifetime maximum for that counter is therefore 20, and the feat was
 * not merely long, it was unreachable. Ten fields is a real goal: it needs
 * Farming 27 and the fence panels and granite for ten enclosures.
 *
 * HARVEST HOME wanted a thousand crops, and the counter it reads was
 * incremented once per HARVEST regardless of yield, so lifting a fifty-sheaf
 * field counted as one. services/farming.ts now adds the actual yield, which
 * makes the description literally true — and makes a thousand a fortnight's
 * farming rather than a year's, so the target moves to five thousand to stay a
 * goal worth a title.
 *
 * Existing counters are not backfilled. total_crops_harvested has been counting
 * harvests, and there is no record of what each one yielded, so the honest
 * thing is to let it keep climbing from where it is under the new meaning.
 * Nobody loses progress; a few players simply have a small head start.
 */

const CHANGES: Array<{
    slug: string;
    fromValue: number;
    toValue: number;
    fromDescription: string;
    toDescription: string;
}> = [
    {
        slug: 'first-furrow',
        fromValue: 100,
        toValue: 10,
        fromDescription: 'Till a hundred plots.',
        toDescription: 'Till ten fields.',
    },
    {
        slug: 'harvest-home',
        fromValue: 1000,
        toValue: 5000,
        fromDescription: 'Bring in a thousand crops.',
        toDescription: 'Bring in five thousand crops.',
    },
];

export async function up(knex: Knex): Promise<void> {
    for (const change of CHANGES) {
        const feat = await knex('feats').where({ slug: change.slug }).first();
        if (!feat) {
            throw new Error(
                `farming_feat_targets: no feat with slug "${change.slug}". `
                + 'The skill feats migration must run first.',
            );
        }
        await knex('feats').where({ id: feat.id }).update({
            criterion_value: change.toValue,
            description: change.toDescription,
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const change of CHANGES) {
        await knex('feats').where({ slug: change.slug }).update({
            criterion_value: change.fromValue,
            description: change.fromDescription,
        });
    }
}

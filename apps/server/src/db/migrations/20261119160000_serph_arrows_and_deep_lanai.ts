import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The main chain, part three (docs/antura-plan.md §4 and §5; Nathan, 2026-11-15
// and 17), shipped with the Serph Hatchet and Serph Arrows, never before them.
//
//   Deep Lanai Tree     required_tool_tier 2: its 60 s is the time with a Serph
//                       Hatchet; an Ambren one takes longer (calculateTimer).
//   Arrows              a hunt shoots the best arrow carried; one below the
//                       animal's tier takes 10 points off the catch chance for
//                       each tier it falls short, one above adds 3 (services/hunting.ts).
//   huntable_animals.weak_arrow_text      said on a miss with too weak an arrow.
//   huntable_animals.weak_arrow_warning   said in the hunting panel beforehand.
//                       The Ground Sloth's, as Nathan settled them.

const SLOTH = {
    weak_arrow_text: "The arrow skips off the sloth's matted hide. That old beast wants a harder point than Ambren.",
    weak_arrow_warning: 'Your Ambren arrows will barely mark a hide like that.',
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('huntable_animals', 'weak_arrow_text'))) {
        await knex.schema.alterTable('huntable_animals', (t) => {
            t.text('weak_arrow_text').nullable();
            t.text('weak_arrow_warning').nullable();
        });
    }
    if (!(await hasContent(knex))) return;
    const sloth = await knex('huntable_animals').where({ name: 'Ground Sloth' }).update(SLOTH);
    if (sloth !== 1) throw new Error('serph_arrows: no huntable animal named Ground Sloth');
    const tree = await knex('resource_nodes').where({ name: 'Deep Lanai Tree' }).update({ required_tool_tier: 2 });
    if (tree < 1) throw new Error('serph_arrows: no node named Deep Lanai Tree');
}

export async function down(knex: Knex): Promise<void> {
    if (await hasContent(knex)) await knex('resource_nodes').where({ name: 'Deep Lanai Tree' }).update({ required_tool_tier: 1 });
    if (await knex.schema.hasColumn('huntable_animals', 'weak_arrow_text')) {
        await knex.schema.alterTable('huntable_animals', (t) => { t.dropColumn('weak_arrow_text'); t.dropColumn('weak_arrow_warning'); });
    }
}

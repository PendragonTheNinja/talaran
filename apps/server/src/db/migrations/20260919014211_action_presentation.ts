import type { Knex } from 'knex';

/**
 * What the scene says while an action runs, and what the button to stop it
 * reads.
 *
 * Both of these lived as hard-coded `currentAction === '...'` chains in
 * GameView.tsx with no default branch, so a new action type rendered no flavour
 * text and NO CANCEL BUTTON, and nothing errored. Fishing shipped that way.
 * Cooking's build_hearth needed two more entries nobody would have thought to
 * look for. Combat adds several action types at once, which is why this is
 * being pulled into rows now rather than after.
 *
 * Flavour text is a noun, so it lives here. The kinds that are genuinely
 * computed at render time stay in code and still win over a row: the travel
 * message, the hunt's stalk phase, a habitat's own scene text, a recipe's
 * flavour. Everything else is a lookup with a working fallback, so a new action
 * type gets a plain sentence and a working Stop button on day one, and a nicer
 * sentence whenever someone writes one.
 *
 * `kind` is the sub-action: farming and husbandry send one action_type with a
 * dozen kinds behind it. NULL means "the whole type", which is what a lookup
 * falls back to before it falls back to code.
 */

interface Row {
    action_type: string;
    kind: string | null;
    scene_text: string | null;
    cancel_label: string;
}

const ROWS: Row[] = [
    // ── One kind each ────────────────────────────────────────────
    // traveling's scene text is the live travel message, so it has none here.
    { action_type: 'traveling', kind: null, scene_text: null, cancel_label: 'Cancel Travel' },
    { action_type: 'woodcutting', kind: null, scene_text: 'You are chopping a Lanai Tree.', cancel_label: 'Stop Chopping' },
    { action_type: 'mining_rock', kind: null, scene_text: 'You are mining rocks.', cancel_label: 'Stop Mining' },
    { action_type: 'mining_vein', kind: null, scene_text: 'You are mining an ore vein.', cancel_label: 'Stop Mining' },
    { action_type: 'smelting', kind: null, scene_text: 'You are smelting ingots.', cancel_label: 'Stop Smithing' },
    { action_type: 'smithing', kind: null, scene_text: 'You are working the forge.', cancel_label: 'Stop Smithing' },
    { action_type: 'kiln_collect', kind: null, scene_text: 'Collecting Charc from the kiln...', cancel_label: 'Stop' },
    { action_type: 'sawing', kind: null, scene_text: 'You are sawing planks.', cancel_label: 'Stop Carpentry' },
    { action_type: 'woodworking', kind: null, scene_text: 'You are working at the sawhorse.', cancel_label: 'Stop Carpentry' },
    { action_type: 'build_hearth', kind: null, scene_text: 'You are setting granite in mortar and drawing the flue straight.', cancel_label: 'Stop Building' },
    // hunting's text is the stalk phase; foraging's is the habitat's own.
    { action_type: 'hunting', kind: null, scene_text: null, cancel_label: 'Stop Hunting' },
    { action_type: 'foraging', kind: null, scene_text: 'You gather among the wild growth.', cancel_label: 'Stop Foraging' },
    // recipe text is the recipe's flavour_text, by design.
    { action_type: 'recipe', kind: null, scene_text: null, cancel_label: 'Stop Crafting' },

    // ── Fishing ──────────────────────────────────────────────────
    { action_type: 'fishing_rod', kind: null, scene_text: 'You cast out, and settle in to wait.', cancel_label: 'Stop Fishing' },
    { action_type: 'fishing_net', kind: null, scene_text: 'You pay the net out across the shallows and begin the long haul.', cancel_label: 'Stop Netting' },
    { action_type: 'fishing_cut_bait', kind: null, scene_text: 'You work the knife along the flank, cutting the fish down for bait.', cancel_label: 'Stop Cutting' },

    // ── Farming ──────────────────────────────────────────────────
    { action_type: 'farming', kind: null, scene_text: 'You set to work on the land.', cancel_label: 'Stop Working' },
    { action_type: 'farming', kind: 'establish', scene_text: 'You raise your farmstead, post and beam, stone and nail.', cancel_label: 'Stop Building' },
    { action_type: 'farming', kind: 'build_plot', scene_text: 'You set posts and rails, fencing in a new field.', cancel_label: 'Stop Building' },
    { action_type: 'farming', kind: 'build_shop', scene_text: 'You raise a shopfront, post and beam, stone and nail.', cancel_label: 'Stop Building' },
    { action_type: 'farming', kind: 'till', scene_text: 'You break the soil, turning it over ready for seed.', cancel_label: 'Stop Tilling' },
    { action_type: 'farming', kind: 'sow', scene_text: 'You work down the rows, pressing seed into the earth.', cancel_label: 'Stop Sowing' },
    { action_type: 'farming', kind: 'harvest', scene_text: 'You lift the crop from the earth, filling your baskets.', cancel_label: 'Stop Harvesting' },
    { action_type: 'farming', kind: 'manure', scene_text: 'You barrow muck onto the field and turn it into the soil.', cancel_label: 'Stop Working' },
    { action_type: 'farming', kind: 'tend', scene_text: 'You carry water down the rows, pulling weeds as you go.', cancel_label: 'Stop Tending' },
    { action_type: 'farming', kind: 'uproot', scene_text: 'You break the roots and turn the crop back into the soil.', cancel_label: 'Stop Working' },

    // ── Husbandry ────────────────────────────────────────────────
    { action_type: 'husbandry', kind: null, scene_text: 'You set to work among the animals.', cancel_label: 'Stop Tending' },
    { action_type: 'husbandry', kind: 'build_pen', scene_text: 'You sink posts and hang panels, closing in a new pen.', cancel_label: 'Stop Building' },
    { action_type: 'husbandry', kind: 'demolish_pen', scene_text: 'You draw the nails and stack the timber where it stood.', cancel_label: 'Stop Working' },
    { action_type: 'husbandry', kind: 'feed', scene_text: 'You go along the troughs with the pail, feeding and watering.', cancel_label: 'Stop Feeding' },
    { action_type: 'husbandry', kind: 'feed_all', scene_text: 'You work the whole farm with the pail, trough by trough.', cancel_label: 'Stop Feeding' },
    { action_type: 'husbandry', kind: 'muck', scene_text: 'You fork out the soiled bedding and lay down fresh straw.', cancel_label: 'Stop Mucking' },
    { action_type: 'husbandry', kind: 'muck_all', scene_text: 'You work through every pen in turn, forking out and laying fresh straw.', cancel_label: 'Stop Mucking' },
    { action_type: 'husbandry', kind: 'collect', scene_text: 'You work among the animals, gathering what they have given.', cancel_label: 'Stop Collecting' },
    { action_type: 'husbandry', kind: 'collect_all', scene_text: 'You go along the pen with a basket, clearing it as you pass.', cancel_label: 'Stop Collecting' },
    { action_type: 'husbandry', kind: 'slaughter', scene_text: 'You do the work out behind the barn, quickly and without fuss.', cancel_label: 'Stop' },
    { action_type: 'husbandry', kind: 'slaughter_all', scene_text: 'You work through the pen, one after another, and do not dawdle.', cancel_label: 'Stop' },
    { action_type: 'husbandry', kind: 'tame', scene_text: 'You work the halter on gently, letting it get used to the weight.', cancel_label: 'Stop Taming' },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('action_presentation'))) {
        await knex.schema.createTable('action_presentation', (t) => {
            t.increments('id').primary();
            t.string('action_type').notNullable();
            // NULL kind is "the whole action type". Postgres treats NULLs as
            // distinct in a unique index, so the partial index below is what
            // actually keeps one row per type.
            t.string('kind').nullable();
            t.text('scene_text').nullable();
            t.string('cancel_label').notNullable().defaultTo('Stop');
            t.timestamps(true, true);
            t.unique(['action_type', 'kind']);
        });
        await knex.raw(
            `CREATE UNIQUE INDEX action_presentation_type_default_uniq
             ON action_presentation (action_type) WHERE kind IS NULL`,
        );
    }

    // Upsert by (action_type, kind) so re-running is a no-op and a later patch
    // can correct a line by editing this list.
    for (const row of ROWS) {
        const existing = await knex('action_presentation')
            .where({ action_type: row.action_type })
            .modify((q) => {
                if (row.kind === null) q.whereNull('kind');
                else q.where({ kind: row.kind });
            })
            .first();

        if (existing) {
            await knex('action_presentation').where({ id: existing.id }).update({
                scene_text: row.scene_text,
                cancel_label: row.cancel_label,
                updated_at: knex.fn.now(),
            });
        } else {
            await knex('action_presentation').insert(row);
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('action_presentation');
}

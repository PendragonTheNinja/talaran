import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Chests, Geoffrey's locks, and Taiar's share of the sailor's set
// (docs/islets-plan.md §6d and §6e; Nathan, 2026-11-17).
//
//   chest_locks              a locked chest, its unlocked twin, and what
//                            Geoffrey charges to open the lock. No XP for it.
//   container_types          the Rusty Chest (it exists: Fishing's salvage) and
//                            the new Sea Chest open as nests and mussels do, a
//                            10-second action paying Fishing, contents as
//                            'open:<chest>' rows, coins on the row.
//   items.sea_speed_pct      what a worn piece takes off a sea journey (1 each).
//   items.set_island         the island whose sea chests hold the piece.
//   player_sailor_found      every set piece a player has ever had from a
//                            chest, so a chest gives one never found first.
//   player_sea_chest_luck    sea chests opened without a piece, per island; a
//                            piece is certain at the sixth (services/sailorSet.ts).
//   'chest'                  a new islet find: digging up a Locked Rusty Chest
//                            and a few coins (services/isletFinds.ts).
//   From the Islets          a museum exhibit for the keepsakes.
//
// Also: the Knocker's Hammer was "old black iron"; there is no iron in this
// world (Nathan, 2026-11-17).
//
// Taiar's four pieces only: Antura's and the third island's come with them.

const LOCKED_SEA = 'Locked Sea Chest';
const SEA = 'Sea Chest';
const RUSTY = 'Rusty Chest';
const LOCKED_RUSTY = 'Locked Rusty Chest';

type Row = Record<string, unknown> & { name: string };

const SET = (name: string, slot: string, description: string): Row => ({
    name, type: 'armor', subtype: 'sailors_set', slot, tier: 1, level_required: 1,
    sea_speed_pct: 1, set_island: 'Taiar Island', durability_uses: 600, durability_break_pct: 0.25, description,
});

const KEEPSAKE = (name: string, description: string): Row => ({
    name, type: 'curio', subtype: 'keepsake', tier: 1, level_required: 1, description,
});

const ITEMS: Row[] = [
    { name: LOCKED_SEA, type: 'collectible', subtype: 'container_locked', tier: 1, level_required: 1,
      description: 'A sailor\'s sea chest, salt-white and swollen shut, its lock furred green. Whatever is inside, the crew meant to keep it.' },
    { name: SEA, type: 'collectible', subtype: 'container', tier: 1, level_required: 1,
      description: 'A sea chest with its lock picked. The lid still sticks, but it will open.' },
    KEEPSAKE('Salt-Stained Ledger', 'A trader\'s account book, swollen with seawater. The ink has run, but the sums are still legible, and they do not add up.'),
    KEEPSAKE('Siren\'s Comb', 'A comb cut from whalebone, the teeth worn smooth, with long pale hair still caught in it.'),
    KEEPSAKE('Trow\'s Thimble', 'A thimble of Ambren gone black with age, far too big for any hand you have seen.'),
    KEEPSAKE('Drowned Captain\'s Seal', 'A brass seal on a short chain. The ship\'s name was cut into it once; the sea has worn it off.'),
    SET('Tarred Hood', 'head', 'A hood of sailcloth, painted with tar until it is stiff as a bucket. Rain runs off it and so does spray.'),
    SET('Rope-Worker\'s Gloves', 'hands', 'Leather gloves gone hard at the palms from years of hauling wet line. They grip a rope the way a bare hand never does.'),
    SET('Sea Boots', 'feet', 'Tall boots of greased hide that lace above the knee. They keep the bilge out, mostly.'),
    SET('Sounding Lead', 'mainhand', 'A lead weight on a marked line, hollow at the bottom and packed with tallow, to bring up the sea floor and tell you what lies under the keel.'),
];

const CONTAINERS = [
    { item: RUSTY, key: 'rusty_chest', skill: 'Fishing', timer_seconds: 10, xp: 8,
      coin_one_in: 1, coin_min: 15, coin_max: 60, empty_text: 'Coins and silt. Nothing else made it.' },
    { item: SEA, key: 'sea_chest', skill: 'Fishing', timer_seconds: 10, xp: 8,
      coin_one_in: 1, coin_min: 60, coin_max: 200, empty_text: 'Coins, and the smell of the sea. The rest is rot.' },
];

const LOCKS = [
    { locked_item: LOCKED_RUSTY, unlocked_item: RUSTY, fee: 25 },
    { locked_item: LOCKED_SEA, unlocked_item: SEA, fee: 100 },
];

// [chest, item, 1 in N, min, max]
const CONTENTS: [string, string, number, number, number][] = [
    [RUSTY, 'Ambren Nails', 4, 10, 30],
    [RUSTY, 'Amber', 5, 1, 2],
    [RUSTY, 'Linen Thread', 8, 1, 3],
    [RUSTY, 'Ambren Ingot', 8, 1, 2],
    [RUSTY, 'Lanai Planks', 8, 2, 5],
    [RUSTY, 'Granite Block', 8, 2, 5],
    [RUSTY, 'Cooked Whiting', 10, 1, 2],
    [RUSTY, 'Rough Quartz', 25, 1, 1],
    [RUSTY, 'Fish Pie', 30, 1, 1],
    [RUSTY, 'Salt-Stained Ledger', 1000, 1, 1],
    [SEA, 'Ambren Ingot', 3, 2, 5],
    [SEA, 'Lanai Planks', 3, 5, 15],
    [SEA, 'Linen Cloth', 3, 1, 2],
    [SEA, 'Granite Block', 4, 5, 15],
    [SEA, 'Charc', 4, 5, 10],
    [SEA, 'Cooked Conger Eel', 4, 2, 4],
    [SEA, 'Rough Quartz', 5, 1, 1],
    [SEA, 'Fish Pie', 10, 1, 2],
    [SEA, LOCKED_RUSTY, 10, 1, 1],
    [SEA, 'Rough Garnet', 30, 1, 1],
];

// Each guardian's keepsake comes from its own chest only (docs/islets-plan.md
// §6e). The guardians come in step 3; until then a Sea Chest holds none.

const GEOFFREY_OPTION = { label: '"Can you open a locked chest for me?"', action: 'unlock_chests', next_stage: null };
const GEOFFREY_STAGES = ['intro', 'progress', 'ready', 'complete'];

const EXHIBIT = {
    name: 'From the Islets',
    description: 'What the sea gave back: keepsakes off the islets around the island, each from its own shore.',
    match: [{ type: 'curio', subtype: 'keepsake' }],
};

const ISLAND = 'Taiar Island';
const CHEST_WEIGHTS: Record<string, number> = {
    'The Wooded Islet': 12, 'The Rocky Islet': 12, 'The Sandbar': 12, 'The Reef': 12, 'The Heath Islet': 12,
    'The Sea Stack': 10, 'The Drowned Quarry': 10, 'The Ruin': 30,
};
const CHEST_LINES = [
    'Above the tideline the sand is heaped wrong. You dig, and a corner of rotten wood comes up, then the rest of a small chest.',
    'Wedged under a ledge where only a storm could have put it: a little strongbox, crusted shut.',
    'Somebody buried something here and marked it with a cairn. The cairn is still standing. You dig.',
];

const HAMMER_BEFORE = 'A hammer the size of your thumb, its head of old black iron. The miners say to leave it where you found it. You did not.';
const HAMMER_AFTER = 'A hammer the size of your thumb, its head of old black Ambren. The miners say to leave it where you found it. You did not.';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('items', 'sea_speed_pct'))) {
        await knex.schema.alterTable('items', (t) => {
            t.decimal('sea_speed_pct', 5, 2).nullable();
            t.string('set_island', 100).nullable();
        });
    }
    if (!(await knex.schema.hasTable('chest_locks'))) {
        await knex.schema.createTable('chest_locks', (t) => {
            t.string('locked_item', 100).primary();
            t.string('unlocked_item', 100).notNullable();
            t.integer('fee').notNullable();
            t.boolean('is_active').notNullable().defaultTo(true);
        });
    }
    if (!(await knex.schema.hasTable('player_sailor_found'))) {
        await knex.schema.createTable('player_sailor_found', (t) => {
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('item_id').notNullable().references('id').inTable('items');
            t.timestamp('found_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.primary(['player_id', 'item_id']);
        });
    }
    if (!(await knex.schema.hasTable('player_sea_chest_luck'))) {
        await knex.schema.createTable('player_sea_chest_luck', (t) => {
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.string('island', 100).notNullable();
            t.integer('chests_without').notNullable().defaultTo(0);
            t.primary(['player_id', 'island']);
        });
    }
    await knex('islet_find_kinds').insert({ key: 'chest', skill: null, amount_min: 0, amount_max: 0, boost: 1, is_active: true })
        .onConflict('key').merge();

    if (!(await hasContent(knex))) return;

    for (const item of ITEMS) {
        const existing = await knex('items').where({ name: item.name }).first('id');
        if (existing) await knex('items').where({ id: existing.id }).update(item);
        else await knex('items').insert({ ...item, is_active: true });
    }
    for (const name of [RUSTY, LOCKED_RUSTY]) {
        if (!(await knex('items').where({ name }).first('id'))) throw new Error(`chests: item "${name}" not found`);
    }
    for (const c of CONTAINERS) {
        const item = await knex('items').where({ name: c.item }).first('id');
        const row = { item_id: item.id, key: c.key, skill: c.skill, timer_seconds: c.timer_seconds, xp: c.xp,
            coin_one_in: c.coin_one_in, coin_min: c.coin_min, coin_max: c.coin_max, empty_text: c.empty_text, is_active: true };
        const existing = await knex('container_types').where({ key: c.key }).first('id');
        if (existing) await knex('container_types').where({ id: existing.id }).update(row);
        else await knex('container_types').insert(row);
    }
    for (const lock of LOCKS) await knex('chest_locks').insert({ ...lock, is_active: true }).onConflict('locked_item').merge();

    for (const [chest, name, oneIn, min, max] of CONTENTS) {
        const item = await knex('items').where({ name }).first('id');
        if (!item) throw new Error(`chests: item "${name}" not found`);
        const source_key = `open:${chest}`;
        const row = { source_key, item_id: item.id, chance_one_in: oneIn, chance_percent: null, min_qty: min, max_qty: max, is_active: true };
        const existing = await knex('drop_table_entries').where({ source_key, item_id: item.id }).first('id');
        if (existing) await knex('drop_table_entries').where({ id: existing.id }).update(row);
        else await knex('drop_table_entries').insert(row);
    }

    const geoffrey = await knex('npcs').where({ name: 'Geoffrey' }).first('id');
    if (!geoffrey) throw new Error('chests: npc "Geoffrey" not found');
    for (const stage of GEOFFREY_STAGES) {
        const row = await knex('npc_dialogues').where({ npc_id: geoffrey.id, stage_key: stage }).first('id', 'options');
        if (!row) continue;
        const options = typeof row.options === 'string' ? JSON.parse(row.options) : (row.options ?? []);
        if (options.some((o: any) => o?.action === GEOFFREY_OPTION.action)) continue;
        // Before the farewell, so "Close" stays last.
        const closeAt = options.findIndex((o: any) => o?.action === 'close');
        if (closeAt >= 0) options.splice(closeAt, 0, GEOFFREY_OPTION);
        else options.push(GEOFFREY_OPTION);
        await knex('npc_dialogues').where({ id: row.id }).update({ options: JSON.stringify(options) });
    }

    for (const [name, weight] of Object.entries(CHEST_WEIGHTS)) {
        const islet = await knex('locations').where({ name }).whereNotNull('islet_kind').first('id');
        if (!islet) throw new Error(`chests: islet "${name}" not found`);
        await knex('islet_finds').insert({ location_id: islet.id, kind: 'chest', weight }).onConflict(['location_id', 'kind']).merge();
    }
    await knex('voyage_lines').where({ island: ISLAND, moment: 'find_chest' }).delete();
    await knex('voyage_lines').insert(CHEST_LINES.map(text => ({ island: ISLAND, moment: 'find_chest', text })));

    await knex('items').where({ name: "Knocker's Hammer", description: HAMMER_BEFORE }).update({ description: HAMMER_AFTER });

    const museum = await knex('museums').where({ island: ISLAND }).first('id');
    if (museum) {
        let exhibit = await knex('museum_exhibits').where({ museum_id: museum.id, name: EXHIBIT.name }).first();
        if (!exhibit) {
            const last = await knex('museum_exhibits').where({ museum_id: museum.id, is_catch_all: false }).max('display_order as max').first();
            const order = Number(last?.max ?? 0) + 1;
            await knex('museum_exhibits').where({ museum_id: museum.id }).where('display_order', '>=', order).increment('display_order', 1);
            [exhibit] = await knex('museum_exhibits').insert({
                museum_id: museum.id, name: EXHIBIT.name, description: EXHIBIT.description, display_order: order,
                match: JSON.stringify(EXHIBIT.match), is_catch_all: false,
            }).returning('*');
        }
        const keepsakes = await knex('items').where({ type: 'curio', subtype: 'keepsake', is_active: true }).orderBy('name').select('id');
        for (const item of keepsakes) {
            if (await knex('museum_cases').where({ item_id: item.id }).first()) continue;
            const [{ max }] = await knex('museum_cases').where({ exhibit_id: exhibit.id }).max('display_order as max');
            await knex('museum_cases').insert({ exhibit_id: exhibit.id, item_id: item.id, display_order: Number(max ?? -1) + 1 });
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await hasContent(knex)) {
        await knex('items').where({ name: "Knocker's Hammer", description: HAMMER_AFTER }).update({ description: HAMMER_BEFORE });
        await knex('voyage_lines').where({ island: ISLAND, moment: 'find_chest' }).delete();
        await knex('islet_finds').where({ kind: 'chest' }).delete();
        const geoffrey = await knex('npcs').where({ name: 'Geoffrey' }).first('id');
        if (geoffrey) {
            for (const row of await knex('npc_dialogues').where({ npc_id: geoffrey.id }).select('id', 'options')) {
                const options = typeof row.options === 'string' ? JSON.parse(row.options) : (row.options ?? []);
                const kept = options.filter((o: any) => o?.action !== GEOFFREY_OPTION.action);
                if (kept.length !== options.length) await knex('npc_dialogues').where({ id: row.id }).update({ options: JSON.stringify(kept) });
            }
        }
        await knex('drop_table_entries').whereIn('source_key', [`open:${RUSTY}`, `open:${SEA}`]).delete();
        await knex('container_types').whereIn('key', CONTAINERS.map(c => c.key)).delete();
        // Items, the exhibit and its cases stay, as with every content migration: players may hold them.
    }
    if (await knex.schema.hasTable('islet_find_kinds')) await knex('islet_find_kinds').where({ key: 'chest' }).delete();
    await knex.schema.dropTableIfExists('player_sea_chest_luck');
    await knex.schema.dropTableIfExists('player_sailor_found');
    await knex.schema.dropTableIfExists('chest_locks');
    // The item columns stay: the set pieces carry values in them.
}

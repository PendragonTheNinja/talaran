import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The invaders' rare gear (docs/invasions-spec.md §6 and §7; Nathan,
// 2026-11-27): seven pieces of gear for skills other than combat, each better
// than its tier, dropped 1 in 150 by one invader and nothing else, with no bad
// luck protection. They trade; each is a better version of something a player
// can already make, so nothing essential waits on a tear.
//
//   items.works_as_tier     the tier a tool works at (lib/tiers.ts
//                           workingTier): items.tier is derived from where an
//                           item is had and is never raised by hand. Read for
//                           the hatchet and pick (calculateTimer), the bow
//                           (catch chance), and bench tools (checkStation and
//                           smelting, through getSocketed).
//   items.forage_speed_pct  how much a pair of gloves speeds foraging where
//                           gloves are used (gloveSpeedAt, services/foraging.ts).
//
// Each works as the next tier's made piece: the creature's own tier plus one.
// Walking gear is about 1.5x the made piece of its own tier (Lanai Staff 0.03,
// Leather Boots 0.05), as no next-tier walking gear exists yet. Every piece is
// worn from the creature's level in the skill it serves (services/equipGates.ts;
// staff and boots are Wayfaring's since this pass) and lasts five times as long
// as its made kind (durability_life_factor, the tool-wear rule's stretch).

const LIFE = 5;
const ODDS = 150;
const ANTURA = 'Antura';

const GEAR = [
    { creature: 'myrmex', level: 2, name: 'Myrmex Mandible Pick', type: 'tool', subtype: 'pickaxe', slot: 'mainhand', works_as_tier: 2,
      description: 'A pick made from one great jaw of a gold-digging ant, the hinge still in it. It goes into rock the way the ant went into sand.' },
    { creature: 'pwca', level: 4, name: "Pwca's Blackthorn", type: 'tool', subtype: 'staff', slot: 'mainhand', agility_reduction: 0.045,
      description: 'A black, knotted walking stick with a thorn left on the crook. Lean on it and the road seems shorter than the one you set out on.' },
    { creature: 'afanc', level: 12, name: 'Afanc-tooth Hatchet', type: 'tool', subtype: 'axe', slot: 'mainhand', works_as_tier: 2,
      description: 'A hatchet whose blade is one orange tooth of a lake beast, bound to a haft with wet rawhide. It has felled more trees than any smith\'s edge.' },
    { creature: 'khalkotauros', level: 14, name: 'Forgefire Hammer', type: 'tool', subtype: 'hammer', slot: null, works_as_tier: 3,
      description: 'A smith\'s hammer with a head of bull\'s bronze. It is never quite cool, and the iron under it seems to know what is wanted of it.' },
    { creature: 'teumessian_fox', level: 18, name: 'Teumessian Boots', type: 'armor', subtype: 'boots', slot: 'feet', agility_reduction: 0.08,
      description: 'Light russet boots, fox fur turned inward. Whoever wears them is always a step further along than they meant to be.' },
    { creature: 'gwiber', level: 20, name: 'Gwiber-scale Gloves', type: 'tool', subtype: 'foraging_gloves', slot: 'hands', works_as_tier: 3, forage_speed_pct: 0.02,
      description: 'Gloves sewn from the green-black scales of a winged serpent. Thorns slide off them, and the fingers in them are a little quicker than they were.' },
    { creature: 'huntsman_of_annwn', level: 24, name: "Huntsman's Bow", type: 'tool', subtype: 'bow', slot: 'mainhand', works_as_tier: 3,
      description: 'A pale bow of the Otherworld\'s hunt, strung with something finer than gut. An arrow from it goes where the hounds would have gone.' },
];

const tierOf = (level: number) => (level >= 13 ? 2 : 1);

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('items', 'works_as_tier'))) {
        await knex.schema.alterTable('items', (t) => { t.integer('works_as_tier').nullable(); });
    }
    if (!(await knex.schema.hasColumn('items', 'forage_speed_pct'))) {
        await knex.schema.alterTable('items', (t) => { t.float('forage_speed_pct').nullable(); });
    }
    if (!(await hasContent(knex))) return;

    for (const g of GEAR) {
        const creature = await knex('creatures').where({ key: g.creature }).first('id');
        if (!creature) throw new Error(`invasion_rare_gear: creature ${g.creature} not found`);
        const row = {
            name: g.name, type: g.type, subtype: g.subtype, slot: g.slot,
            tier: tierOf(g.level), level_required: g.level,
            works_as_tier: g.works_as_tier ?? null,
            agility_reduction: g.agility_reduction ?? 0,
            forage_speed_pct: g.forage_speed_pct ?? null,
            durability_life_factor: LIFE,
            description: g.description, is_active: true,
            island: g.level >= 13 ? ANTURA : null,
        };
        const had = await knex('items').where({ name: g.name }).first('id');
        if (had) await knex('items').where({ id: had.id }).update(row);
        else await knex('items').insert(row);
        const item = await knex('items').where({ name: g.name }).first('id');
        const sourceKey = `combat:${g.creature}`;
        const drop = { source_key: sourceKey, item_id: item.id, chance_one_in: ODDS, chance_percent: null, min_qty: 1, max_qty: 1, is_active: true };
        const existing = await knex('drop_table_entries').where({ source_key: sourceKey, item_id: item.id }).first('id');
        if (existing) await knex('drop_table_entries').where({ id: existing.id }).update({ ...drop, updated_at: knex.fn.now() });
        else await knex('drop_table_entries').insert(drop);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await hasContent(knex)) {
        const ids = (await knex('items').whereIn('name', GEAR.map(g => g.name)).select('id')).map((r: any) => r.id);
        if (ids.length) {
            await knex('drop_table_entries').whereIn('item_id', ids).where('source_key', 'like', 'combat:%').delete();
            // Switched off, not removed: players may hold them.
            await knex('items').whereIn('id', ids).update({ is_active: false });
        }
    }
    // The columns stay while any item uses them: the gear is switched off, not gone.
    const inUse = await knex('items').whereNotNull('works_as_tier').orWhereNotNull('forage_speed_pct').first('id');
    if (!inUse) {
        if (await knex.schema.hasColumn('items', 'forage_speed_pct')) await knex.schema.alterTable('items', (t) => { t.dropColumn('forage_speed_pct'); });
        if (await knex.schema.hasColumn('items', 'works_as_tier')) await knex.schema.alterTable('items', (t) => { t.dropColumn('works_as_tier'); });
    }
}

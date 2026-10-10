import type { Knex } from 'knex';

// Combat, step 2 (docs/combat-spec.md §6, §7; docs/combat-build-plan.md).
//
// Combat stat columns on items, then the nine Ambren weapons, the twelve
// Ambren armour pieces and their Smithing recipes.
//
//   weapon_form   'dual' | 'onehand' | 'twohand'   (speed and shield come from the form)
//   damage_type   'pierce' | 'slash' | 'crush'
//   aim, power    weapon accuracy and power (lib/combatMath.ts TYPE_AIM, TIER1_POWER)
//   armour        armour points (lib/combatMath.ts ARMOUR_LADDER)
//
// The numbers are written out rather than computed from lib/combatMath.ts, so
// a later change to the formulas never rewrites what this migration seeded;
// a rebalance ships as its own migration.
//
// Requirements (routes/equipment.ts): a weapon needs Melee at its
// level_required, armour needs Defense. Ambren weapons all open at Melee 1;
// armour climbs one piece per Defense level, 1 to 12 (§7).
//
// Smithing: 45 seconds an ingot at the anvil, XP by the law
// (1.8 x 1.10 x R(level) x seconds / 3600), one new piece per level.
//
// Weapons are type 'weapon'; armour is type 'armor', subtype 'metal_armor', so
// the smith buys it back (services/marketplace.ts) and it never meets the
// leatherworker's agility boots, whose subtype is 'boots'.

type Weapon = {
    name: string; subtype: string; form: 'dual' | 'onehand' | 'twohand'; type: 'pierce' | 'slash' | 'crush';
    aim: number; power: number; smithing: number; ingots: number; rod: boolean; xp: number;
    description: string; flavor: string;
};

const WEAPONS: Weapon[] = [
    { name: 'Ambren Spear', subtype: 'spear', form: 'onehand', type: 'pierce', aim: 110, power: 37, smithing: 1, ingots: 1, rod: true, xp: 50,
      description: 'A leaf-shaped head on a stout Lanai shaft. It keeps a beast at the length of your arm, and a little more.',
      flavor: 'You draw out a leaf-shaped head and seat it on the shaft.' },
    { name: 'Ambren Scimitar', subtype: 'scimitar', form: 'onehand', type: 'slash', aim: 100, power: 38, smithing: 1, ingots: 2, rod: false, xp: 99,
      description: 'A curved blade that wants to draw across, not hack down. Light enough to carry a shield beside it.',
      flavor: 'You hammer a long curve into the blade and grind the edge.' },
    { name: 'Ambren Mace', subtype: 'mace', form: 'onehand', type: 'crush', aim: 90, power: 40, smithing: 1, ingots: 2, rod: true, xp: 99,
      description: 'A flanged head on a short haft, made for things that wear their armour on the outside.',
      flavor: 'You weld six flanges round a heavy head.' },
    { name: 'Ambren Daggers', subtype: 'daggers', form: 'dual', type: 'pierce', aim: 110, power: 41, smithing: 4, ingots: 2, rod: false, xp: 106,
      description: 'A matched pair, one for each hand. Quick work, close in.',
      flavor: 'You forge two slim blades from one bar and match them by weight.' },
    { name: 'Ambren Hand Axes', subtype: 'hand_axes', form: 'dual', type: 'slash', aim: 100, power: 43, smithing: 4, ingots: 2, rod: true, xp: 106,
      description: "Two short axes with bearded heads. A woodsman's tools, sharpened for other work.",
      flavor: 'You punch two eyes and fit two short hafts.' },
    { name: 'Ambren War Hammers', subtype: 'war_hammers', form: 'dual', type: 'crush', aim: 90, power: 44, smithing: 4, ingots: 3, rod: true, xp: 159,
      description: 'A pair of hammers with a spike behind each face. Heavy in the wrist by the end of the day.',
      flavor: 'You square two faces and draw a spike from the back of each.' },
    { name: 'Ambren Atgeir', subtype: 'atgeir', form: 'twohand', type: 'pierce', aim: 110, power: 61, smithing: 8, ingots: 2, rod: true, xp: 117,
      description: 'A broad spearhead with a hooked spur, on a haft as tall as a man. Both hands, and plenty of room.',
      flavor: 'You forge a broad head, turn a spur off one side, and socket it on a long haft.' },
    { name: 'Ambren Greatsword', subtype: 'greatsword', form: 'twohand', type: 'slash', aim: 100, power: 64, smithing: 8, ingots: 4, rod: false, xp: 234,
      description: 'Near as long as the one who carries it. It swings slow and lands like a falling bough.',
      flavor: 'You draw the blade out a hand at a time and keep it straight.' },
    { name: 'Ambren Maul', subtype: 'maul', form: 'twohand', type: 'crush', aim: 90, power: 66, smithing: 8, ingots: 4, rod: true, xp: 234,
      description: 'A block of Ambren on a thick haft. Lift it, let it fall, lift it again.',
      flavor: 'You upset a heavy block and drift a wide eye through it.' },
];

type Armour = {
    name: string; slot: string; armour: number; defense: number; ingots: number; leather: boolean; xp: number;
    description: string; flavor: string;
};

// In ladder order: the Defense (and Smithing) level is the tier's rung plus the
// piece's place here (lib/combatMath.ts ARMOUR_LADDER).
const ARMOUR: Armour[] = [
    { name: 'Ambren Bracers', slot: 'hands', armour: 6, defense: 1, ingots: 1, leather: false, xp: 50,
      description: 'Plates laced over the forearms. Enough to turn a glancing blow.',
      flavor: 'You shape two curved plates and punch holes for the laces.' },
    { name: 'Ambren Boots', slot: 'feet', armour: 6, defense: 2, ingots: 1, leather: false, xp: 51,
      description: 'Stout boots with Ambren plates riveted over the toe and shin.',
      flavor: 'You rivet thin plates over toe and shin.' },
    { name: 'Ambren Coif', slot: 'head', armour: 8, defense: 3, ingots: 2, leather: false, xp: 104,
      description: 'A hood of riveted rings that falls to the shoulders.',
      flavor: 'You close ring after ring until the hood holds its shape.' },
    { name: 'Ambren Buckler', slot: 'offhand', armour: 10, defense: 4, ingots: 2, leather: false, xp: 106,
      description: 'A small round shield gripped in the fist. Quick to raise.',
      flavor: 'You dish a round plate and rivet a grip behind the boss.' },
    { name: 'Ambren Chausses', slot: 'legs', armour: 10, defense: 5, ingots: 3, leather: false, xp: 163,
      description: 'Leggings of linked rings, laced to a belt. Noisy on stairs.',
      flavor: 'You link two long sleeves of rings and lace them to a belt.' },
    { name: 'Ambren Hauberk', slot: 'chest', armour: 14, defense: 6, ingots: 4, leather: true, xp: 223,
      description: 'A long shirt of rings over a leather backing. Heavy on the shoulders and welcome everywhere else.',
      flavor: 'You close the rings over a leather backing, row by row.' },
    { name: 'Ambren Gauntlets', slot: 'hands', armour: 9, defense: 7, ingots: 2, leather: false, xp: 114,
      description: 'Jointed plates over a leather glove, each finger its own small shell.',
      flavor: 'You fit small plates to each finger and rivet the joints loose.' },
    { name: 'Ambren Sabatons', slot: 'feet', armour: 9, defense: 8, ingots: 2, leather: false, xp: 117,
      description: 'Plate shoes in overlapping lames. You hear the wearer coming.',
      flavor: 'You overlap the lames and rivet them so the foot can bend.' },
    { name: 'Ambren Helm', slot: 'head', armour: 12, defense: 9, ingots: 3, leather: false, xp: 180,
      description: 'A rounded cap of plate with a nasal guard down the face.',
      flavor: 'You raise a bowl from a flat plate and draw a nasal down the front.' },
    { name: 'Ambren Kite Shield', slot: 'offhand', armour: 15, defense: 10, ingots: 5, leather: true, xp: 307,
      description: 'Tall and tapered, wide enough at the top to cover the chest and long enough to guard the knee.',
      flavor: 'You shape a long tapering plate and strap leather behind it.' },
    { name: 'Ambren Greaves', slot: 'legs', armour: 15, defense: 11, ingots: 4, leather: false, xp: 251,
      description: 'Shaped plates that strap over the shins and knees.',
      flavor: 'You curve each plate to a leg and set the knee cops.' },
    { name: 'Ambren Cuirass', slot: 'chest', armour: 20, defense: 12, ingots: 6, leather: true, xp: 386,
      description: 'Breast and back plates buckled at the sides over a leather jack. The best Ambren a smith can put on a body.',
      flavor: 'You raise breast and back plates and buckle them over a leather jack.' },
];

const INPUT_ITEMS = ['Ambren Ingot', 'Lanai Tool Rod', 'Leather Strips', 'Leather'];

function recipeRow(output: string, forSkill: string, level: number, inputs: { itemName: string; qty: number }[], ingots: number, xp: number, flavor: string) {
    return {
        skill: 'Smithing', for_skill: forSkill, name: `Forge ${output}`,
        output_item_name: output, output_qty: 1,
        inputs: JSON.stringify(inputs),
        required_level: level, timer_seconds: 45 * ingots, xp,
        station: 'smithing', mode: 'active', is_active: true,
        flavor_text: flavor,
    };
}

async function upsert(knex: Knex, table: string, row: Record<string, unknown>) {
    const existing = await knex(table).where({ name: row.name }).first();
    if (existing) await knex(table).where({ id: existing.id }).update(row);
    else await knex(table).insert(row);
}

export async function up(knex: Knex): Promise<void> {
    for (const name of INPUT_ITEMS) {
        if (!(await knex('items').where({ name }).first())) throw new Error(`ambren_combat_gear: input item ${name} not found`);
    }

    const columns: [string, (t: Knex.AlterTableBuilder) => void][] = [
        ['weapon_form', t => { t.string('weapon_form', 10).nullable(); }],
        ['damage_type', t => { t.string('damage_type', 10).nullable(); }],
        ['aim', t => { t.integer('aim').nullable(); }],
        ['power', t => { t.integer('power').nullable(); }],
        ['armour', t => { t.integer('armour').nullable(); }],
    ];
    for (const [name, add] of columns) {
        if (!(await knex.schema.hasColumn('items', name))) await knex.schema.alterTable('items', add);
    }

    for (const w of WEAPONS) {
        await upsert(knex, 'items', {
            name: w.name, type: 'weapon', subtype: w.subtype, tier: 1, quality: null,
            slot: 'mainhand', level_required: 1, description: w.description,
            weapon_form: w.form, damage_type: w.type, aim: w.aim, power: w.power, armour: null,
        });
        const inputs = [{ itemName: 'Ambren Ingot', qty: w.ingots }];
        if (w.rod) inputs.push({ itemName: 'Lanai Tool Rod', qty: 1 });
        inputs.push({ itemName: 'Leather Strips', qty: 1 });
        await upsert(knex, 'recipes', recipeRow(w.name, 'Melee', w.smithing, inputs, w.ingots, w.xp, w.flavor));
    }

    for (const a of ARMOUR) {
        await upsert(knex, 'items', {
            name: a.name, type: 'armor', subtype: 'metal_armor', tier: 1, quality: null,
            slot: a.slot, level_required: a.defense, description: a.description,
            weapon_form: null, damage_type: null, aim: null, power: null, armour: a.armour,
        });
        const inputs = [
            { itemName: 'Ambren Ingot', qty: a.ingots },
            { itemName: a.leather ? 'Leather' : 'Leather Strips', qty: 1 },
        ];
        await upsert(knex, 'recipes', recipeRow(a.name, 'Defense', a.defense, inputs, a.ingots, a.xp, a.flavor));
    }
}

export async function down(knex: Knex): Promise<void> {
    const names = [...WEAPONS.map(w => w.name), ...ARMOUR.map(a => a.name)];
    await knex('recipes').whereIn('name', names.map(n => `Forge ${n}`)).delete();
    // The items stay, as with every gear migration: players may be holding them.
    // Their combat columns go, so the gear is inert until up() runs again.
    for (const name of ['armour', 'power', 'aim', 'damage_type', 'weapon_form']) {
        if (await knex.schema.hasColumn('items', name)) await knex.schema.alterTable('items', t => { t.dropColumn(name); });
    }
}

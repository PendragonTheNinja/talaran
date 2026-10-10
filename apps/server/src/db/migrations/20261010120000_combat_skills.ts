import type { Knex } from 'knex';

// Combat, step 1 (docs/combat-spec.md §2, docs/combat-build-plan.md).
//
// Four seeded combat skills become three: Attack is renamed Melee in place (its
// id and every player's row carry over), Strength is retired, Defense and
// Constitution stay. All three are switched on.
//
// Live had 83 rows per combat skill and 0 XP in every one (checked 2026-10-10),
// so deleting Strength loses nothing. The up() refuses rather than delete XP if
// that is ever no longer true. Its player_skills and skill_snapshots rows go
// with it (ON DELETE CASCADE).
//
// players.hp_missing: damage taken and not yet healed. Current HP is max HP
// (from Constitution) minus this, so a Constitution level raises current HP
// with it, and a new character needs no backfill. Death resets it to 0.

const MELEE = "Fight at arm's length with blade, spear or hammer. The better your hand, the finer the weapon it can hold.";
const DEFENSE = 'Take the blow on your armour and not on yourself. The more you turn aside, the heavier the armour you can carry.';
const CONSTITUTION = 'Bear the blows that get through. A hardy body has more to lose before it falls.';

// What seeds/01_skills.ts gave them, for down().
const OLD = {
    Attack: { description: 'Determines your accuracy in melee combat, as well as what tier of weapon you can wield.', display_order: 12 },
    Strength: { description: 'Increases melee damage output.', display_order: 13 },
    Defense: { description: 'Reduces damage taken from enemies.', display_order: 14 },
    Constitution: { description: 'Governs your maximum health points.', display_order: 15 },
};

export async function up(knex: Knex): Promise<void> {
    const strength = await knex('skills').where({ name: 'Strength' }).first();
    if (strength) {
        const banked = await knex('player_skills').where({ skill_id: strength.id }).andWhere('xp', '>', 0).count({ c: '*' }).first();
        if (Number(banked?.c ?? 0) > 0) {
            throw new Error('combat_skills: players hold Strength XP; decide where it goes before retiring the skill');
        }
        await knex('skills').where({ id: strength.id }).delete();
    }

    const attack = await knex('skills').where({ name: 'Attack' }).first();
    const melee = await knex('skills').where({ name: 'Melee' }).first();
    if (attack && !melee) await knex('skills').where({ id: attack.id }).update({ name: 'Melee' });
    if (!attack && !melee) throw new Error('combat_skills: neither Attack nor Melee exists');

    const rows: [string, string, number][] = [
        ['Melee', MELEE, 12],
        ['Defense', DEFENSE, 13],
        ['Constitution', CONSTITUTION, 14],
    ];
    for (const [name, description, display_order] of rows) {
        const updated = await knex('skills').where({ name }).update({ description, display_order, is_implemented: true });
        if (updated !== 1) throw new Error(`combat_skills: skill ${name} not found`);
    }

    if (!(await knex.schema.hasColumn('players', 'hp_missing'))) {
        await knex.schema.alterTable('players', t => {
            t.integer('hp_missing').notNullable().defaultTo(0);
        });
        await knex.raw('ALTER TABLE players ADD CONSTRAINT players_hp_missing_nonnegative CHECK (hp_missing >= 0)');
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('players', 'hp_missing')) {
        await knex.raw('ALTER TABLE players DROP CONSTRAINT IF EXISTS players_hp_missing_nonnegative');
        await knex.schema.alterTable('players', t => { t.dropColumn('hp_missing'); });
    }

    await knex('skills').where({ name: 'Melee' }).update({ name: 'Attack' });
    for (const name of ['Attack', 'Defense', 'Constitution'] as const) {
        await knex('skills').where({ name }).update({ ...OLD[name], is_implemented: false });
    }
    // Strength comes back without its player rows: awardXp upserts a missing
    // row the first time it pays the skill (services/xp.ts).
    if (!(await knex('skills').where({ name: 'Strength' }).first())) {
        await knex('skills').insert({ name: 'Strength', type: 'combat', ...OLD.Strength, is_implemented: false });
    }
}

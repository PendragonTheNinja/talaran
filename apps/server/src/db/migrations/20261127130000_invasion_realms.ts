import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The first two realms a tear opens onto (docs/invasions-spec.md §7; Nathan,
// 2026-11-27): the Bronze Shore (Greek myth, without the gods) and Annwn (the
// Otherworld of the Welsh tales). Twelve creatures, one every two levels from
// 2 to 24, alternating realms; the six below 13 come through a tear on Taiar,
// the six from 14 through one on Antura (services/invasions.ts picks by the
// island's band).
//
//   Profiles   from combatSim.ts roster, 2026-11-27, a level-matched one-hander
//              on its weakness, against the ±15% XP-an-hour guardrail: 87 to
//              101% (the spec's §7 table has every number).
//   XP a kill  xpPerKillAt(level), as pnpm combat:derive writes it.
//   Drops      goods with a main source of their own, at about twice a native's
//              rate (the spec's §6 and §7), coin from the people among them, and
//              one trophy each at 1 in 150. The rare gear for other skills needs
//              its speed hooks first and comes in a later migration.
//   Trophies   new items, priced by values:derive (combat-only, subtype trophy);
//              each island's go to its museum's Spoils of the Fight.

const ANTURA = 'Antura';

const REALMS = [
    {
        key: 'bronze_shore', name: 'The Bronze Shore',
        description: 'A white beach under a sun that never moves, and a sea the color of a bronze shield. Everything there that is alive is partly metal.',
        warning_line: 'The air over {location} has begun to shimmer, like heat off a road at noon. It smells of hot metal and salt.',
        open_line: 'A tear has opened over {location}. Through it is a white beach under a hard sun, and things of bronze are coming up off the sand.',
        held_line: 'The tear over {location} has closed behind the last of the bronze. {count} fought there, and {top} brought down the most.',
        lost_line: 'The tear over {location} has closed on its own, with the sound of a great door shutting. What was left of the horde went back through it.',
    },
    {
        key: 'annwn', name: 'Annwn',
        description: 'A hall where it is always evening, a hunt that never ends, and lakes that are not the depth they look.',
        warning_line: 'Over {location} the light has gone the color of late evening, though it is nowhere near dark. Somewhere a long way off, hounds are giving tongue.',
        open_line: 'A tear has opened over {location}. On the far side is a hall where it is always evening, and the hunt is coming out of it.',
        held_line: 'The tear over {location} has closed, and the evening light has gone with it. {count} fought there, and {top} brought down the most.',
        lost_line: 'The tear over {location} has closed on its own. The horn sounded once on the far side, and the hunt went home.',
    },
];

type Stance = 'weak' | 'neutral' | 'resistant';
interface Invader {
    key: string; name: string; realm: string; level: number; xp: number;
    accuracy?: number; defence?: number; power?: number; hp?: number; swing?: number;
    pierce: Stance; slash: Stance; crush: Stance;
    description: string; lore: string;
}

const INVADERS: Invader[] = [
    { key: 'myrmex', name: 'Myrmex', realm: 'bronze_shore', level: 2, xp: 27, accuracy: 0.85, defence: 1.15, power: 0.9,
      pierce: 'neutral', slash: 'resistant', crush: 'weak',
      description: 'An ant the size of a sheepdog, its shell the dull yellow of old brass, its jaws working at the ground as it walks.',
      lore: 'Where they come from, they dig for gold in the sand and keep what they find. The men who went to rob their hills went on fast horses and did not stop to look back.' },
    { key: 'pwca', name: 'Pwca', realm: 'annwn', level: 4, xp: 29, accuracy: 1.05, defence: 1.1, power: 0.9, hp: 0.95, swing: 2.4,
      pierce: 'resistant', slash: 'weak', crush: 'neutral',
      description: 'A small, thin, wizened thing with a long face, carrying a lantern on a stick. It is a goat one moment and a gray horse the next.',
      lore: 'It walks ahead of a traveler on a dark night, holding up its light so they can follow. Then it blows the light out at the edge of the cliff and laughs.' },
    { key: 'spartos', name: 'Spartos', realm: 'bronze_shore', level: 6, xp: 32, accuracy: 1.05, defence: 1.05, power: 1.1,
      pierce: 'resistant', slash: 'neutral', crush: 'weak',
      description: 'A soldier in bronze, helmet and all, who came up out of a plowed field with a spear already in his hand. There is nothing behind his eyes but the fight.',
      lore: 'They grow from a dragon\'s teeth sown in a furrow. A man once threw a stone among a field of them, and they turned on each other until five were left.' },
    { key: 'gwyllgi', name: 'Gwyllgi', realm: 'annwn', level: 8, xp: 34, accuracy: 1.15, power: 0.9, swing: 2.4,
      pierce: 'weak', slash: 'neutral', crush: 'neutral',
      description: 'A mastiff made of the dark between hedgerows, with eyes like two coals and a breath you can smell before you see it.',
      lore: 'The Dog of Darkness keeps to lonely roads at night. Those who meet it say it never barks, only follows, and that the following is worse.' },
    { key: 'stymphalian_bird', name: 'Stymphalian Bird', realm: 'bronze_shore', level: 10, xp: 37, accuracy: 1.15, defence: 1.1, power: 0.9, hp: 0.95, swing: 2.4,
      pierce: 'weak', slash: 'resistant', crush: 'neutral',
      description: 'A marsh bird the size of a crane with a beak of bronze and feathers like knife blades, which it can shake loose and send flying.',
      lore: 'A whole flock of them was once driven up out of a marsh with a rattle and shot down as they rose. More came back, as birds do.' },
    { key: 'afanc', name: 'Afanc', realm: 'annwn', level: 12, xp: 40, accuracy: 0.9, power: 1.25, hp: 1.15, swing: 3.6,
      pierce: 'neutral', slash: 'weak', crush: 'resistant',
      description: 'A lake beast like a beaver grown to the size of a boat, with a crocodile\'s mouth and a wet brown coat. It has gnawed through every tree at the water\'s edge.',
      lore: 'It drags down anyone who swims in its lake and floods the valley when it is angry. It took a team of oxen to haul one out, and the oxen were never the same.' },
    { key: 'khalkotauros', name: 'Khalkotauros', realm: 'bronze_shore', level: 14, xp: 35, accuracy: 0.85, defence: 1.05, power: 1.3, hp: 1.1, swing: 3.6,
      pierce: 'weak', slash: 'neutral', crush: 'resistant',
      description: 'A bull with hooves of bronze and a hide that rings when it is struck. Heat comes off it in waves, and when it bellows, it breathes fire.',
      lore: 'A king kept two of them to plow a field no one else could plow. The one who yoked them first rubbed himself all over with an ointment against the fire, and it still singed his hair.' },
    { key: 'cwn_annwn', name: 'Cŵn Annwn', realm: 'annwn', level: 16, xp: 38, accuracy: 1.2, power: 0.95, swing: 2.4,
      pierce: 'neutral', slash: 'weak', crush: 'resistant',
      description: 'A white hound with red ears, one of a pack, running low and silent. The nearer the pack is, the quieter it sounds.',
      lore: 'They belong to the king of the Otherworld and hunt a stag that never tires. A man once drove them off his own kill and spent a year paying for it.' },
    { key: 'teumessian_fox', name: 'Teumessian Fox', realm: 'bronze_shore', level: 18, xp: 42, accuracy: 1.1, defence: 1.3, power: 0.85, hp: 0.75, swing: 2.4,
      pierce: 'resistant', slash: 'neutral', crush: 'weak',
      description: 'A red fox, a little too large, that is always one step further off than it was. It does not run from you. It simply is not where you swung.',
      lore: 'It was fated never to be caught. A hound fated to catch whatever it chased was set on it, and the two ran until both were turned to stone, mid-stride.' },
    { key: 'gwiber', name: 'Gwiber', realm: 'annwn', level: 20, xp: 46, accuracy: 1.05, power: 1.05, swing: 2.4,
      pierce: 'resistant', slash: 'weak', crush: 'neutral',
      description: 'A winged serpent as long as a cart, green-black and quick, that strikes from above and is back in the air before you have turned.',
      lore: 'One lived above a valley in the north hills and was killed three ways at once, as a wise man had said it would be: bitten, broken, and drowned.' },
    { key: 'crommyonian_sow', name: 'Crommyonian Sow', realm: 'bronze_shore', level: 22, xp: 51, accuracy: 0.9, defence: 0.95, power: 1.3, hp: 1.25, swing: 3.6,
      pierce: 'weak', slash: 'neutral', crush: 'resistant',
      description: 'A wild sow the size of a hay cart, bristles like a broom, tusks like plowshares. The ground shakes before she comes into sight.',
      lore: 'She laid waste to a whole country until a young man on the road to a city stopped to deal with her, as he dealt with everything on that road.' },
    { key: 'huntsman_of_annwn', name: 'Huntsman of Annwn', realm: 'annwn', level: 24, xp: 55, accuracy: 1.1, defence: 1.1, power: 1.15,
      pierce: 'resistant', slash: 'neutral', crush: 'weak',
      description: 'A rider in gray hunting clothes on a gray horse, a horn at his belt and a spear across his saddle. He looks at you as if deciding whether you are worth chasing.',
      lore: 'One of the riders of the king of the Otherworld. The king himself never comes through. His riders are enough, and they always come back with something.' },
];
// People carry coin (creatures.coin_*): the Pwca robs travelers, and a Spartos fights for pay.
const COINS: Record<string, [number, number, number]> = {
    pwca: [3, 3, 12], spartos: [3, 5, 15], huntsman_of_annwn: [2, 10, 40],
};

// One trophy each, at 1 in 150 (spec §6): about one a tear, where a native's is 1 in 750.
const TROPHIES: { creature: string; name: string; description: string }[] = [
    { creature: 'myrmex', name: 'Ant-gold Nugget', description: 'A lump of soft yellow gold, scored all over by small sharp jaws. The ant had been saving it.' },
    { creature: 'pwca', name: "Pwca's Lantern", description: 'A little tin lantern on a hazel stick, still warm. It lights itself when it is dark and nobody is holding it.' },
    { creature: 'spartos', name: "Sown Dragon's Tooth", description: 'A tooth as long as a hand, curved and yellow, with earth still in the root. Nobody sensible plants it.' },
    { creature: 'gwyllgi', name: "Gwyllgi's Eye", description: 'A round red stone that glows faintly in the dark. Hold it up to a lonely road at night and it shows you who is following.' },
    { creature: 'stymphalian_bird', name: 'Bronze Feather', description: 'A feather of thin bronze, sharp along both edges and heavy as a knife. It rings when you flick it.' },
    { creature: 'afanc', name: 'Afanc Skull', description: 'A broad flat skull with two great orange front teeth, worn to chisels. Weed still hangs from the eye holes.' },
    { creature: 'khalkotauros', name: 'Bronze Hoof', description: 'A cloven hoof of solid bronze, still too hot to hold for long. It leaves a black print on whatever it is set down on.' },
    { creature: 'cwn_annwn', name: 'Red Ear of Annwn', description: 'A hound\'s ear, white fur outside, bright red within, and always warm. Dogs will not come near it.' },
    { creature: 'teumessian_fox', name: 'Teumessian Brush', description: 'A fox\'s tail, deep russet with a white tip. Set it down and look away, and it is never quite where you left it.' },
    { creature: 'gwiber', name: 'Gwiber Fang', description: 'A long hooked fang, hollow, with a bead of something green still in the tip. Handle it by the root.' },
    { creature: 'crommyonian_sow', name: "Sow's Tusk", description: 'A tusk as long as a forearm and thick as a wrist, curved back on itself. Whatever it was, it was never a pig.' },
    { creature: 'huntsman_of_annwn', name: 'Horn of Annwn', description: 'A hunting horn of pale horn and silver. Blow it and, very far off, hounds answer.' },
];

// [creature key, item, 1 in, min, max] (spec §7). Every item here already has
// a use; a missing one throws.
const GOODS: [string, string, number, number, number][] = [
    ['myrmex', 'Ambren Ore', 2, 1, 3],
    ['myrmex', 'Rough Quartz', 60, 1, 1],
    ['pwca', 'Feathers', 4, 1, 3],
    ['pwca', 'Turnip Seeds', 8, 1, 2],
    ['pwca', 'Linen Cloth', 40, 1, 1],
    ['spartos', 'Bones', 2, 1, 2],
    ['spartos', 'Ambren Ingot', 10, 1, 1],
    ['spartos', 'Rough Quartz', 80, 1, 1],
    ['gwyllgi', 'Bones', 2, 1, 3],
    ['gwyllgi', 'Flax Seeds', 10, 1, 2],
    ['gwyllgi', 'Rough Garnet', 150, 1, 1],
    ['stymphalian_bird', 'Feathers', 2, 2, 5],
    ['stymphalian_bird', 'Amber', 8, 1, 1],
    ['stymphalian_bird', 'Rough Quartz', 60, 1, 1],
    ['afanc', 'Fine Lanai Log', 2, 1, 3],
    ['afanc', 'Excellent Lanai Log', 20, 1, 1],
    ['afanc', 'Rough Garnet', 120, 1, 1],
    ['khalkotauros', 'Serph Ore', 2, 1, 3],
    ['khalkotauros', 'Charc', 4, 1, 3],
    ['khalkotauros', 'Rough Garnet', 120, 1, 1],
    ['cwn_annwn', 'Bones', 2, 1, 2],
    ['cwn_annwn', 'Buckskin', 5, 1, 1],
    ['cwn_annwn', 'Rough Garnet', 100, 1, 1],
    ['teumessian_fox', 'Barley Seeds', 4, 1, 2],
    ['teumessian_fox', 'Cabbage Seeds', 6, 1, 2],
    ['teumessian_fox', 'Feathers', 5, 1, 3],
    ['teumessian_fox', 'Rough Garnet', 100, 1, 1],
    ['gwiber', 'Bones', 2, 1, 2],
    ['gwiber', 'Rough Garnet', 80, 1, 1],
    ['gwiber', 'Rough Quartz', 100, 1, 1],
    ['gwiber', 'Rough Amethyst', 600, 1, 1],
    ['crommyonian_sow', 'Barley', 2, 2, 4],
    ['crommyonian_sow', 'Broad Beans', 4, 1, 3],
    ['crommyonian_sow', 'Leek Seeds', 8, 1, 2],
    ['crommyonian_sow', 'Rough Garnet', 100, 1, 1],
    ['huntsman_of_annwn', 'Buckskin', 4, 1, 1],
    ['huntsman_of_annwn', 'Locked Rusty Chest', 15, 1, 1],
    ['huntsman_of_annwn', 'Linen Cloth', 20, 1, 1],
    ['huntsman_of_annwn', 'Lit Garnet', 300, 1, 1],
];

const TROPHY_ODDS = 150;
const isAntura = (level: number) => level >= 13;

async function spoilsExhibit(knex: Knex, island: string | null): Promise<any> {
    const museum = island
        ? await knex('museums').where({ island }).first('id')
        : await knex('museums').where({ key: 'taiar' }).first('id');
    if (!museum) throw new Error(`invasion_realms: no museum for ${island ?? 'Taiar'}`);
    const exhibit = await knex('museum_exhibits').where({ museum_id: museum.id, name: 'Spoils of the Fight' }).first('id', 'match');
    if (!exhibit) throw new Error(`invasion_realms: no Spoils of the Fight in the ${island ?? 'Taiar'} museum`);
    return exhibit;
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;

    const realmIds = new Map<string, number>();
    for (const r of REALMS) {
        const had = await knex('realms').where({ key: r.key }).first('id');
        if (had) await knex('realms').where({ id: had.id }).update({ ...r, is_active: true });
        else await knex('realms').insert({ ...r, is_active: true });
        realmIds.set(r.key, (await knex('realms').where({ key: r.key }).first('id')).id);
    }

    const creatureIds = new Map<string, number>();
    for (const c of INVADERS) {
        const coin = COINS[c.key];
        const row = {
            key: c.key, name: c.name, level: c.level, xp_per_kill: c.xp,
            accuracy: c.accuracy ?? null, defence: c.defence ?? null, power: c.power ?? null,
            hp: c.hp ?? null, swing_seconds: c.swing ?? null,
            stance_pierce: c.pierce, stance_slash: c.slash, stance_crush: c.crush,
            xp_multiplier: 1,
            coin_chance_one_in: coin?.[0] ?? null, coin_min: coin?.[1] ?? null, coin_max: coin?.[2] ?? null,
            description: c.description, lore: c.lore,
            realm_id: realmIds.get(c.realm),
            is_active: true,
        };
        const had = await knex('creatures').where({ key: c.key }).first('id');
        if (had) await knex('creatures').where({ id: had.id }).update(row);
        else await knex('creatures').insert(row);
        creatureIds.set(c.key, (await knex('creatures').where({ key: c.key }).first('id')).id);
    }

    const itemId = async (name: string): Promise<number> => {
        const item = await knex('items').where({ name }).first('id');
        if (!item) throw new Error(`invasion_realms: item "${name}" not found`);
        return item.id;
    };
    const putDrop = async (creatureKey: string, item: string, oneIn: number, min: number, max: number) => {
        const sourceKey = `combat:${creatureKey}`;
        const id = await itemId(item);
        const row = { source_key: sourceKey, item_id: id, chance_one_in: oneIn, chance_percent: null, min_qty: min, max_qty: max, is_active: true };
        const had = await knex('drop_table_entries').where({ source_key: sourceKey, item_id: id }).first('id');
        if (had) await knex('drop_table_entries').where({ id: had.id }).update({ ...row, updated_at: knex.fn.now() });
        else await knex('drop_table_entries').insert(row);
    };

    for (const t of TROPHIES) {
        const creature = INVADERS.find(c => c.key === t.creature);
        if (!creature) throw new Error(`invasion_realms: trophy ${t.name} names unknown creature ${t.creature}`);
        const row = {
            name: t.name, type: 'material', subtype: 'trophy', tier: isAntura(creature.level) ? 2 : 1,
            level_required: 1, description: t.description, is_active: true,
            island: isAntura(creature.level) ? ANTURA : null,
        };
        const had = await knex('items').where({ name: t.name }).first('id');
        if (had) await knex('items').where({ id: had.id }).update(row);
        else await knex('items').insert(row);
        await putDrop(t.creature, t.name, TROPHY_ODDS, 1, 1);
    }

    for (const [creatureKey, item, oneIn, min, max] of GOODS) {
        if (!creatureIds.has(creatureKey)) throw new Error(`invasion_realms: drop names unknown creature ${creatureKey}`);
        await putDrop(creatureKey, item, oneIn, min, max);
    }

    // Each island's trophies on its own Spoils of the Fight, by name (as
    // Antura's four are): a trophy's kind alone would file it in Curiosities.
    for (const island of [null, ANTURA]) {
        const exhibit = await spoilsExhibit(knex, island);
        const match: any[] = typeof exhibit.match === 'string' ? JSON.parse(exhibit.match) : (exhibit.match ?? []);
        const names = TROPHIES.filter(t => isAntura(INVADERS.find(c => c.key === t.creature)!.level) === (island === ANTURA)).map(t => t.name);
        for (const name of names) if (!match.some(m => m?.name === name)) match.push({ name });
        await knex('museum_exhibits').where({ id: exhibit.id }).update({ match: JSON.stringify(match) });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const trophyNames = TROPHIES.map(t => t.name);
    for (const island of [null, ANTURA]) {
        const exhibit = await spoilsExhibit(knex, island);
        const match: any[] = typeof exhibit.match === 'string' ? JSON.parse(exhibit.match) : (exhibit.match ?? []);
        await knex('museum_exhibits').where({ id: exhibit.id })
            .update({ match: JSON.stringify(match.filter(m => !trophyNames.includes(m?.name))) });
    }
    await knex('drop_table_entries').whereIn('source_key', INVADERS.map(c => `combat:${c.key}`)).delete();
    // Switched off rather than removed: players may hold the trophies and have
    // the kills on record. An inactive item's museum case is hidden with it,
    // and up() switches both back on.
    await knex('items').whereIn('name', trophyNames).update({ is_active: false });
    await knex('creatures').whereIn('key', INVADERS.map(c => c.key)).update({ is_active: false, realm_id: null });
    await knex('realms').whereIn('key', REALMS.map(r => r.key)).update({ is_active: false });
}

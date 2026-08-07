import type { Knex } from 'knex';

// Animal name pools move from code into the species row.
//
// They were a constant in services/husbandry.ts, which made them the only piece
// of Husbandry content that was not a database row: every timing, yield and
// level gate ships as a migration and can be edited in place, but adding one
// chicken name meant a code change and a redeploy.
//
// Stored as a comma-separated list rather than JSON so it can be edited by hand
// in a database client without worrying about brackets and quoting. Blank or
// missing falls back to the species name in the service.

const POOLS: Record<string, string[]> = {
    Chicken: ['Henrietta', 'Clucky', 'Bartholomew', 'Peck', 'Dumpling', 'Marigold', 'Sootfoot', 'Nugget',
        'Empress', 'Biddy', 'Rustle', 'Pip', 'Guinevere', 'Scratch', 'Buttercup', 'Old Grudge',
        'Feathers', 'Tuppence', 'Wattle', 'Fern'],
    Cow: ['Maribel', 'Chestnut', 'Daisy', 'Bramble', 'Clover', 'Mabel', 'Buttermilk', 'Willow',
        'Hazel', 'Juniper', 'Poppy', 'Bess', 'Tansy', 'Meadow', 'Primrose', 'Dun',
        'Nutmeg', 'Rosalind', 'Thistle', 'Comfrey'],
    Pig: ['Truffle', 'Bacon', 'Winifred', 'Barnaby', 'Snout', 'Grunt', 'Hamnet', 'Bristle',
        'Porridge', 'Duchess', 'Muddy', 'Rooter', 'Sausage', 'Wilbur', 'Cobnut', 'Turnip',
        'Rumble', 'Pudding', 'Gruff', 'Acorn'],
    Rouncey: ['Dobbin', 'Jasper', 'Ambrose', 'Copper', 'Sorrel', 'Bayard', 'Hollow', 'Tanner',
        'Fenwick', 'Rowan', 'Sundry', 'Quill', 'Blackthorn', 'Marlowe', 'Cobble', 'Bracken',
        'Halloway', 'Drover', 'Kestrel', 'Grimsby'],
    Palfrey: ['Isolde', 'Silvermane', 'Verity', 'Aurelia', 'Lyric', 'Featherfall', 'Seraphine', 'Wisp',
        'Vesper', 'Cantrell', 'Rhiannon', 'Solace', 'Larkspur', 'Elowen', 'Sable', 'Whitlow',
        'Ondine', 'Peregrine', 'Zephyr', 'Mireille'],
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('animal_species', 'name_pool'))) {
        await knex.schema.alterTable('animal_species', (t) => {
            // Comma-separated. Add names by appending; order does not matter.
            t.text('name_pool').nullable();
        });
    }

    for (const [species, names] of Object.entries(POOLS)) {
        await knex('animal_species').where({ name: species }).update({ name_pool: names.join(', ') });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('animal_species', 'name_pool')) {
        await knex.schema.alterTable('animal_species', (t) => t.dropColumn('name_pool'));
    }
}

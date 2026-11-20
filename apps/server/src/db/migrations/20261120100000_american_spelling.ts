import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// American spelling in the text added since 20261117 (Nathan, 2026-11-19):
// harbor, gray, color, favor. Each line is matched whole, so only these rows
// change; names (the Grey Wolf) and code keys (the ship log's 'grey' weather)
// are left as they are. A line found nowhere throws: the content is missing.

const COLUMNS: [string, string][] = [
    ['items', 'description'],
    ['locations', 'description'],
    ['creatures', 'description'],
    ['creatures', 'lore'],
    ['fighting_spots', 'description'],
    ['voyage_lines', 'text'],
    ['ship_log_lines', 'text'],
];

const LINES: [string, string][] = [
    ['Soft grey fur off a jackalope, finer than any rabbit\'s. The people who say there are no jackalopes have never had to skin one.',
     'Soft gray fur off a jackalope, finer than any rabbit\'s. The people who say there are no jackalopes have never had to skin one.'],
    ['Grey stone heaved up out of the sea in slabs, split and tilted, with thrift in the cracks. The gulls own it.',
     'Gray stone heaved up out of the sea in slabs, split and tilted, with thrift in the cracks. The gulls own it.'],
    ['The harbour water is flat and brown. Past the breakwater it turns green and starts to lift.',
     'The harbor water is flat and brown. Past the breakwater it turns green and starts to lift.'],
    ['The swell finds the Skiff and rocks her like a cradle. The land goes blue, then grey.',
     'The swell finds the Skiff and rocks her like a cradle. The land goes blue, then gray.'],
    ['The harbour smells of fish and tar. After the islets, it smells like home.',
     'The harbor smells of fish and tar. After the islets, it smells like home.'],
    ['The cliff has fallen away in a heap, and the fresh face shines with ore. Whatever brought it down did you a favour.',
     'The cliff has fallen away in a heap, and the fresh face shines with ore. Whatever brought it down did you a favor.'],
    ['Squat, grey, and lumpy as the rocks it sits among, with long arms and a short temper. It does not like anyone touching its things.',
     'Squat, gray, and lumpy as the rocks it sits among, with long arms and a short temper. It does not like anyone touching its things.'],
    ['In a cleft above the waterline, a heap of other people\'s things: oars, net floats, a sea chest. Something lumpy and grey is sitting on it.',
     'In a cleft above the waterline, a heap of other people\'s things: oars, net floats, a sea chest. Something lumpy and gray is sitting on it.'],
    ['A scale wider than your hand, the colour of deep water and hard as horn. Whatever shed it was big enough to lift a boat without noticing.',
     'A scale wider than your hand, the color of deep water and hard as horn. Whatever shed it was big enough to lift a boat without noticing.'],
    ['A grey sky sits low over a grey sea. The kind of day nobody remembers.',
     'A gray sky sits low over a gray sea. The kind of day nobody remembers.'],
    ['Grey all the way to the horizon, and the horizon not quite where you left it.',
     'Gray all the way to the horizon, and the horizon not quite where you left it.'],
    ['Taiar is a grey line behind you now, low on the water.',
     'Taiar is a gray line behind you now, low on the water.'],
    ['The harbour wall drops away behind you, and the noise of the town with it.',
     'The harbor wall drops away behind you, and the noise of the town with it.'],
    ['The harbour comes up out of the sea ahead, and the smoke of the town above it.',
     'The harbor comes up out of the sea ahead, and the smoke of the town above it.'],
    ['Afterward, turning in the wake, there is a single scale the colour of deep water. You lean over and take it.',
     'Afterward, turning in the wake, there is a single scale the color of deep water. You lean over and take it.'],
    ['Every gull goes quiet at once. A cable\'s length off, the sea swells into a long grey back, ridged like a hill, and rolls under without a splash.',
     'Every gull goes quiet at once. A cable\'s length off, the sea swells into a long gray back, ridged like a hill, and rolls under without a splash.'],
    ['Antura\'s port, a harbour of grey stone where the ferry from Talador ties up. Boats come and go on every tide, and so do the people who sail them.',
     'Antura\'s port, a harbor of gray stone where the ferry from Talador ties up. Boats come and go on every tide, and so do the people who sail them.'],
    ['A lump of dull blue-grey ore, heavy for its size. It smelts on its own, with no partner ore, but it wants a hotter fire than Ambren.',
     'A lump of dull blue-gray ore, heavy for its size. It smelts on its own, with no partner ore, but it wants a hotter fire than Ambren.'],
    ['A bar of Serph, blue-grey and cold to the touch long after the forge. Harder than Ambren, and harder to work.',
     'A bar of Serph, blue-gray and cold to the touch long after the forge. Harder than Ambren, and harder to work.'],
    ['Grey flakes scraped from a rock pool the sun has dried. A pinch goes a long way.',
     'Gray flakes scraped from a rock pool the sun has dried. A pinch goes a long way.'],
];

async function swap(knex: Knex, from: (p: [string, string]) => string, to: (p: [string, string]) => string): Promise<void> {
    for (const pair of LINES) {
        let changed = 0;
        let found = 0;
        for (const [table, column] of COLUMNS) {
            if (!(await knex.schema.hasTable(table)) || !(await knex.schema.hasColumn(table, column))) continue;
            changed += await knex(table).where(column, from(pair)).update({ [column]: to(pair) });
            found += Number((await knex(table).where(column, to(pair)).count<{ n: string }[]>('* as n'))[0].n);
        }
        if (changed === 0 && found === 0) throw new Error(`american_spelling: no row holds "${from(pair).slice(0, 50)}..."`);
    }
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await swap(knex, p => p[0], p => p[1]);
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await swap(knex, p => p[1], p => p[0]);
}

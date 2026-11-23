/**
 * Which pictures the game asks for that are not in apps/client/public/images.
 *
 *   pnpm images:audit            (from apps/server; needs DATABASE_URL)
 *
 * Every path is built the way the client builds it, from the live rows:
 *   items      /images/items/<Name>.png        lib/items.ts getItemIcon (with iconOverrides.json)
 *   bestiary   /images/bestiary/<Name>.png     lib/items.ts getCreatureImage: creatures fought,
 *                                              animals hunted, and what traps catch (a trap
 *                                              catch with no portrait shows its drop instead)
 *   skills     /images/skills/<Name>Skill.png  SkillsPanel, the level-up popup
 *   badges     /images/badges/<key>.png        Badge.tsx (feats.badge_key; falls back to the glyph)
 *   minimap    /images/locations/<Island>/<Place>.jpg   MiniMap.tsx (islets have no roads, so none)
 *   scenes     /images/scenes/<Island>/<Place>.webp     lib/scenePictures.ts (islets too)
 *   maps       /images/maps/<Island>.jpg        RightPanel, MobileShell
 *
 * Read-only. Lists what is missing, then what is on disk that nothing asks for
 * (a misspelled filename usually shows up in both lists).
 */

import fs from 'fs';
import path from 'path';
import db from '../db';

const PUBLIC = path.join(__dirname, '..', '..', '..', 'client', 'public');
const OVERRIDES: Record<string, string> = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', '..', 'client', 'src', 'lib', 'iconOverrides.json'), 'utf8'),
);

const plain = (s: string) => s.replace(/ /g, '_').replace(/'/g, '');
const folderOf = (region: string | null) => (region || 'Taiar Island').replace(/ /g, '_');

interface Want { group: string; label: string; file: string; where?: string }

async function main(): Promise<void> {
    const wants: Want[] = [];

    for (const i of await db('items').where({ is_active: true }).orderBy('name').select('name', 'island')) {
        wants.push({ group: 'Item icons', label: i.name, file: `images/items/${(OVERRIDES[i.name] ?? plain(i.name))}.png`, where: i.island ?? 'Taiar Island' });
    }

    const beasts = new Map<string, string>();
    const homes = await db('fighting_spot_creatures as fc').join('fighting_spots as s', 's.id', 'fc.spot_id')
        .join('locations as l', 'l.id', 's.location_id').where('s.is_active', true).select('fc.creature_id', 'l.region');
    for (const c of await db('creatures').where({ is_active: true }).orderBy('name').select('id', 'name')) {
        beasts.set(c.name, homes.find((h: any) => h.creature_id === c.id)?.region ?? 'unplaced');
    }
    for (const a of await db('huntable_animals as a').join('locations as l', 'l.id', 'a.location_id').where('a.is_active', true).select('a.name', 'l.region')) {
        if (!beasts.has(a.name)) beasts.set(a.name, a.region);
    }
    for (const t of await db('trap_targets as t').join('locations as l', 'l.id', 't.location_id').where('t.is_active', true).select('t.name', 'l.region')) {
        if (!beasts.has(t.name)) beasts.set(t.name, `${t.region}, a trap catch: shows its drop until drawn`);
    }
    for (const [name, where] of [...beasts.entries()].sort()) {
        wants.push({ group: 'Bestiary portraits', label: name, file: `images/bestiary/${plain(name)}.png`, where });
    }

    // Skills not built yet (Exploration, Thieving) have no icon to want.
    for (const s of await db('skills').where({ is_implemented: true }).orderBy('name').select('name')) {
        wants.push({ group: 'Skill icons', label: s.name, file: `images/skills/${s.name.replace(/ /g, '_')}Skill.png` });
    }

    for (const f of await db('feats').where({ is_active: true }).whereNotNull('badge_key').orderBy('badge_key').select('name', 'badge_key')) {
        wants.push({ group: 'Feat badges', label: `${f.name} (${f.badge_key})`, file: `images/badges/${f.badge_key}.png` });
    }

    const places = await db('locations').whereNotNull('region').orderBy(['region', 'name']).select('name', 'region', 'islet_kind', 'is_accessible');
    for (const p of places) {
        if (!p.islet_kind && p.is_accessible) {
            // MiniMap.tsx keeps apostrophes; only spaces become underscores.
            wants.push({ group: 'Minimap pictures', label: p.name, file: `images/locations/${folderOf(p.region)}/${p.name.replace(/ /g, '_')}.jpg`, where: p.region });
        }
        if (p.islet_kind || p.is_accessible) {
            wants.push({ group: 'Scene pictures', label: p.islet_kind ? `${p.name} (islet)` : p.name, file: `images/scenes/${folderOf(p.region)}/${plain(p.name)}.webp`, where: p.region });
        }
    }
    for (const region of [...new Set(places.map((p: any) => p.region as string))].sort()) {
        wants.push({ group: 'Island maps', label: region, file: `images/maps/${folderOf(region)}.jpg` });
    }

    // What is missing, by group and island.
    const missing = wants.filter(w => !fs.existsSync(path.join(PUBLIC, w.file)));
    const groups = [...new Set(wants.map(w => w.group))];
    console.log(`\nChecked ${wants.length} pictures; ${missing.length} missing.\n`);
    for (const g of groups) {
        const all = wants.filter(w => w.group === g);
        const gone = missing.filter(w => w.group === g);
        console.log(`── ${g}: ${gone.length} of ${all.length} missing`);
        const byWhere = new Map<string, Want[]>();
        for (const w of gone) byWhere.set(w.where ?? '', [...(byWhere.get(w.where ?? '') ?? []), w]);
        for (const [where, list] of [...byWhere.entries()].sort()) {
            if (where) console.log(`   ${where}:`);
            for (const w of list) console.log(`      ${w.label.padEnd(36)} ${w.file}`);
        }
        console.log('');
    }

    // On disk but asked for by nothing (in the folders this checks).
    const asked = new Set(wants.map(w => w.file));
    const extra: string[] = [];
    for (const dir of ['items', 'bestiary', 'skills', 'badges', 'locations', 'scenes', 'maps']) {
        const walk = (rel: string) => {
            const abs = path.join(PUBLIC, 'images', rel);
            if (!fs.existsSync(abs)) return;
            for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
                const r = path.join(rel, e.name);
                if (e.isDirectory()) walk(r);
                else if (/\.(png|jpe?g|webp)$/i.test(e.name) && !asked.has(`images/${r.split(path.sep).join('/')}`)) extra.push(`images/${r}`);
            }
        };
        walk(dir);
    }
    if (extra.length) {
        console.log(`── On disk, asked for by nothing: ${extra.length} (old art, or a filename that does not match its row)`);
        for (const e of extra.sort()) console.log(`      ${e}`);
    }
    await db.destroy();
}

main().catch(async (err) => {
    console.error(err);
    await db.destroy();
    process.exit(1);
});

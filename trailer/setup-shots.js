// Dresses a scratch database for trailer screenshots (README.md, "Game screens"):
// levels, worn gear, a full pack, gold, and no welcome letter. Never point it at
// a real database: it overwrites the six trailer players' skills and gear.
//   DATABASE_URL=postgres://.../talaran_trailer node trailer/setup-shots.js
const { Client } = require(require.resolve('pg', { paths: [require('path').join(__dirname, '../apps/server')] }))

const XP_SCALE = 0.081, SHIFT = 30, GROWTH = Math.pow(1.33, 1 / 12)
const xpFor = L => { let t = 0; for (let i = 1; i < L; i++) t += Math.round(XP_SCALE * Math.pow(i + SHIFT, 3) * Math.pow(GROWTH, i - 1)); return t }

const LEVELS = {
    Pendragon: { Woodcutting: 24, Mining: 22, Fishing: 19, Foraging: 21, Hunting: 17, Smithing: 20, Cooking: 18, Crafting: 16, Carpentry: 23, Farming: 15, Husbandry: 14, Talar: 12, Wayfaring: 25, Melee: 19, Defense: 18, Constitution: 20 },
    Wren: { Woodcutting: 30, Mining: 12, Fishing: 33, Foraging: 28, Cooking: 31, Farming: 26, Wayfaring: 22, Melee: 8, Defense: 8, Constitution: 10 },
    Odda: { Mining: 34, Smithing: 32, Carpentry: 18, Melee: 26, Defense: 24, Constitution: 27, Wayfaring: 19 },
    Bram: { Hunting: 29, Crafting: 27, Husbandry: 25, Farming: 30, Foraging: 18, Wayfaring: 20 },
    Tamsin: { Talar: 26, Crafting: 24, Fishing: 20, Cooking: 22, Wayfaring: 28 },
    Corwin: { Melee: 31, Defense: 30, Constitution: 33, Mining: 15, Woodcutting: 14, Wayfaring: 24 },
}
const WORN = { head_item_id: 'Ambren Helm', chest_item_id: 'Ambren Cuirass', legs_item_id: 'Ambren Greaves', hands_item_id: 'Ambren Gauntlets', feet_item_id: 'Ambren Sabatons', mainhand_item_id: 'Ambren Scimitar', offhand_item_id: 'Ambren Kite Shield', back_item_id: 'Wolfskin Cloak' }
const PACK = ['Ambren Hatchet', 'Ambren Pickaxe', 'Ambren Fishing Rod', 'Lanai Hunting Bow', 'Ambren Saw', 'Lanai Mallet', 'Ambren Hoe', 'Leather Foraging Gloves',
    ['Fine Lanai Log', 38], ['Ambren Ore', 24], ['Ambren Ingot', 12], ['Lanai Planks', 30], ['Garfish', 9], ['Fish Pie', 14], ['Chanterelle Mushroom', 17], ['Blackberries', 22],
    ['Egg', 8], ['Rough Garnet', 2], ['Cut Quartz', 3], ['Deerhide', 4], ['Leather', 6], ['Ambren Arrow', 120], ['Herb Bannock', 10]]

async function main() {
    const db = new Client({ connectionString: process.env.DATABASE_URL })
    await db.connect()
    if (!/trailer|scratch|test/.test(process.env.DATABASE_URL)) throw new Error('refusing: not a scratch database')
    const id = async (table, name) => { const r = await db.query(`select id from ${table} where name = $1`, [name]); if (!r.rows[0]) throw new Error(`${table}: no ${name}`); return r.rows[0].id }
    await db.query(`update players set has_seen_welcome = true, gold = 4800`)
    for (const [player, skills] of Object.entries(LEVELS)) {
        const p = (await db.query('select id from players where username = $1', [player])).rows[0]
        if (!p) throw new Error('no player ' + player)
        for (const [skill, level] of Object.entries(skills)) {
            const sid = await id('skills', skill)
            await db.query(`insert into player_skills (player_id, skill_id, xp) values ($1, $2, $3)
                on conflict (player_id, skill_id) do update set xp = excluded.xp`, [p.id, sid, xpFor(level) + 500])
        }
    }
    const me = (await db.query(`select id from players where username = 'Pendragon'`)).rows[0].id
    const worn = {}
    for (const [col, name] of Object.entries(WORN)) worn[col] = await id('items', name)
    const cols = Object.keys(worn)
    await db.query(`update player_equipment set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} where player_id = $1`, [me, ...cols.map(c => worn[c])])
    await db.query('delete from player_inventory where player_id = $1', [me])
    for (const entry of PACK) {
        const [name, qty] = Array.isArray(entry) ? entry : [entry, 1]
        await db.query('insert into player_inventory (player_id, item_id, quantity) values ($1, $2, $3)', [me, await id('items', name), qty])
    }
    console.log('dressed')
    await db.end()
}
main().catch(e => { console.error(e.message); process.exit(1) })

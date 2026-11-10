/**
 * docs/AUDIT-2026-11-09.md, finding B4: gear changed mid-fight is no part of
 * the fight's bookkeeping. Wear is charged at the kill to what is worn at that
 * instant, so a weapon taken off for the last blow is never worn.
 *
 * Two fighters at the Docks, each with a scimitar and the creature at 1 health.
 * One keeps the blade on for the kill; the other unequips it first and lands
 * the last blow with fists.
 */
import { boot } from './lib'

async function main() {
    const h = await boot()
    const out: string[] = []
    try {
        const spot = await h.db('fighting_spots').where({ name: 'The Docks' }).first()
        const blade = await h.db('items').where({ name: 'Ambren Scimitar' }).first()
        const uses = async (id: number) => Number((await h.db('player_item_wear').where({ player_id: id, item_id: blade.id }).first('uses'))?.uses ?? 0)
        const kills = async (id: number) => Number((await h.db('player_creature_kills').where({ player_id: id }).sum('kills as n').first())?.n ?? 0)

        for (const dodge of [false, true]) {
            const p = await h.mkPlayer('Talador', { Melee: 30, Defense: 30, Constitution: 30 })
            await h.wear(p.id, 'mainhand_item_id', 'Ambren Scimitar')
            const start = await h.post(p.id, '/combat/start', { spotId: spot.id })
            // The creature is one blow from dead, and the player's swing is due now.
            const past = new Date(Date.now() - 500)
            await h.db('combat_fights').where({ player_id: p.id }).update({ enemy_hp: 0.5, player_next_at: past, settled_at: past })
            let unequip = '-'
            if (dodge) unequip = String((await h.post(p.id, '/equipment/unequip', { slot: 'mainhand' })).status)
            // Let the real tick settle it.
            await h.db('player_actions').where({ player_id: p.id }).update({ completes_at: past })
            for (let i = 0; i < 40 && (await kills(p.id)) < 1; i++) await h.sleep(250)
            const back = dodge ? String((await h.post(p.id, '/equipment/equip', { itemId: blade.id })).status) : '-'
            out.push(`${dodge ? 'blade taken off for the last blow' : 'blade kept on                    '}: start ${start.status}, unequip ${unequip}, kills ${await kills(p.id)}, scimitar uses counted ${await uses(p.id)}, re-equip ${back}`)
            await h.post(p.id, '/combat/flee', {})
        }
    } finally {
        console.log('\n===== RESULT =====\n' + out.join('\n'))
        await h.close()
    }
}
main().catch((e) => { console.error(e); process.exit(1) })

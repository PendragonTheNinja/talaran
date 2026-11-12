/**
 * docs/AUDIT-2026-11-09.md, finding B4: a kill wore whatever was in hand as it
 * landed, so a weapon taken off just before the last blow was never worn.
 * Fixed: a gear change settles the fight first, swings are counted per weapon
 * for the kill in progress, and the kill wears the one that swung most.
 *
 * Three fighters at the Docks, one kill each, the creature one blow from dead:
 *   kept on        the scimitar stays in hand          -> scimitar worn once
 *   taken off      unequipped just before the blow     -> the settle on unequip lands the
 *                                                          blow with the scimitar: worn once
 *   swapped out    five swings with the scimitar, then -> the scimitar swung most: worn once,
 *                  the last blow with fists               though it is in the pack
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
        const settleNow = async (id: number) => {
            await h.db('player_actions').where({ player_id: id }).update({ completes_at: new Date(Date.now() - 500) })
            for (let i = 0; i < 40 && (await kills(id)) < 1; i++) await h.sleep(250)
        }

        for (const mode of ['kept on', 'taken off', 'swapped out'] as const) {
            const p = await h.mkPlayer('Talador', { Melee: 30, Defense: 30, Constitution: 30 })
            await h.wear(p.id, 'mainhand_item_id', 'Ambren Scimitar')
            const start = await h.post(p.id, '/combat/start', { spotId: spot.id })
            const past = new Date(Date.now() - 500), soon = new Date(Date.now() + 60_000)
            if (mode === 'swapped out') {
                // Five swings already made with the blade; the next is not due yet.
                await h.db('combat_fights').where({ player_id: p.id }).update({
                    enemy_hp: 0.5, kill_swings: JSON.stringify({ [blade.id]: 5 }), player_next_at: soon, enemy_next_at: soon, settled_at: new Date(),
                })
                await h.post(p.id, '/equipment/unequip', { slot: 'mainhand' })
                await h.db('combat_fights').where({ player_id: p.id }).update({ player_next_at: past, enemy_next_at: soon })
            } else {
                await h.db('combat_fights').where({ player_id: p.id }).update({ enemy_hp: 0.5, player_next_at: past, settled_at: past })
                if (mode === 'taken off') await h.post(p.id, '/equipment/unequip', { slot: 'mainhand' })
            }
            await settleNow(p.id)
            const inPack = await h.qty(p.id, 'Ambren Scimitar')
            out.push(`${mode.padEnd(11)}: start ${start.status}, kills ${await kills(p.id)}, scimitar uses counted ${await uses(p.id)} (in pack ${inPack})`)
            await h.post(p.id, '/combat/flee', {})
        }
    } finally {
        console.log('\n===== RESULT =====\n' + out.join('\n'))
        await h.close()
    }
}
main().catch((e) => { console.error(e); process.exit(1) })

/**
 * docs/AUDIT-2026-11-09.md, finding A1: gathering never checked where the player stood.
 * Fixed: every gathering check asks lib/whereabouts.ts. Run against the fix,
 * every remote start below is refused (400) and nothing is paid; the last
 * block checks a player standing at the place can still start.
 * A player in Talador chops the Lanai Tree in Lanaivale, mines Granite in
 * Grundagr, forages the Sunlit Meadow in Lanaivale, hunts Deer in Eld Grove,
 * and mines another player's private (unannounced) vein in Origrund, all by
 * sending the id to the real start route. Each is then resolved by the real tick.
 */
import { boot } from './lib'

async function main() {
    const h = await boot()
    const out: string[] = []
    let origrund: any
    try {
        const where = async (id: number) => (await h.db('players as p').join('locations as l', 'l.id', 'p.current_location_id').where('p.id', id).first('l.name')).name

        // 1. Woodcutting
        const a = await h.mkPlayer('Talador')
        await h.wear(a.id, 'mainhand_item_id', 'Ambren Hatchet')
        const tree = await h.db('resource_nodes as n').join('locations as l', 'l.id', 'n.location_id').where('n.name', 'Lanai Tree').first('n.id', 'l.name as at')
        let r = await h.post(a.id, '/actions/woodcutting/start', { nodeId: tree.id })
        let done = r.status === 200 ? await h.resolveNow(a.id) : { after: null, pushes: [] }
        let card = done.pushes.find(p => p.event === 'action_complete')?.payload?.result
        out.push(`woodcutting: player stands in ${await where(a.id)}; tree is in ${tree.at}; start -> ${r.status}; tick paid ${card?.itemName} +${card?.xpAwarded} xp; Woodcutting xp now ${await h.xp(a.id, 'Woodcutting')}`)
        await h.post(a.id, '/actions/stop')

        // 2. Mining a rock
        await h.wear(a.id, 'mainhand_item_id', 'Ambren Pickaxe')
        const rock = await h.db('resource_nodes as n').join('locations as l', 'l.id', 'n.location_id').where('n.name', 'Granite Rock').orderBy('n.id').first('n.id', 'l.name as at')
        r = await h.post(a.id, '/mining/rock/start', { nodeId: rock.id })
        done = r.status === 200 ? await h.resolveNow(a.id) : { after: null, pushes: [] }
        card = done.pushes.find(p => p.event === 'action_complete')?.payload?.result
        out.push(`mining_rock: player stands in ${await where(a.id)}; rock is in ${rock.at}; start -> ${r.status}; tick paid ${card?.itemName} +${card?.xpAwarded} xp`)
        await h.post(a.id, '/actions/stop')

        // 3. Another player's private vein, in another town
        const finder = await h.mkPlayer('Origrund')
        const ore = await h.db('items').where({ name: 'Ambren Ore' }).first()
        origrund = await h.db('locations').where({ name: 'Origrund' }).first()
        const [vein] = await h.db('ore_veins').insert({
            location_id: origrund.id, ore_item_id: ore.id, total_quantity: 10, remaining_quantity: 10,
            discovered_by_player_id: finder.id, discovered_at: new Date(), is_announced: false, is_depleted: false,
        }).returning('*')
        const seen = await h.get(a.id, '/mining/veins')
        r = await h.post(a.id, '/mining/vein/start', { veinId: vein.id })
        done = r.status === 200 ? await h.resolveNow(a.id) : { after: null, pushes: [] }
        card = done.pushes.find(p => p.event === 'action_complete')?.payload?.result
        const left = (await h.db('ore_veins').where({ id: vein.id }).first()).remaining_quantity
        out.push(`mining_vein: vein ${vein.id} is in Origrund, found by player ${finder.id}, NOT announced; thief stands in ${await where(a.id)} and GET /mining/veins shows them ${seen.body?.veins?.length} veins; start -> ${r.status}; tick paid ${card?.itemName} +${card?.xpAwarded} xp; vein now ${left}/10; thief holds ${await h.qty(a.id, 'Ambren Ore')} Ambren Ore`)
        await h.post(a.id, '/actions/stop')
        await h.db('ore_veins').where({ id: vein.id }).delete()

        // 4. Foraging
        const meadow = await h.db('foraging_habitats as f').join('locations as l', 'l.id', 'f.location_id').where('f.name', 'Sunlit Meadow').first('f.id', 'l.name as at')
        r = await h.post(a.id, '/foraging/start', { habitatId: meadow.id })
        done = r.status === 200 ? await h.resolveNow(a.id) : { after: null, pushes: [] }
        card = done.pushes.find(p => p.event === 'action_complete')?.payload?.result
        out.push(`foraging: player stands in ${await where(a.id)}; habitat is in ${meadow.at}; start -> ${r.status}; tick paid ${card?.quantity}x ${card?.itemName} +${card?.xpAwarded} xp`)
        await h.post(a.id, '/actions/stop')

        // 5. Hunting
        await h.wear(a.id, 'mainhand_item_id', 'Lanai Hunting Bow')
        await h.give(a.id, 'Ambren Arrow', 20)
        const deer = await h.db('huntable_animals as f').join('locations as l', 'l.id', 'f.location_id').where('f.name', 'Deer').first('f.id', 'l.name as at')
        r = await h.post(a.id, '/hunting/start', { animalId: deer.id })
        done = r.status === 200 ? await h.resolveNow(a.id) : { after: null, pushes: [] }
        card = done.pushes.find(p => p.event === 'action_complete')?.payload?.result
        out.push(`hunting: player stands in ${await where(a.id)}; Deer are in ${deer.at}; start -> ${r.status}; tick paid +${card?.xpAwarded} Hunting xp (hit: ${card?.huntSuccess}), drops ${JSON.stringify(card?.drops)}`)
        await h.post(a.id, '/actions/stop')

        // Control: at the right place, the same starts still work.
        const local = await h.mkPlayer('Lanaivale')
        await h.wear(local.id, 'mainhand_item_id', 'Ambren Hatchet')
        r = await h.post(local.id, '/actions/woodcutting/start', { nodeId: tree.id })
        out.push(`control: player stands in ${await where(local.id)}; chop the Lanaivale tree -> ${r.status}`)
        await h.post(local.id, '/actions/stop')
        const finderStart = await h.mkPlayer('Origrund')
        await h.wear(finderStart.id, 'mainhand_item_id', 'Ambren Pickaxe')
        const [own] = await h.db('ore_veins').insert({
            location_id: origrund.id, ore_item_id: ore.id, total_quantity: 10, remaining_quantity: 10,
            discovered_by_player_id: finderStart.id, discovered_at: new Date(), is_announced: false, is_depleted: false,
        }).returning('*')
        r = await h.post(finderStart.id, '/mining/vein/start', { veinId: own.id })
        out.push(`control: the finder, standing in Origrund, mines their own unannounced vein -> ${r.status}`)
        await h.post(finderStart.id, '/actions/stop')
        await h.db('ore_veins').where({ id: own.id }).delete()
    } finally {
        console.log('\n===== RESULT =====\n' + out.join('\n'))
        await h.close()
    }
}
main().catch((e) => { console.error(e); process.exit(1) })

/**
 * docs/AUDIT-2026-11-09.md, finding E1: accepting a guild application never
 * checks that the application is still pending or that the applicant is still
 * without a guild. A player who applied to two guilds and joined the first is
 * pulled out of it when the second accepts; a rejected application can be
 * accepted later, at any time; and a guild's leader can be taken the same way.
 */
import { boot } from './lib'

async function main() {
    const h = await boot()
    const out: string[] = []
    try {
        const state = async (id: number) => {
            const p = await h.db('players').where({ id }).first('guild_id', 'guild_role')
            const rows = await h.db('guild_members').where({ player_id: id }).select('guild_id', 'role')
            return `players.guild_id=${p.guild_id} (${p.guild_role}); guild_members rows: ${rows.map((r: any) => `guild ${r.guild_id} as ${r.role}`).join(', ') || 'none'}`
        }
        const tag = Date.now().toString(36).slice(-3).toUpperCase()
        const a = await h.mkPlayer('Talador'), b = await h.mkPlayer('Talador'), x = await h.mkPlayer('Talador')
        const ga = (await h.post(a.id, '/guilds/create', { name: `Audit Alders ${tag}`, tag: `A${tag}`, description: '' }))
        const gb = (await h.post(b.id, '/guilds/create', { name: `Audit Birches ${tag}`, tag: `B${tag}`, description: '' }))
        const guildA = (await h.db('players').where({ id: a.id }).first('guild_id')).guild_id
        const guildB = (await h.db('players').where({ id: b.id }).first('guild_id')).guild_id
        out.push(`guild A = ${guildA} (create ${ga.status}), guild B = ${guildB} (create ${gb.status})`)

        // 1. Applied to both, joined A, then B accepts.
        await h.post(x.id, '/guilds/apply', { guildId: guildA, message: '' })
        await h.post(x.id, '/guilds/apply', { guildId: guildB, message: '' })
        const appA = await h.db('guild_applications').where({ guild_id: guildA, player_id: x.id }).first()
        const appB = await h.db('guild_applications').where({ guild_id: guildB, player_id: x.id }).first()
        let r = await h.post(a.id, `/guilds/applications/${appA.id}/respond`, { accept: true })
        out.push(`A accepts x -> ${r.status}; x: ${await state(x.id)}`)
        r = await h.post(b.id, `/guilds/applications/${appB.id}/respond`, { accept: true })
        out.push(`B accepts x's older application -> ${r.status}; x: ${await state(x.id)}`)

        // 2. A rejected application, accepted afterwards.
        const y = await h.mkPlayer('Talador')
        await h.post(y.id, '/guilds/apply', { guildId: guildB, message: '' })
        const appY = await h.db('guild_applications').where({ guild_id: guildB, player_id: y.id }).first()
        r = await h.post(b.id, `/guilds/applications/${appY.id}/respond`, { accept: false })
        const rejected = (await h.db('guild_applications').where({ id: appY.id }).first()).status
        r = await h.post(b.id, `/guilds/applications/${appY.id}/respond`, { accept: true })
        out.push(`y's application was ${rejected}; B accepts it afterwards -> ${r.status}; y: ${await state(y.id)}`)

        // 3. The leader of another guild, who once applied to B.
        const c = await h.mkPlayer('Talador')
        await h.post(c.id, '/guilds/apply', { guildId: guildB, message: '' })
        const appC = await h.db('guild_applications').where({ guild_id: guildB, player_id: c.id }).first()
        await h.post(c.id, '/guilds/create', { name: `Audit Cedars ${tag}`, tag: `C${tag}`, description: '' })
        const guildC = (await h.db('players').where({ id: c.id }).first('guild_id')).guild_id
        r = await h.post(b.id, `/guilds/applications/${appC.id}/respond`, { accept: true })
        const leaderOfC = (await h.db('guilds').where({ id: guildC }).first('leader_id')).leader_id
        out.push(`c founded guild ${guildC}, then B accepts c's old application -> ${r.status}; c: ${await state(c.id)}; guild ${guildC} leader_id is still ${leaderOfC} (c is ${c.id})`)

        await h.db('guilds').whereIn('id', [guildA, guildB, guildC]).delete()
    } finally {
        console.log('\n===== RESULT =====\n' + out.join('\n'))
        await h.close()
    }
}
main().catch((e) => { console.error(e); process.exit(1) })

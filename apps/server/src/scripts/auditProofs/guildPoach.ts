/**
 * docs/AUDIT-2026-11-09.md, finding A2: accepting a guild application never
 * checked that the application was still pending or that the applicant was
 * still without a guild, so an officer could pull a player out of their guild
 * with an old application, a rejected one, or one sent before they founded
 * their own. Fixed with services/guildRanks.ts joinGuildWithin.
 *
 * Against the fix every poaching case is refused and leaves the player where
 * they were; a normal accept, a re-application after a refusal and a guild
 * founded afterwards still work; and two guilds accepting one player at the
 * same moment put them in exactly one.
 */
import { boot } from './lib'

async function main() {
    const h = await boot()
    const out: string[] = []
    const guildIds: number[] = []
    try {
        const state = async (id: number) => {
            const p = await h.db('players').where({ id }).first('guild_id', 'guild_role')
            const rows = await h.db('guild_members').where({ player_id: id }).select('guild_id', 'role')
            return `players.guild_id=${p.guild_id} (${p.guild_role}); member rows: ${rows.map((r: any) => `${r.guild_id}/${r.role}`).join(', ') || 'none'}`
        }
        const guildOf = async (id: number) => (await h.db('players').where({ id }).first('guild_id')).guild_id
        const appOf = (guildId: number, playerId: number) => h.db('guild_applications').where({ guild_id: guildId, player_id: playerId }).first()
        const tag = Date.now().toString(36).slice(-3).toUpperCase()
        const found = async (p: { id: number }, name: string, t: string) => {
            const r = await h.post(p.id, '/guilds/create', { name: `Audit ${name} ${tag}`, tag: `${t}${tag}`.slice(0, 5), description: '' })
            const g = await guildOf(p.id); if (g) guildIds.push(g); return { r, g }
        }
        const a = await h.mkPlayer('Talador'), b = await h.mkPlayer('Talador'), x = await h.mkPlayer('Talador')
        const { g: guildA } = await found(a, 'Alders', 'A')
        const { g: guildB } = await found(b, 'Birches', 'B')

        // 1. Applied to both, joined A; B's accept of the older application is refused.
        await h.post(x.id, '/guilds/apply', { guildId: guildA, message: '' })
        await h.post(x.id, '/guilds/apply', { guildId: guildB, message: '' })
        const appA = await appOf(guildA, x.id), appB = await appOf(guildB, x.id)
        let r = await h.post(a.id, `/guilds/applications/${appA.id}/respond`, { accept: true })
        out.push(`[control] A accepts x -> ${r.status}; x: ${await state(x.id)}`)
        r = await h.post(b.id, `/guilds/applications/${appB.id}/respond`, { accept: true })
        out.push(`[must refuse] B accepts x's older application -> ${r.status} ${r.body?.error ?? ''}; x: ${await state(x.id)}; that application is now ${(await appOf(guildB, x.id)).status}`)

        // 2. A rejected application cannot be accepted later; applying again reopens it.
        const y = await h.mkPlayer('Talador')
        await h.post(y.id, '/guilds/apply', { guildId: guildB, message: 'first' })
        const appY = await appOf(guildB, y.id)
        await h.post(b.id, `/guilds/applications/${appY.id}/respond`, { accept: false })
        r = await h.post(b.id, `/guilds/applications/${appY.id}/respond`, { accept: true })
        out.push(`[must refuse] B accepts y's rejected application -> ${r.status} ${r.body?.error ?? ''}; y: ${await state(y.id)}`)
        await h.post(y.id, '/guilds/apply', { guildId: guildB, message: 'second' })
        const again = await appOf(guildB, y.id)
        r = await h.post(b.id, `/guilds/applications/${again.id}/respond`, { accept: true })
        out.push(`[control] y applies again (status ${again.status}, "${again.message}"); B accepts -> ${r.status}; y: ${await state(y.id)}`)

        // 3. The founder of another guild cannot be taken with an old application.
        const c = await h.mkPlayer('Talador')
        await h.post(c.id, '/guilds/apply', { guildId: guildB, message: '' })
        const appC = await appOf(guildB, c.id)
        const { r: made, g: guildC } = await found(c, 'Cedars', 'C')
        out.push(`[control] c, with an application open to B, founds guild ${guildC} -> ${made.status}; c's application to B is now ${(await appOf(guildB, c.id)).status}`)
        r = await h.post(b.id, `/guilds/applications/${appC.id}/respond`, { accept: true })
        out.push(`[must refuse] B accepts c's old application -> ${r.status} ${r.body?.error ?? ''}; c: ${await state(c.id)}`)

        // 4. Two guilds accept one player at the same moment, ten rounds.
        let both = 0, neither = 0, one = 0, errors = 0
        for (let round = 0; round < 10; round++) {
            const z = await h.mkPlayer('Talador')
            await h.post(z.id, '/guilds/apply', { guildId: guildA, message: '' })
            await h.post(z.id, '/guilds/apply', { guildId: guildB, message: '' })
            const za = await appOf(guildA, z.id), zb = await appOf(guildB, z.id)
            const [ra, rb] = await Promise.all([
                h.post(a.id, `/guilds/applications/${za.id}/respond`, { accept: true }),
                h.post(b.id, `/guilds/applications/${zb.id}/respond`, { accept: true }),
            ])
            if (ra.status >= 500 || rb.status >= 500) errors++
            const rows = await h.db('guild_members').where({ player_id: z.id }).count('* as n').first()
            const n = Number(rows?.n ?? 0)
            if (n === 1) one++; else if (n === 0) neither++; else both++
        }
        out.push(`[race] two guilds accept one player at once, 10 rounds: in one guild ${one}, in two ${both}, in none ${neither}, server errors ${errors}`)
    } finally {
        if (guildIds.length) await h.db('guilds').whereIn('id', guildIds).delete()
        console.log('\n===== RESULT =====\n' + out.join('\n'))
        await h.close()
    }
}
main().catch((e) => { console.error(e); process.exit(1) })

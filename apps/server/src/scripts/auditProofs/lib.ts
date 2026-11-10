/**
 * Harness for the proofs in docs/AUDIT-2026-11-09.md. Boots the REAL app
 * in-process (real routes, real middleware, real HTTP) with the REAL game
 * tick, against a throwaway database that has the game content loaded, and
 * gives small helpers: make a player, call a route, make an action due and wait
 * for the tick to resolve it.
 *
 * It never wipes anything: it only adds players named zzaudit_* and removes
 * them when it closes. It still refuses any database whose name does not
 * contain "audit" or "proof", so it cannot be pointed at a real one by mistake.
 *
 *   DATABASE_URL=postgres://.../talaran_audit JWT_SECRET=anything \
 *     npx ts-node --transpile-only src/scripts/auditProofs/<file>.ts
 */
import 'dotenv/config'
import type { AddressInfo } from 'net'

if (!/audit|proof/i.test(new URL(process.env.DATABASE_URL || 'postgres://x/none').pathname)) {
    console.error('refused: DATABASE_URL must be a throwaway database with "audit" or "proof" in its name, with the game content loaded')
    process.exit(2)
}
delete process.env.RESEND_API_KEY

export interface Push { playerId: number; event: string; payload: any }

export async function boot() {
    const { default: db } = await import('../../db')
    const { server, io } = await import('../../index')
    const { issueSession } = await import('../../lib/sessions')
    const { startGameTick } = await import('../../services/gameTick')
    const { onPlayerPush, setRealtimeServer } = await import('../../lib/realtime')
    const { setUpNewPlayerWithin } = await import('../../services/newPlayer')
    setRealtimeServer(io)
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const port = (server.address() as AddressInfo).port
    startGameTick(io)

    const pushes: Push[] = []
    onPlayerPush((playerId, event, payload) => { pushes.push({ playerId, event, payload }) })

    const tokens = new Map<number, string>()
    const call = async (method: string, playerId: number, path: string, body?: unknown) => {
        if (!tokens.has(playerId)) tokens.set(playerId, await issueSession(playerId))
        const r = await fetch(`http://127.0.0.1:${port}/api${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.get(playerId)}` },
            body: body === undefined ? undefined : JSON.stringify(body),
        })
        const json = await r.json().catch(() => null) as any
        return { status: r.status, body: json }
    }
    const post = (playerId: number, path: string, body: unknown = {}) => call('POST', playerId, path, body)
    const get = (playerId: number, path: string) => call('GET', playerId, path)

    let n = 0
    /** A fresh character, set up as registration does, standing at `locationName`. */
    const mkPlayer = async (locationName: string, levels: Record<string, number> = {}) => {
        const { xpForLevel } = await import('../../services/xp')
        const loc = await db('locations').where({ name: locationName }).first()
        if (!loc) throw new Error(`no location ${locationName}`)
        const username = `zzaudit_${Date.now().toString(36)}_${++n}`
        const id: number = await db.transaction(async (trx) => {
            const [row] = await trx('players').insert({
                username, email: `${username}@example.invalid`, password_hash: 'x',
                current_location_id: loc.id, last_seen: new Date(), last_bot_check: new Date(), last_login: new Date(),
            }).returning('id')
            const pid = row.id ?? row
            await setUpNewPlayerWithin(trx, pid)
            await trx('player_equipment').insert({ player_id: pid }).onConflict('player_id').ignore()
            return pid
        })
        for (const [skill, level] of Object.entries(levels)) {
            const s = await db('skills').where({ name: skill }).first()
            if (!s) throw new Error(`no skill ${skill}`)
            await db('player_skills').where({ player_id: id, skill_id: s.id }).update({ xp: xpForLevel(level) })
        }
        return { id, username, locationId: loc.id as number }
    }
    const give = async (playerId: number, itemName: string, quantity: number) => {
        const item = await db('items').where({ name: itemName }).first()
        if (!item) throw new Error(`no item ${itemName}`)
        await db.raw(`INSERT INTO player_inventory (player_id, item_id, quantity) VALUES (?, ?, ?)
            ON CONFLICT (player_id, item_id) DO UPDATE SET quantity = player_inventory.quantity + EXCLUDED.quantity`,
            [playerId, item.id, quantity])
        return item.id as number
    }
    /** Put an item straight into a worn slot (bypassing the equip route). */
    const wear = async (playerId: number, column: string, itemName: string) => {
        const item = await db('items').where({ name: itemName }).first()
        if (!item) throw new Error(`no item ${itemName}`)
        await db('player_equipment').where({ player_id: playerId }).update({ [column]: item.id })
        return item.id as number
    }
    const qty = async (playerId: number, itemName: string) => {
        const r = await db('player_inventory as pi').join('items as i', 'i.id', 'pi.item_id')
            .where('pi.player_id', playerId).where('i.name', itemName).first('pi.quantity')
        return r ? Number(r.quantity) : 0
    }
    const xp = async (playerId: number, skill: string) => {
        const r = await db('player_skills as ps').join('skills as s', 's.id', 'ps.skill_id')
            .where('ps.player_id', playerId).where('s.name', skill).first('ps.xp')
        return r ? Number(r.xp) : 0
    }
    const action = (playerId: number) => db('player_actions').where({ player_id: playerId }).first()
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    /**
     * Make the player's action due now and wait for the real tick to resolve it:
     * the row is gone, or its completes_at is in the future and no longer the lease.
     */
    const resolveNow = async (playerId: number, timeoutMs = 9000) => {
        const before = await action(playerId)
        if (!before) throw new Error('no action to resolve')
        const mark = pushes.length
        await db('player_actions').where({ id: before.id }).update({ completes_at: new Date(Date.now() - 1000) })
        const t0 = Date.now()
        while (Date.now() - t0 < timeoutMs) {
            await sleep(150)
            const a = await action(playerId)
            if (!a) break
            const due = new Date(a.completes_at).getTime()
            // resolved and rescheduled: due in the future but well under the 5-minute lease,
            // or frozen for a bot check
            if (a.bot_check_pending) break
            if (due > Date.now() && due - Date.now() < 280_000) break
        }
        await sleep(250)
        return { after: await action(playerId), pushes: pushes.slice(mark).filter(p => p.playerId === playerId) }
    }
    const close = async () => {
        await db('players').where('username', 'like', 'zzaudit_%').delete().catch((e: any) => console.error('cleanup:', String(e).slice(0, 200)))
        io.close(); server.close()
        await db.destroy()
        setTimeout(() => process.exit(0), 200)
    }
    return { db, post, get, mkPlayer, give, wear, qty, xp, action, resolveNow, sleep, pushes, close }
}

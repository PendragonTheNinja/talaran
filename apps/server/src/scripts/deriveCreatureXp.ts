/**
 * Derive every creature's XP per kill from its level (docs/combat-spec.md §8).
 *
 *   pnpm combat:derive            report only
 *   pnpm combat:derive -- --write also fill creatures.xp_per_kill
 *
 * XP per kill is never hand-set. It is the band at the creature's level over
 * the cycle a level-matched grunt kill takes (xpPerKillAt in combatSim.ts, on
 * lib/combatMath.ts), times the row's xp_multiplier. A creature's profile does
 * not change it: a fragile creature pays the same per kill and more per hour,
 * which is the point of profiles. `combatSim.ts roster` checks the per-hour
 * spread stays within the ±15% guardrail.
 *
 * Run it after changing a creature's level or multiplier, or the formulas.
 * Needs JWT_SECRET set (the band rate comes from services/farming.ts).
 */
import db from '../db';
import { xpPerKillAt } from './combatSim';

async function main(): Promise<void> {
    const write = process.argv.includes('--write');
    const creatures = await db('creatures').orderBy(['level', 'name']);
    const byLevel = new Map<number, number>();
    const rows: string[] = [];
    let changed = 0;

    for (const c of creatures) {
        if (!byLevel.has(c.level)) byLevel.set(c.level, xpPerKillAt(c.level));
        const xp = Math.max(1, Math.round(byLevel.get(c.level)! * Number(c.xp_multiplier ?? 1)));
        const was = c.xp_per_kill;
        if (was !== xp) changed++;
        rows.push(`${c.name.padEnd(18)} level ${String(c.level).padStart(3)}  x${Number(c.xp_multiplier ?? 1).toFixed(2)}  ${String(xp).padStart(5)} xp${was === xp ? '' : `  (was ${was ?? 'unset'})`}`);
        if (write && was !== xp) await db('creatures').where({ id: c.id }).update({ xp_per_kill: xp });
    }

    console.log(rows.join('\n'));
    console.log(`\n${creatures.length} creatures, ${changed} ${write ? 'written' : 'would change (run with --write)'}.`);
    await db.destroy();
}

main().catch(async (err) => {
    console.error(err);
    await db.destroy();
    process.exit(1);
});

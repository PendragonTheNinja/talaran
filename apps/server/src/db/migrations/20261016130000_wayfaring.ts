import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Agility and Equitation become one skill, Wayfaring (Nathan, 2026-10-16).
// Players disliked choosing between walking and riding to level travel; now
// both pay the same skill. Walking pays more per trip and finds things on the
// road, riding is faster (services/travel.ts, the travel branch of gameTick.ts).
//
//   • Agility is renamed Wayfaring in place, so its id and every player's row
//     carry over.
//   • Each player's Equitation XP is ADDED to it (Nathan: combine the XP), and
//     the same for the weekly snapshots, so the merge does not read as a week's
//     gain on the highscores.
//   • Equitation is deleted; its player_skills and skill_snapshots rows go with
//     it (ON DELETE CASCADE) once their XP has moved.
//   • Every column that names a skill and points at either old name now says
//     Wayfaring (recipe tabs, road gates, buffs, quests, world events, the
//     travel log). The hall of records (skill_milestone_firsts) is left alone:
//     "first to reach Agility 13" stays true as history.
//   • Feats: the two Agility feats now ask for Wayfaring (Apprentice Runner
//     becomes Apprentice Wayfarer; Master of the Road keeps its name). The two
//     Equitation feats are hidden, not switched off: nobody can earn them now,
//     and anyone who already has one still sees it (an inactive feat would
//     vanish from their list).
//
// Everything changed is copied into wayfaring_merge_backup first, so down()
// can split the XP back: Equitation gets exactly what it had, and Agility gets
// the rest, including anything earned since the merge. down() drops the copy.

const BACKUP = 'wayfaring_merge_backup';
const OLD_NAMES = ['Agility', 'Equitation'];
const NEW_NAME = 'Wayfaring';
const DESCRIPTION = 'The road, on foot or in the saddle. Walking teaches more and finds more by the wayside; a horse gets you there sooner.';

// Every column that holds a skill by name: [table, column].
const NAME_COLUMNS: Array<[string, string]> = [
    ['items', 'buff_skill'],
    ['location_connections', 'required_skill'],
    ['player_buffs', 'skill'],
    ['quests', 'skill'],
    ['recipes', 'skill'],
    ['recipes', 'for_skill'],
    ['resource_nodes', 'skill'],
    ['world_event_types', 'skill'],
    ['world_events', 'skill'],
    ['travel_log', 'skill_name'],
];

const FEAT_TEXT: Record<string, { name: string; description: string }> = {
    'apprentice-runner': { name: 'Apprentice Wayfarer', description: 'Reach Wayfaring 25.' },
    'master-runner': { name: 'Master of the Road', description: 'Reach Wayfaring 100.' },
};

async function ensureBackupTable(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(BACKUP)) return;
    await knex.schema.createTable(BACKUP, (t) => {
        t.increments('id').primary();
        // 'skill' | 'snapshot' | 'skill_row' | 'name' | 'quest_reward' | 'feat'
        t.string('kind', 20).notNullable();
        t.integer('player_id').nullable();
        t.timestamp('snapshot_date', { useTz: true }).nullable();
        t.bigInteger('agility_xp').nullable();
        t.bigInteger('equitation_xp').nullable();
        t.jsonb('data').nullable();
    });
}

async function present(knex: Knex, table: string, column: string): Promise<boolean> {
    return (await knex.schema.hasTable(table)) && (await knex.schema.hasColumn(table, column));
}

export async function up(knex: Knex): Promise<void> {
    await ensureBackupTable(knex);

    // A fresh database before content:import (lib/migrationContent.ts).
    if (!(await hasContent(knex))) return;

    await knex.transaction(async (trx) => {
        const agility = await trx('skills').where({ name: 'Agility' }).first();
        const equitation = await trx('skills').where({ name: 'Equitation' }).first();
        const wayfaring = await trx('skills').where({ name: NEW_NAME }).first();

        // Already merged (a re-run): nothing to do.
        if (wayfaring && !agility && !equitation) return;
        if (wayfaring) throw new Error('wayfaring: Wayfaring exists beside Agility or Equitation; merge by hand');
        if (!agility) throw new Error('wayfaring: no Agility skill to rename');

        // ── XP: Equitation's added to Agility's ─────────────────────────
        if (equitation) {
            await trx.raw(`
                INSERT INTO ${BACKUP} (kind, player_id, agility_xp, equitation_xp)
                SELECT 'skill', p.player_id, a.xp, e.xp
                FROM (SELECT DISTINCT player_id FROM player_skills WHERE skill_id IN (?, ?)) p
                LEFT JOIN player_skills a ON a.player_id = p.player_id AND a.skill_id = ?
                LEFT JOIN player_skills e ON e.player_id = p.player_id AND e.skill_id = ?`,
                [agility.id, equitation.id, agility.id, equitation.id]);
            await trx.raw(`
                INSERT INTO ${BACKUP} (kind, player_id, snapshot_date, agility_xp, equitation_xp)
                SELECT 'snapshot', p.player_id, p.snapshot_date, a.xp_at_snapshot, e.xp_at_snapshot
                FROM (SELECT DISTINCT player_id, snapshot_date FROM skill_snapshots WHERE skill_id IN (?, ?)) p
                LEFT JOIN skill_snapshots a ON a.player_id = p.player_id AND a.snapshot_date = p.snapshot_date AND a.skill_id = ?
                LEFT JOIN skill_snapshots e ON e.player_id = p.player_id AND e.snapshot_date = p.snapshot_date AND e.skill_id = ?`,
                [agility.id, equitation.id, agility.id, equitation.id]);
            await trx(BACKUP).insert({ kind: 'skill_row', data: JSON.stringify(equitation) });

            await trx.raw(`
                INSERT INTO player_skills (player_id, skill_id, xp)
                SELECT player_id, ?, xp FROM player_skills WHERE skill_id = ?
                ON CONFLICT (player_id, skill_id)
                DO UPDATE SET xp = player_skills.xp + EXCLUDED.xp, updated_at = now()`,
                [agility.id, equitation.id]);
            await trx.raw(`
                INSERT INTO skill_snapshots (player_id, skill_id, xp_at_snapshot, snapshot_date)
                SELECT player_id, ?, xp_at_snapshot, snapshot_date FROM skill_snapshots WHERE skill_id = ?
                ON CONFLICT (player_id, skill_id, snapshot_date)
                DO UPDATE SET xp_at_snapshot = skill_snapshots.xp_at_snapshot + EXCLUDED.xp_at_snapshot`,
                [agility.id, equitation.id]);

            await trx('skills').where({ id: equitation.id }).delete();
        }

        await trx(BACKUP).insert({ kind: 'skill_row', data: JSON.stringify(agility) });
        await trx('skills').where({ id: agility.id }).update({ name: NEW_NAME, description: DESCRIPTION, display_order: 16 });

        // ── Columns that name a skill ──────────────────────────────────
        for (const [table, column] of NAME_COLUMNS) {
            if (!(await present(trx, table, column))) continue;
            await trx.raw(`
                INSERT INTO ${BACKUP} (kind, data)
                SELECT 'name', jsonb_build_object('table', ?::text, 'column', ?::text, 'id', id, 'old', ??)
                FROM ?? WHERE ?? IN (?, ?)`,
                [table, column, column, table, column, ...OLD_NAMES]);
            await trx(table).whereIn(column, OLD_NAMES).update({ [column]: NEW_NAME });
        }

        // quests.reward_skill_xp is JSON text: [{ skill, xp }].
        if (await present(trx, 'quests', 'reward_skill_xp')) {
            const quests = await trx('quests').whereNotNull('reward_skill_xp').select('id', 'reward_skill_xp');
            for (const q of quests) {
                const list = JSON.parse(q.reward_skill_xp);
                if (!Array.isArray(list) || !list.some((r: any) => OLD_NAMES.includes(r?.skill))) continue;
                await trx(BACKUP).insert({ kind: 'quest_reward', data: JSON.stringify({ id: q.id, old: q.reward_skill_xp }) });
                const merged = new Map<string, number>();
                for (const r of list) {
                    const skill = OLD_NAMES.includes(r.skill) ? NEW_NAME : r.skill;
                    merged.set(skill, (merged.get(skill) ?? 0) + Number(r.xp || 0));
                }
                await trx('quests').where({ id: q.id }).update({
                    reward_skill_xp: JSON.stringify([...merged].map(([skill, xp]) => ({ skill, xp }))),
                });
            }
        }

        // ── Feats ──────────────────────────────────────────────────────
        const feats = await trx('feats').where({ criterion_kind: 'skill' }).whereIn('criterion_target', OLD_NAMES);
        for (const feat of feats) {
            await trx(BACKUP).insert({ kind: 'feat', data: JSON.stringify(feat) });
            if (feat.criterion_target === 'Agility') {
                await trx('feats').where({ id: feat.id }).update({
                    criterion_target: NEW_NAME,
                    ...(FEAT_TEXT[feat.slug] ?? { description: `Reach Wayfaring ${feat.criterion_value}.` }),
                });
            } else {
                await trx('feats').where({ id: feat.id }).update({ is_hidden: true });
            }
        }
    });
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(BACKUP))) return;

    await knex.transaction(async (trx) => {
        const wayfaring = await trx('skills').where({ name: NEW_NAME }).first();
        const rows = await trx(BACKUP).orderBy('id');
        const of = (kind: string) => rows.filter((r: any) => r.kind === kind);

        // Feats, quest rewards and name columns back as they were.
        for (const r of of('feat')) {
            const { id, ...old } = r.data;
            await trx('feats').where({ id }).update({
                name: old.name, description: old.description,
                criterion_target: old.criterion_target, is_hidden: old.is_hidden,
            });
        }
        for (const r of of('quest_reward')) {
            await trx('quests').where({ id: r.data.id }).update({ reward_skill_xp: r.data.old });
        }
        for (const r of of('name')) {
            const { table, column, id, old } = r.data;
            if (await present(trx, table, column)) await trx(table).where({ id }).update({ [column]: old });
        }

        if (wayfaring) {
            const skillRows = of('skill_row').map((r: any) => r.data);
            const agilityRow = skillRows.find((s: any) => s.name === 'Agility');
            const equitationRow = skillRows.find((s: any) => s.name === 'Equitation');

            await trx('skills').where({ id: wayfaring.id }).update({
                name: 'Agility',
                description: agilityRow?.description ?? null,
                display_order: agilityRow?.display_order ?? 16,
            });

            if (equitationRow) {
                // Back with its old id, so nothing that remembered it is wrong.
                await trx('skills').insert({
                    id: equitationRow.id, name: 'Equitation', type: equitationRow.type,
                    description: equitationRow.description, icon: equitationRow.icon,
                    is_active: equitationRow.is_active, display_order: equitationRow.display_order,
                    is_implemented: equitationRow.is_implemented,
                });
                await trx.raw(`SELECT setval(pg_get_serial_sequence('skills', 'id'), (SELECT MAX(id) FROM skills))`);

                // Equitation gets exactly what it had; Agility keeps the rest,
                // including whatever was earned while the two were one.
                for (const r of of('skill')) {
                    const eq = r.equitation_xp === null ? null : Number(r.equitation_xp);
                    if (eq === null) continue;
                    await trx('player_skills').insert({ player_id: r.player_id, skill_id: equitationRow.id, xp: eq });
                    await trx('player_skills').where({ player_id: r.player_id, skill_id: wayfaring.id })
                        .update({ xp: trx.raw('GREATEST(0, xp - ?)', [eq]) });
                    if (r.agility_xp === null) {
                        await trx('player_skills').where({ player_id: r.player_id, skill_id: wayfaring.id, xp: 0 }).delete();
                    }
                }
                for (const r of of('snapshot')) {
                    const eq = r.equitation_xp === null ? null : Number(r.equitation_xp);
                    if (eq === null) continue;
                    await trx('skill_snapshots').insert({
                        player_id: r.player_id, skill_id: equitationRow.id, xp_at_snapshot: eq, snapshot_date: r.snapshot_date,
                    });
                    const where = { player_id: r.player_id, skill_id: wayfaring.id, snapshot_date: r.snapshot_date };
                    if (r.agility_xp === null) await trx('skill_snapshots').where(where).delete();
                    else await trx('skill_snapshots').where(where).update({ xp_at_snapshot: r.agility_xp });
                }
            }
        }
    });

    await knex.schema.dropTableIfExists(BACKUP);
}

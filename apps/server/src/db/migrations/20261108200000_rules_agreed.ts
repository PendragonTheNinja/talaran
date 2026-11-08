import type { Knex } from 'knex';

// The rules (apps/client/src/components/RulesPage.tsx): every new account, and
// every guest who claims a character, agrees to them, and the server keeps
// when (routes/auth.ts, register and upgrade). Accounts made before this have
// no date: they were never asked.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('players', 'rules_agreed_at'))) {
        await knex.schema.alterTable('players', (t) => {
            t.timestamp('rules_agreed_at', { useTz: true }).nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('players', 'rules_agreed_at')) {
        await knex.schema.alterTable('players', (t) => { t.dropColumn('rules_agreed_at'); });
    }
}

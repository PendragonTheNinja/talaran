import type { Knex } from 'knex';

// The pack refreshes itself whenever anything changes it (Nathan, 2026-11-02).
//
// The client reloads its pack on the `inventory_changed` push. That push was
// sent by hand, path by path, and many paths never sent it: quest rewards
// (addItemToInventoryWithin), the admin Give Item tool, and the thirty-odd
// services that write player_inventory directly. The player had to refresh.
//
// Now the database says so itself. A row trigger on every table the pack is
// drawn from calls pg_notify('inventory_changed', <player id>). Postgres
// delivers a NOTIFY only when its transaction COMMITS, never on rollback, and
// folds identical notices inside one transaction into one, so a death pile of
// forty stacks is a single notice. lib/inventoryNotify.ts LISTENs on one
// dedicated connection and pushes `inventory_changed` to that player's socket.
// Nothing that writes these tables has to remember anything.
//
//   player_inventory        the pack
//   player_liquids          open buckets, drawn as pinned tiles in the pack
//   player_talar_open_gem   part-filled gems, drawn the same way

const TABLES = ['player_inventory', 'player_liquids', 'player_talar_open_gem'];
const FN = 'notify_inventory_changed';
const trigger = (table: string) => `${table}_notify_inventory_changed`;

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        CREATE OR REPLACE FUNCTION ${FN}() RETURNS trigger AS $$
        BEGIN
            IF TG_OP = 'INSERT' THEN
                PERFORM pg_notify('inventory_changed', NEW.player_id::text);
            ELSIF TG_OP = 'DELETE' THEN
                PERFORM pg_notify('inventory_changed', OLD.player_id::text);
            ELSE
                PERFORM pg_notify('inventory_changed', NEW.player_id::text);
                IF NEW.player_id IS DISTINCT FROM OLD.player_id THEN
                    PERFORM pg_notify('inventory_changed', OLD.player_id::text);
                END IF;
            END IF;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
    `);
    for (const table of TABLES) {
        if (!(await knex.schema.hasTable(table))) continue;
        await knex.raw(`DROP TRIGGER IF EXISTS ${trigger(table)} ON ${table}`);
        await knex.raw(`
            CREATE TRIGGER ${trigger(table)}
            AFTER INSERT OR UPDATE OR DELETE ON ${table}
            FOR EACH ROW EXECUTE FUNCTION ${FN}()
        `);
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const table of TABLES) {
        if (await knex.schema.hasTable(table)) await knex.raw(`DROP TRIGGER IF EXISTS ${trigger(table)} ON ${table}`);
    }
    await knex.raw(`DROP FUNCTION IF EXISTS ${FN}()`);
}

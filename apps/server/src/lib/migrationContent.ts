import type { Knex } from 'knex';

// A fresh database (`pnpm db:build`, CI, a new server) runs the migrations
// BEFORE its content is imported (CLAUDE.md §3, Fresh database). A content
// migration finds no skills, items or locations there and must skip its
// content, still creating its tables and columns; the content arrives with
// `pnpm content:import`. Anywhere with content, a missing reference is still a
// loud error. No locations is the sign, as in 20260930040000_museums.

/** True once content is present; false on a fresh database before content:import. */
export async function hasContent(knex: Knex): Promise<boolean> {
    const [{ n }] = await knex('locations').count('* as n');
    return Number(n) > 0;
}

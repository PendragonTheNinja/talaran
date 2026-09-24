/**
 * How production runs the server. Start it from here, not by hand:
 *
 *     pm2 start ecosystem.config.cjs      # first time only
 *     pm2 restart talaran-server          # every deploy after
 *     pm2 save                            # so a reboot brings it back the same way
 *
 * ONE process, in fork mode, always (audit H2). Several things assume it:
 *
 *   - The game tick. It now claims due actions atomically (FOR UPDATE SKIP
 *     LOCKED), so two processes would no longer resolve the same action twice,
 *     but each would still run every sweep, trap roll and vein announcement.
 *   - The session cache in lib/sessions.ts. A ban clears it at once in the
 *     process that issued the ban; a second process would honour the old
 *     verdict for up to thirty seconds.
 *   - Presence and socket rooms, which live in process memory.
 *
 * Cluster mode or `instances > 1` breaks all three quietly. If the server ever
 * needs to scale out, those move to shared storage first.
 */
module.exports = {
    apps: [
        {
            name: 'talaran-server',
            cwd: './apps/server',
            script: 'dist/index.js',
            exec_mode: 'fork',
            instances: 1,
            autorestart: true,
            // A crash loop should back off rather than hammer the database.
            exp_backoff_restart_delay: 200,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};

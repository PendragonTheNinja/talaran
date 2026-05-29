-- Talaran Alpha Launch DB Wipe
-- Keeps: game content, news posts, announcement forum threads/posts
-- Wipes: all player data, non-announcement forum content

-- Disable foreign key checks temporarily
SET session_replication_role = 'replica';

-- Wipe trade data
TRUNCATE TABLE trade_gold CASCADE;
TRUNCATE TABLE trade_offers CASCADE;
TRUNCATE TABLE trades CASCADE;

-- Wipe ground items
TRUNCATE TABLE ground_items CASCADE;

-- Wipe player settings
TRUNCATE TABLE player_settings CASCADE;

-- Wipe skill snapshots
TRUNCATE TABLE skill_snapshots CASCADE;

-- Wipe forum votes and polls
TRUNCATE TABLE forum_post_votes CASCADE;
TRUNCATE TABLE forum_poll_votes CASCADE;
TRUNCATE TABLE forum_poll_options CASCADE;
TRUNCATE TABLE forum_polls CASCADE;

-- Wipe forum content except Announcements category
DELETE FROM forum_posts WHERE thread_id IN (
  SELECT id FROM forum_threads WHERE category_id NOT IN (
    SELECT id FROM forum_categories WHERE name = 'Announcements'
  )
);
DELETE FROM forum_threads WHERE category_id NOT IN (
  SELECT id FROM forum_categories WHERE name = 'Announcements'
);

-- Wipe moderation data
TRUNCATE TABLE warnings CASCADE;
TRUNCATE TABLE mutes CASCADE;
TRUNCATE TABLE mod_permissions CASCADE;

-- Wipe guild data
TRUNCATE TABLE guild_invites CASCADE;
TRUNCATE TABLE guild_applications CASCADE;
TRUNCATE TABLE guild_members CASCADE;
TRUNCATE TABLE guilds CASCADE;

-- Wipe messages
TRUNCATE TABLE messages CASCADE;
TRUNCATE TABLE chat_messages CASCADE;

-- Wipe player progression
TRUNCATE TABLE player_exploration CASCADE;
TRUNCATE TABLE player_stats CASCADE;
TRUNCATE TABLE player_actions CASCADE;
TRUNCATE TABLE player_equipment CASCADE;
TRUNCATE TABLE player_skills CASCADE;
TRUNCATE TABLE player_inventory CASCADE;

-- Wipe ore veins
TRUNCATE TABLE ore_veins CASCADE;

-- Wipe players last
TRUNCATE TABLE players CASCADE;

-- Re-enable foreign key checks
SET session_replication_role = 'DEFAULT';

-- Reset sequences
ALTER SEQUENCE players_id_seq RESTART WITH 1;
ALTER SEQUENCE guilds_id_seq RESTART WITH 1;
ALTER SEQUENCE messages_id_seq RESTART WITH 1;
ALTER SEQUENCE chat_messages_id_seq RESTART WITH 1;
ALTER SEQUENCE forum_threads_id_seq RESTART WITH 1;
ALTER SEQUENCE forum_posts_id_seq RESTART WITH 1;
ALTER SEQUENCE trades_id_seq RESTART WITH 1;
ALTER SEQUENCE guild_invites_id_seq RESTART WITH 1;
ALTER SEQUENCE guild_applications_id_seq RESTART WITH 1;
ALTER SEQUENCE warnings_id_seq RESTART WITH 1;
ALTER SEQUENCE mutes_id_seq RESTART WITH 1;
ALTER SEQUENCE ground_items_id_seq RESTART WITH 1;
ALTER SEQUENCE ore_veins_id_seq RESTART WITH 1;
ALTER SEQUENCE player_stats_id_seq RESTART WITH 1;
ALTER SEQUENCE skill_snapshots_id_seq RESTART WITH 1;
ALTER SEQUENCE trade_gold_id_seq RESTART WITH 1;
ALTER SEQUENCE trade_offers_id_seq RESTART WITH 1;
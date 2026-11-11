import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { sendSystemMessage } from './messages';
import { levelFromXp } from '../services/xp';
import { isOnline, pushToPlayer, moveGuildRoom } from '../lib/realtime';
import { readText, TEXT_LIMITS } from '../lib/textLimits';
import {
    GUILD_PERMISSIONS, RANK_LABELS, CONFIGURABLE_RANKS, cleanRankPermissions, leaderRoleFor,
    membershipOf, rankOf, rankPermissions, setRole, leaderCount, MAX_LEADERS, type Role,
    joinGuildWithin, lockJoiner, GuildJoinRefusal,
} from '../services/guildRanks';
import { guildStorehousesHoldAnything } from '../services/guildHall';
import { namesRefusal, cleanPublicText, FilterRefusal } from '../services/wordFilter';
import { noteDeed } from '../services/chronicle';

const router = Router();

// Get current player's guild info
router.get('/my', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const player = await db('players').where({ id: playerId }).first();
        if (!player.guild_id) {
            res.json({ guild: null });
            return;
        }

        const guild = await db('guilds').where({ id: player.guild_id }).first();
        const members = await db('guild_members')
            .where({ 'guild_members.guild_id': player.guild_id })
            .join('players', 'guild_members.player_id', 'players.id')
            .join('locations', 'players.current_location_id', 'locations.id')
            .select(
                'players.id',
                'players.username',
                'players.last_seen',
                'guild_members.role',
                'guild_members.joined_at',
                'locations.name as location_name',
            );

        const membersWithStatus = members.map(m => ({
            ...m,
            online: isOnline(m.id),
        }));

        const founder = await db('players').where({ id: guild.founder_id }).select('username').first();
        const leader = await db('players').where({ id: guild.leader_id }).select('username').first();

        // What this player may do, and (for the leader) what every rank may do,
        // from services/guildRanks.ts. The client only decides what to draw.
        const me = await membershipOf(playerId);
        // The three latest headlines from the News board, for the Overview.
        const news = await db('guild_forum_threads as t')
            .join('guild_forum_categories as c', 'c.id', 't.category_id')
            .leftJoin('players as p', 'p.id', 't.author_id')
            .where({ 'c.guild_id': player.guild_id, 'c.is_news': true, 't.is_deleted': false })
            .where('c.min_role_view', '<=', me?.rank ?? 1)
            .orderBy('t.created_at', 'desc').limit(3)
            .select('t.id', 't.title', 't.created_at', 'p.username as author');
        res.json({
            latestNews: news,
            guild: {
                ...guild,
                founderName: founder?.username,
                leaderName: leader?.username,
            },
            members: membersWithStatus.map(m => ({ ...m, rank: rankOf(m.role), roleLabel: RANK_LABELS[m.role as Role] ?? m.role })),
            myRole: me?.role ?? player.guild_role,
            myRank: me?.rank ?? 1,
            isLeader: !!me?.isLeader,
            isHead: !!me?.isHead,
            myPermissions: me ? GUILD_PERMISSIONS.map(p => p.key).filter(k => me.can(k)) : [],
            permissionCatalog: GUILD_PERMISSIONS,
            rankPermissions: me?.isLeader ? rankPermissions(guild.rank_permissions) : undefined,
        });
    } catch (err) {
        logger.error(`Get guild error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all guilds (for browsing)
router.get('/list', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const guilds = await db('guilds')
            .join('players as founder', 'guilds.founder_id', 'founder.id')
            .join('players as leader', 'guilds.leader_id', 'leader.id')
            .select(
                'guilds.id',
                'guilds.name',
                'guilds.tag',
                'guilds.description',
                'guilds.open_applications',
                'guilds.recruitment_message',
                'guilds.min_level_requirement',
                'founder.username as founder_name',
                'leader.username as leader_name',
            );

        const guildsWithCount = await Promise.all(guilds.map(async g => {
            const count = await db('guild_members').where({ guild_id: g.id }).count('id as count').first();
            return { ...g, memberCount: parseInt(count?.count as string) };
        }));

        res.json({ guilds: guildsWithCount });
    } catch (err) {
        logger.error(`List guilds error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create a guild
router.post('/create', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { name, tag, description } = req.body;

    try {
        const player = await db('players').where({ id: playerId }).first();
        if (player.guild_id) {
            res.status(400).json({ error: 'You are already in a guild.' });
            return;
        }

        const cleanName = readText(name, { label: 'Guild name', max: TEXT_LIMITS.guildName, singleLine: true });
        if (!cleanName.ok) { res.status(400).json({ error: cleanName.error }); return; }
        const cleanDescription = readText(description, { label: 'Description', max: TEXT_LIMITS.guildDescription, required: false });
        if (!cleanDescription.ok) { res.status(400).json({ error: cleanDescription.error }); return; }

        if (typeof tag !== 'string' || tag.trim().length === 0 || tag.trim().length > 5) {
            res.status(400).json({ error: 'Guild tag must be 1-5 characters.' });
            return;
        }
        // The language filter (services/wordFilter.ts): the name and tag are
        // refused with a swear or slur in them; the description is cleaned.
        const badGuildName = await namesRefusal(cleanName.value, tag);
        if (badGuildName) { res.status(400).json({ error: badGuildName }); return; }
        if (cleanDescription.value) cleanDescription.value = (await cleanPublicText(playerId, 'guild:description', cleanDescription.value)).text;

        // Check name and tag uniqueness
        const existing = await db('guilds')
            .where({ name: cleanName.value })
            .orWhere({ tag: tag.trim().toUpperCase() })
            .first();

        if (existing) {
            res.status(400).json({ error: 'That guild name or tag is already taken.' });
            return;
        }

        // The guild and its founder's place in it are one unit: two founding
        // requests at once, or a join landing beside one, must not leave a
        // player in two guilds (audit A2). The unique name and tag are the
        // database's own guard against two guilds with one name.
        const guild = await db.transaction(async (trx) => {
            const [created] = await trx('guilds').insert({
                name: cleanName.value,
                tag: tag.trim().toUpperCase(),
                founder_id: playerId,
                leader_id: playerId,
                description: cleanDescription.value,
                open_applications: true,
            }).returning('*');
            await joinGuildWithin(trx, playerId, created.id, 'founder');
            return created;
        });

        moveGuildRoom(playerId, null, guild.id);

        // The Chronicle (services/chronicle.ts): a new banner on the island.
        noteDeed(db, { kind: 'guild_founded', guildId: guild.id, subject: guild.name, data: { guild: guild.name, tag: guild.tag, byPlayerId: playerId } });

        // A News board (officers post; everyone reads and replies), and a
        // starter board, so a new guild's forum is never an empty screen.
        await db('guild_forum_categories').insert({
            guild_id: guild.id,
            name: 'News',
            description: 'Word from the guild\'s officers.',
            sort_order: -1,
            min_role_view: 1,
            min_role_post: 1,
            is_news: true,
            created_by: playerId,
        });
        await db('guild_forum_categories').insert({
            guild_id: guild.id,
            name: 'General',
            description: 'Anything and everything.',
            sort_order: 0,
            min_role_view: 1,
            min_role_post: 1,
            created_by: playerId,
        });

        logger.info(`Player ${playerId} created guild ${guild.name} [${guild.tag}]`);
        res.json({ success: true, guild });
    } catch (err: any) {
        if (err instanceof FilterRefusal) { res.status(400).json({ error: err.message }); return; }
        if (err instanceof GuildJoinRefusal) { res.status(400).json({ error: 'You are already in a guild.' }); return; }
        if (err?.code === '23505') { res.status(400).json({ error: 'That guild name or tag is already taken.' }); return; }
        logger.error(`Create guild error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Send guild invite
router.post('/invite', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { username } = req.body;

    try {
        const inviter = await db('players').where({ id: playerId }).first();
        if (!inviter.guild_id) {
            res.status(400).json({ error: 'You are not in a guild.' });
            return;
        }

        const me = await membershipOf(playerId);
        if (!me?.can('invite')) {
            res.status(403).json({ error: 'Your rank cannot send invites.' });
            return;
        }

        // Case-insensitive, as with whispers and login: usernames are unique
        // without regard to case, so requiring exact capitalisation of a name
        // someone read in chat only produces confusing "player not found".
        const target = await db('players')
            .whereRaw('LOWER(username) = LOWER(?)', [username])
            .first();
        if (!target) {
            res.status(404).json({ error: 'Player not found.' });
            return;
        }

        if (target.guild_id) {
            res.status(400).json({ error: `${username} is already in a guild.` });
            return;
        }

        // Check for existing pending invite
        const existing = await db('guild_invites')
            .where({ player_id: target.id, guild_id: inviter.guild_id, status: 'pending' })
            .first();

        if (existing) {
            res.status(400).json({ error: `${username} already has a pending invite.` });
            return;
        }

        const guild = await db('guilds').where({ id: inviter.guild_id }).first();

        // Create invite
        await db('guild_invites').insert({
            player_id: target.id,
            guild_id: inviter.guild_id,
            invited_by: playerId,
        });

        // Send inbox message
        await sendSystemMessage(
            target.id,
            `Guild Invitation — ${guild.name} [${guild.tag}]`,
            `You have been invited to join ${guild.name} [${guild.tag}] by ${inviter.username}.\n\nOpen the Guild panel to accept or decline this invitation.`
        );

        // Socket notification if online
        pushToPlayer(target.id, 'guild_invite', {
            guildName: guild.name,
            guildTag: guild.tag,
            inviterName: inviter.username,
        });

        logger.info(`${inviter.username} invited ${username} to ${guild.name}`);
        res.json({ success: true, message: `Invite sent to ${username}.` });
    } catch (err) {
        logger.error(`Guild invite error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get pending invites for current player
router.get('/invites', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const invites = await db('guild_invites')
            .where({ player_id: playerId, status: 'pending' })
            .join('guilds', 'guild_invites.guild_id', 'guilds.id')
            .join('players as inviters', 'guild_invites.invited_by', 'inviters.id')
            .select(
                'guild_invites.id',
                'guilds.name as guild_name',
                'guilds.tag as guild_tag',
                'guilds.description',
                'inviters.username as invited_by_name',
                'guild_invites.created_at',
            );

        res.json({ invites });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Respond to invite
router.post('/invites/:id/respond', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const inviteId = parseInt(req.params.id as string);
    const { accept } = req.body;

    try {
        const invite = await db('guild_invites')
            .where({ id: inviteId, player_id: playerId, status: 'pending' })
            .first();

        if (!invite) {
            res.status(404).json({ error: 'Invite not found.' });
            return;
        }

        if (accept) {
            // Everyone joins as a Recruit; the guild promotes them from there.
            // The invite is claimed with a conditional update, so it can be
            // used once; the join itself checks the player is free (audit A2).
            const guild = await db.transaction(async (trx) => {
                await lockJoiner(trx, playerId);
                const claimed = await trx('guild_invites')
                    .where({ id: inviteId, player_id: playerId, status: 'pending' })
                    .update({ status: 'accepted' });
                if (claimed !== 1) throw new GuildJoinRefusal('Invite not found.', 404);
                return joinGuildWithin(trx, playerId, invite.guild_id, 'recruit');
            });

            moveGuildRoom(playerId, null, invite.guild_id);
            logger.info(`Player ${playerId} accepted invite to guild ${invite.guild_id}`);
            res.json({ success: true, message: `Welcome to ${guild.name}!` });
        } else {
            await db('guild_invites').where({ id: inviteId }).update({ status: 'declined' });
            res.json({ success: true, message: 'Invite declined.' });
        }
    } catch (err) {
        if (err instanceof GuildJoinRefusal) {
            res.status(err.status).json({ error: err.status === 404 ? err.message : 'You are already in a guild.' });
            return;
        }
        logger.error(`Guild invite respond error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Kick a player
router.post('/kick', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { targetPlayerId } = req.body;

    try {
        const player = await db('players').where({ id: playerId }).first();
        if (!player.guild_id) {
            res.status(400).json({ error: 'You are not in a guild.' });
            return;
        }

        const me = await membershipOf(playerId);
        if (!me?.can('kick')) {
            res.status(403).json({ error: 'Your rank cannot remove members.' });
            return;
        }

        const target = await db('players').where({ id: targetPlayerId }).first();
        const theirs = target ? await membershipOf(target.id) : null;
        if (!target || !theirs || theirs.guildId !== me.guildId) {
            res.status(404).json({ error: 'Player not found in your guild.' });
            return;
        }

        // Only ever someone ranked below you. The head outranks everyone,
        // the second Leader included; nobody removes the head.
        if (theirs.isHead || (!me.isHead && theirs.rank >= me.rank)) {
            res.status(403).json({ error: 'You can only remove members ranked below you.' });
            return;
        }

        await db('guild_members').where({ guild_id: player.guild_id, player_id: targetPlayerId }).delete();
        await db('players').where({ id: targetPlayerId }).update({
            guild_id: null,
            guild_tag: null,
            guild_role: null,
        });

        moveGuildRoom(Number(targetPlayerId), player.guild_id, null);
        logger.info(`Player ${playerId} kicked ${targetPlayerId} from guild ${player.guild_id}`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Kick guild error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** A hand-over that lost a race: thrown so its transaction rolls back. */
class LeadershipMoved extends Error {}

// Transfer leadership. The leader hands the guild on and becomes an Officer;
// the new leader takes 'founder' if they founded it, 'leader' otherwise.
router.post('/transfer-leadership', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const targetPlayerId = Math.floor(Number(req.body?.targetPlayerId));

    try {
        const me = await membershipOf(playerId);
        if (!me?.isHead) {
            res.status(403).json({ error: 'Only the head of the guild can hand it on.' });
            return;
        }
        const theirs = Number.isFinite(targetPlayerId) ? await membershipOf(targetPlayerId) : null;
        if (!theirs || theirs.guildId !== me.guildId || targetPlayerId === playerId) {
            res.status(404).json({ error: 'Player not found in your guild.' });
            return;
        }

        await db.transaction(async (trx) => {
            // Conditional, so two hand-overs at once cannot both succeed.
            const moved = await trx('guilds').where({ id: me.guildId, leader_id: playerId }).update({ leader_id: targetPlayerId });
            if (moved !== 1) throw new LeadershipMoved();
            // The old head stays a Leader when that keeps the guild at two
            // (the new head was the second Leader, or there was none), and
            // becomes an Officer otherwise.
            const others = await leaderCount(trx, me.guildId, playerId) - (theirs.isLeader ? 1 : 0);
            await setRole(trx, me.guildId, playerId, others + 1 < MAX_LEADERS ? 'leader' : 'officer');
            await setRole(trx, me.guildId, targetPlayerId, leaderRoleFor(me.guild, targetPlayerId));
        });

        logger.info(`Player ${playerId} transferred leadership of guild ${me.guildId} to ${targetPlayerId}`);
        res.json({ success: true });
    } catch (err) {
        if (err instanceof LeadershipMoved) {
            res.status(409).json({ error: 'The guild has already changed hands.' });
            return;
        }
        logger.error(`Transfer leadership error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Set a member's rank. Needs the promote permission, and reaches only members
// ranked below you, to ranks below your own: an Officer can make Members and
// Recruits, a Leader makes Officers. Only the head names (or unnames) the
// second Leader, and a guild has at most MAX_LEADERS, the head included.
class RankRefused extends Error {}

router.post('/rank', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const targetPlayerId = Math.floor(Number(req.body?.targetPlayerId));
    const role = req.body?.role;

    try {
        if (role !== 'leader' && !(CONFIGURABLE_RANKS as readonly string[]).includes(role)) {
            res.status(400).json({ error: 'Choose Leader, Officer, Member or Recruit.' });
            return;
        }
        const me = await membershipOf(playerId);
        if (!me?.can('promote')) {
            res.status(403).json({ error: 'Your rank cannot change ranks.' });
            return;
        }
        const theirs = Number.isFinite(targetPlayerId) ? await membershipOf(targetPlayerId) : null;
        if (!theirs || theirs.guildId !== me.guildId) {
            res.status(404).json({ error: 'Player not found in your guild.' });
            return;
        }
        if (theirs.isHead || targetPlayerId === playerId) {
            res.status(403).json({ error: theirs.isHead ? 'Nobody changes the head of the guild\'s rank.' : 'You cannot change your own rank.' });
            return;
        }
        if (role === 'leader' && !me.isHead) {
            res.status(403).json({ error: 'Only the head of the guild names a Leader.' });
            return;
        }
        if (!me.isHead && (theirs.rank >= me.rank || rankOf(role) >= me.rank)) {
            res.status(403).json({ error: 'You can only set ranks below your own, for members below you.' });
            return;
        }

        // Under the guild's lock, so two promotions at once cannot both make
        // a third Leader.
        await db.transaction(async (trx) => {
            await trx('guilds').where({ id: me.guildId }).forUpdate().first();
            if (role === 'leader' && (await leaderCount(trx, me.guildId, targetPlayerId)) >= MAX_LEADERS) {
                throw new RankRefused(`A guild has at most ${MAX_LEADERS} Leaders, the head included.`);
            }
            await setRole(trx, me.guildId, targetPlayerId, role as Role);
        });
        pushToPlayer(targetPlayerId, 'guild_rank_changed', { role, label: RANK_LABELS[role as Role] });
        logger.info(`Player ${playerId} set player ${targetPlayerId} to ${role} in guild ${me.guildId}`);
        res.json({ success: true });
    } catch (err) {
        if (err instanceof RankRefused) { res.status(400).json({ error: err.message }); return; }
        logger.error(`Guild rank error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// What each rank may do. Leader only; the leader may always do everything.
router.put('/permissions', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const me = await membershipOf(playerId);
        if (!me?.isLeader) {
            res.status(403).json({ error: 'Only the leader decides what each rank may do.' });
            return;
        }
        const clean = cleanRankPermissions(req.body?.rankPermissions);
        if (!clean) {
            res.status(400).json({ error: 'Send a choice for Officer, Member and Recruit.' });
            return;
        }
        await db('guilds').where({ id: me.guildId }).update({ rank_permissions: JSON.stringify(clean), updated_at: new Date() });
        res.json({ success: true, rankPermissions: clean });
    } catch (err) {
        logger.error(`Guild permissions error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Leave guild
router.post('/leave', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;

    try {
        const player = await db('players').where({ id: playerId }).first();
        if (!player.guild_id) {
            res.status(400).json({ error: 'You are not in a guild.' });
            return;
        }

        // The leader hands the guild on first (or disbands it). A founder who
        // no longer leads is free to go like anyone else.
        const me = await membershipOf(playerId);
        if (me?.isHead) {
            res.status(400).json({ error: 'Hand the guild to someone else before you leave, or disband it.' });
            return;
        }

        await db('guild_members').where({ guild_id: player.guild_id, player_id: playerId }).delete();
        await db('players').where({ id: playerId }).update({
            guild_id: null,
            guild_tag: null,
            guild_role: null,
        });

        moveGuildRoom(playerId, player.guild_id, null);
        logger.info(`Player ${playerId} left guild ${player.guild_id}`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Leave guild error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Apply to guild
router.post('/apply', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { guildId, message } = req.body;

    try {
        const player = await db('players').where({ id: playerId }).first();
        if (player.guild_id) {
            res.status(400).json({ error: 'You are already in a guild.' });
            return;
        }

        const cleanMessage = readText(message, { label: 'Your message', max: TEXT_LIMITS.guildApplication, required: false });
        if (!cleanMessage.ok) { res.status(400).json({ error: cleanMessage.error }); return; }

        const guild = await db('guilds').where({ id: guildId }).first();
        if (!guild) {
            res.status(404).json({ error: 'Guild not found.' });
            return;
        }

        if (!guild.open_applications) {
            res.status(400).json({ error: 'This guild is not accepting applications.' });
            return;
        }

        // Check minimum level requirement
        if (guild.min_level_requirement > 1) {
            const playerSkills = await db('player_skills').where({ player_id: playerId });
            const totalLevel = playerSkills.reduce((sum: number, s: any) => {
                return sum + levelFromXp(parseInt(s.xp));
            }, 0);
            if (totalLevel < guild.min_level_requirement) {
                res.status(400).json({ error: `This guild requires a total level of ${guild.min_level_requirement}. Your total level is ${totalLevel}.` });
                return;
            }
        }

        await db('guild_applications').insert({
            guild_id: guildId,
            player_id: playerId,
            message: cleanMessage.value,
            status: 'pending',
        })
            // One row per player and guild. Applying again after an answer
            // reopens it with the new message; it used to be ignored, so a
            // player once refused could never apply to that guild again and
            // was told their application was submitted.
            .onConflict(['guild_id', 'player_id'])
            .merge({ message: cleanMessage.value, status: 'pending', created_at: db.fn.now() });

        res.json({ success: true, message: 'Application submitted!' });
    } catch (err) {
        logger.error(`Apply guild error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get pending applications (leader/founder only)
router.get('/applications', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;

    try {
        const player = await db('players').where({ id: playerId }).first();

        const me = await membershipOf(playerId);
        if (!player.guild_id || !me?.can('invite')) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

        const applications = await db('guild_applications')
            .where({ 'guild_applications.guild_id': player.guild_id, 'guild_applications.status': 'pending' })
            .join('players', 'guild_applications.player_id', 'players.id')
            .select(
                'guild_applications.id',
                'guild_applications.message',
                'guild_applications.created_at',
                'players.username'
            );

        res.json({ applications });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Accept/reject application
router.post('/applications/:id/respond', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const appId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { accept } = req.body;

    try {
        const me = await membershipOf(playerId);
        if (!me?.can('invite')) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

        // One transaction: the application is claimed with a conditional
        // update, so only a pending one can be answered and only once, and the
        // join checks the applicant is still free (audit A2). This route never
        // checked either: an officer could accept an application from months
        // ago, or one already rejected, and pull the player out of whatever
        // guild they had joined since, its leader included.
        const outcome = await db.transaction(async (trx) => {
            // The applicant's row first, then the application (lock order: joinGuildWithin).
            const seen = await trx('guild_applications').where({ id: appId, guild_id: me.guildId }).first('player_id');
            if (!seen) throw new GuildJoinRefusal('Application not found.', 404);
            await lockJoiner(trx, Number(seen.player_id));
            const app = await trx('guild_applications')
                .where({ id: appId, guild_id: me.guildId }).forUpdate().first();
            if (!app || app.status !== 'pending') throw new GuildJoinRefusal('Application not found.', 404);
            if (!accept) {
                await trx('guild_applications').where({ id: appId }).update({ status: 'rejected' });
                return { joined: null as number | null };
            }
            try {
                await joinGuildWithin(trx, app.player_id, me.guildId, 'recruit');
            } catch (err) {
                if (err instanceof GuildJoinRefusal) throw new GuildJoinRefusal('That player has joined another guild since applying.');
                throw err;
            }
            await trx('guild_applications').where({ id: appId }).update({ status: 'accepted' });
            return { joined: Number(app.player_id) };
        });
        if (outcome.joined) moveGuildRoom(outcome.joined, null, me.guildId);

        res.json({ success: true });
    } catch (err) {
        if (err instanceof GuildJoinRefusal) { res.status(err.status).json({ error: err.message }); return; }
        logger.error(`Guild application respond error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update guild settings (leader only)
router.put('/settings', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { name, tag, description, open_applications, recruitment_message, min_level_requirement } = req.body;

    try {
        const player = await db('players').where({ id: playerId }).first();
        if (!player.guild_id) {
            res.status(400).json({ error: 'You are not in a guild.' });
            return;
        }

        const guild = await db('guilds').where({ id: player.guild_id }).first();
        const me = await membershipOf(playerId);
        if (!me?.isLeader) {
            res.status(403).json({ error: 'Only a Leader can change the guild\'s settings.' });
            return;
        }

        const updates: any = {};

        if (description !== undefined) {
            const clean = readText(description, { label: 'Description', max: TEXT_LIMITS.guildDescription, required: false });
            if (!clean.ok) { res.status(400).json({ error: clean.error }); return; }
            updates.description = clean.value ? (await cleanPublicText(playerId, 'guild:description', clean.value)).text : clean.value;
        }
        if (open_applications !== undefined) updates.open_applications = open_applications;
        if (recruitment_message !== undefined) {
            const clean = readText(recruitment_message, { label: 'Recruitment message', max: TEXT_LIMITS.guildRecruitment, required: false });
            if (!clean.ok) { res.status(400).json({ error: clean.error }); return; }
            updates.recruitment_message = clean.value ? (await cleanPublicText(playerId, 'guild:recruitment', clean.value)).text : clean.value;
        }
        if (min_level_requirement !== undefined) updates.min_level_requirement = Math.max(1, parseInt(min_level_requirement));

        // Handle name change
        if (name !== undefined) {
            const clean = readText(name, { label: 'Guild name', max: TEXT_LIMITS.guildName, singleLine: true });
            if (!clean.ok) { res.status(400).json({ error: clean.error }); return; }
            if (clean.value !== guild.name) {
                const badGuildName = await namesRefusal(clean.value);
                if (badGuildName) { res.status(400).json({ error: badGuildName }); return; }
                const existing = await db('guilds').where({ name: clean.value }).whereNot({ id: guild.id }).first();
                if (existing) {
                    res.status(400).json({ error: 'That guild name is already taken.' });
                    return;
                }
                updates.name = clean.value;
            }
        }

        // Handle tag change with cooldown
        if (typeof tag === 'string' && tag.trim().toUpperCase() !== guild.tag) {
            const TAG_COOLDOWN_DAYS = 30;
            if (guild.tag_last_changed) {
                const daysSince = (Date.now() - new Date(guild.tag_last_changed).getTime()) / (1000 * 60 * 60 * 24);
                if (daysSince < TAG_COOLDOWN_DAYS) {
                    const daysLeft = Math.ceil(TAG_COOLDOWN_DAYS - daysSince);
                    res.status(400).json({ error: `You can change your guild tag again in ${daysLeft} days.` });
                    return;
                }
            }
            const newTag = tag.trim().toUpperCase();
            if (newTag.length < 2 || newTag.length > 5) {
                res.status(400).json({ error: 'Guild tag must be 2-5 characters.' });
                return;
            }
            const badTag = await namesRefusal(newTag);
            if (badTag) { res.status(400).json({ error: badTag }); return; }
            const existingTag = await db('guilds').where({ tag: newTag }).whereNot({ id: guild.id }).first();
            if (existingTag) {
                res.status(400).json({ error: 'That guild tag is already taken.' });
                return;
            }
            updates.tag = newTag;
            updates.tag_last_changed = new Date();

            // Update all members' guild_tag in players table
            await db('players').where({ guild_id: guild.id }).update({ guild_tag: newTag });
        }

        updates.updated_at = new Date();
        await db('guilds').where({ id: guild.id }).update(updates);

        logger.info(`Guild ${guild.id} settings updated by player ${playerId}`);
        res.json({ success: true, message: 'Guild settings updated.' });
    } catch (err) {
        if (err instanceof FilterRefusal) { res.status(400).json({ error: err.message }); return; }
        logger.error(`Guild settings error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/disband', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const player = await db('players').where({ id: playerId }).first();
        if (!player.guild_id) {
            res.status(400).json({ error: 'You are not in a guild.' });
            return;
        }
        const guild = await db('guilds').where({ id: player.guild_id }).first();
        if (guild.leader_id !== playerId) {
            res.status(403).json({ error: 'Only the head of the guild can disband it.' });
            return;
        }
        // A guild's halls go with it, and their storehouses with them: refuse
        // while any holds an item or a coin, rather than destroy what members gave.
        if (await guildStorehousesHoldAnything(guild.id)) {
            res.status(400).json({ error: 'Empty every guild storehouse first, gold and all. Disbanding would destroy what is in them.' });
            return;
        }
        // The members' own copies of the tag and rank go with it. Deleting the
        // guild cleared players.guild_id (ON DELETE SET NULL) but not these, so
        // chat went on showing a disbanded guild's tag (forum, 2026-11-03).
        const memberIds: number[] = (await db('players').where({ guild_id: guild.id }).pluck('id')).map(Number);
        await db.transaction(async (trx) => {
            await trx('players').where({ guild_id: guild.id }).update({ guild_id: null, guild_tag: null, guild_role: null });
            await trx('guilds').where({ id: guild.id }).delete();
        });
        for (const id of memberIds) moveGuildRoom(id, guild.id, null);
        logger.info(`Guild ${guild.id} disbanded by player ${playerId}`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Disband guild error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
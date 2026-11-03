import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { sendSystemMessage } from './messages';
import { levelFromXp } from '../services/xp';
import { isOnline, pushToPlayer } from '../lib/realtime';
import { readText, TEXT_LIMITS } from '../lib/textLimits';
import {
    GUILD_PERMISSIONS, RANK_LABELS, CONFIGURABLE_RANKS, cleanRankPermissions, leaderRoleFor,
    membershipOf, rankOf, rankPermissions, setRole, type Role,
} from '../services/guildRanks';
import { guildStorehousesHoldAnything } from '../services/guildHall';
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

        // Check name and tag uniqueness
        const existing = await db('guilds')
            .where({ name: cleanName.value })
            .orWhere({ tag: tag.trim().toUpperCase() })
            .first();

        if (existing) {
            res.status(400).json({ error: 'That guild name or tag is already taken.' });
            return;
        }

        const [guild] = await db('guilds').insert({
            name: cleanName.value,
            tag: tag.trim().toUpperCase(),
            founder_id: playerId,
            leader_id: playerId,
            description: cleanDescription.value,
            open_applications: true,
        }).returning('*');

        await db('guild_members').insert({
            guild_id: guild.id,
            player_id: playerId,
            role: 'founder',
        });

        await db('players').where({ id: playerId }).update({
            guild_id: guild.id,
            guild_tag: guild.tag,
            guild_role: 'founder',
        });

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
    } catch (err) {
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
            const player = await db('players').where({ id: playerId }).first();
            if (player.guild_id) {
                res.status(400).json({ error: 'You are already in a guild.' });
                return;
            }

            const guild = await db('guilds').where({ id: invite.guild_id }).first();

            // Everyone joins as a Recruit; the guild promotes them from there.
            await db('players').where({ id: playerId }).update({
                guild_id: invite.guild_id,
                guild_tag: guild.tag,
                guild_role: 'recruit',
            });

            await db('guild_members').insert({
                guild_id: invite.guild_id,
                player_id: playerId,
                role: 'recruit',
            });

            await db('guild_invites').where({ id: inviteId }).update({ status: 'accepted' });

            // Decline all other pending invites
            await db('guild_invites')
                .where({ player_id: playerId, status: 'pending' })
                .whereNot({ id: inviteId })
                .update({ status: 'declined' });

            logger.info(`Player ${playerId} accepted invite to guild ${invite.guild_id}`);
            res.json({ success: true, message: `Welcome to ${guild.name}!` });
        } else {
            await db('guild_invites').where({ id: inviteId }).update({ status: 'declined' });
            res.json({ success: true, message: 'Invite declined.' });
        }
    } catch (err) {
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

        // Only ever someone ranked below you. The leader outranks everyone.
        if (theirs.isLeader || theirs.rank >= me.rank) {
            res.status(403).json({ error: 'You can only remove members ranked below you.' });
            return;
        }

        await db('guild_members').where({ guild_id: player.guild_id, player_id: targetPlayerId }).delete();
        await db('players').where({ id: targetPlayerId }).update({
            guild_id: null,
            guild_tag: null,
            guild_role: null,
        });

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
        if (!me?.isLeader) {
            res.status(403).json({ error: 'Only the leader can hand the guild on.' });
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
            await setRole(trx, me.guildId, playerId, 'officer');
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
// Recruits, only the leader makes Officers.
router.post('/rank', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const targetPlayerId = Math.floor(Number(req.body?.targetPlayerId));
    const role = req.body?.role;

    try {
        if (!(CONFIGURABLE_RANKS as readonly string[]).includes(role)) {
            res.status(400).json({ error: 'Choose Officer, Member or Recruit.' });
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
        if (theirs.isLeader || theirs.rank >= me.rank || rankOf(role) >= me.rank) {
            res.status(403).json({ error: 'You can only set ranks below your own, for members below you.' });
            return;
        }

        await setRole(db, me.guildId, targetPlayerId, role as Role);
        pushToPlayer(targetPlayerId, 'guild_rank_changed', { role, label: RANK_LABELS[role as Role] });
        logger.info(`Player ${playerId} set player ${targetPlayerId} to ${role} in guild ${me.guildId}`);
        res.json({ success: true });
    } catch (err) {
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
        if (me?.isLeader) {
            res.status(400).json({ error: 'Hand the guild to someone else before you leave, or disband it.' });
            return;
        }

        await db('guild_members').where({ guild_id: player.guild_id, player_id: playerId }).delete();
        await db('players').where({ id: playerId }).update({
            guild_id: null,
            guild_tag: null,
            guild_role: null,
        });

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
        }).onConflict(['guild_id', 'player_id']).ignore();

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
        const player = await db('players').where({ id: playerId }).first();
        const me = await membershipOf(playerId);
        if (!me?.can('invite')) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

        const app = await db('guild_applications').where({ id: appId, guild_id: player.guild_id }).first();
        if (!app) {
            res.status(404).json({ error: 'Application not found.' });
            return;
        }

        if (accept) {
            await db('guild_members').insert({
                guild_id: player.guild_id,
                player_id: app.player_id,
                role: 'recruit',
            });

            const guild = await db('guilds').where({ id: player.guild_id }).first();
            await db('players').where({ id: app.player_id }).update({
                guild_id: player.guild_id,
                guild_tag: guild.tag,
                guild_role: 'recruit',
            });
        }

        await db('guild_applications').where({ id: appId }).update({
            status: accept ? 'accepted' : 'rejected',
        });

        res.json({ success: true });
    } catch (err) {
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
        if (guild.leader_id !== playerId) {
            res.status(403).json({ error: 'Only the guild leader can change settings.' });
            return;
        }

        const updates: any = {};

        if (description !== undefined) {
            const clean = readText(description, { label: 'Description', max: TEXT_LIMITS.guildDescription, required: false });
            if (!clean.ok) { res.status(400).json({ error: clean.error }); return; }
            updates.description = clean.value;
        }
        if (open_applications !== undefined) updates.open_applications = open_applications;
        if (recruitment_message !== undefined) {
            const clean = readText(recruitment_message, { label: 'Recruitment message', max: TEXT_LIMITS.guildRecruitment, required: false });
            if (!clean.ok) { res.status(400).json({ error: clean.error }); return; }
            updates.recruitment_message = clean.value;
        }
        if (min_level_requirement !== undefined) updates.min_level_requirement = Math.max(1, parseInt(min_level_requirement));

        // Handle name change
        if (name !== undefined) {
            const clean = readText(name, { label: 'Guild name', max: TEXT_LIMITS.guildName, singleLine: true });
            if (!clean.ok) { res.status(400).json({ error: clean.error }); return; }
            if (clean.value !== guild.name) {
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
            res.status(403).json({ error: 'Only the guild leader can disband the guild.' });
            return;
        }
        // A guild's halls go with it, and their storehouses with them: refuse
        // while any holds an item or a coin, rather than destroy what members gave.
        if (await guildStorehousesHoldAnything(guild.id)) {
            res.status(400).json({ error: 'Empty every guild storehouse first, gold and all. Disbanding would destroy what is in them.' });
            return;
        }
        await db('guilds').where({ id: guild.id }).delete();
        logger.info(`Guild ${guild.id} disbanded by player ${playerId}`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Disband guild error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { connectedPlayers } from '../index';
import { sendSystemMessage } from './messages';
import { levelFromXp } from '../services/xp';

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
            online: connectedPlayers.has(m.id),
        }));

        const founder = await db('players').where({ id: guild.founder_id }).select('username').first();
        const leader = await db('players').where({ id: guild.leader_id }).select('username').first();

        res.json({
            guild: {
                ...guild,
                founderName: founder?.username,
                leaderName: leader?.username,
            },
            members: membersWithStatus,
            myRole: player.guild_role,
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

        if (!name || name.trim().length === 0) {
            res.status(400).json({ error: 'Guild name is required.' });
            return;
        }

        if (!tag || tag.trim().length === 0 || tag.trim().length > 5) {
            res.status(400).json({ error: 'Guild tag must be 1-5 characters.' });
            return;
        }

        // Check name and tag uniqueness
        const existing = await db('guilds')
            .where({ name: name.trim() })
            .orWhere({ tag: tag.trim().toUpperCase() })
            .first();

        if (existing) {
            res.status(400).json({ error: 'That guild name or tag is already taken.' });
            return;
        }

        const [guild] = await db('guilds').insert({
            name: name.trim(),
            tag: tag.trim().toUpperCase(),
            founder_id: playerId,
            leader_id: playerId,
            description: description?.trim() || null,
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

        // A starter board, so a new guild's forum is never an empty screen.
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

        const isLeader = ['founder', 'leader'].includes(inviter.guild_role);
        if (!isLeader) {
            res.status(403).json({ error: 'Only leaders can send invites.' });
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
        const { io } = await import('../index');
        io.to(`player_${target.id}`).emit('guild_invite', {
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

            await db('players').where({ id: playerId }).update({
                guild_id: invite.guild_id,
                guild_tag: guild.tag,
                guild_role: 'member',
            });

            await db('guild_members').insert({
                guild_id: invite.guild_id,
                player_id: playerId,
                role: 'member',
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

        if (!['founder', 'leader'].includes(player.guild_role)) {
            res.status(403).json({ error: 'You do not have permission to kick players.' });
            return;
        }

        const target = await db('players').where({ id: targetPlayerId }).first();
        if (!target || target.guild_id !== player.guild_id) {
            res.status(404).json({ error: 'Player not found in your guild.' });
            return;
        }

        if (target.guild_role === 'founder') {
            res.status(403).json({ error: 'You cannot kick the guild founder.' });
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

// Transfer leadership
router.post('/transfer-leadership', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { targetPlayerId } = req.body;

    try {
        const player = await db('players').where({ id: playerId }).first();
        if (!['founder', 'leader'].includes(player.guild_role)) {
            res.status(403).json({ error: 'Only the leader or founder can transfer leadership.' });
            return;
        }

        const target = await db('players').where({ id: targetPlayerId }).first();
        if (!target || target.guild_id !== player.guild_id) {
            res.status(404).json({ error: 'Player not found in your guild.' });
            return;
        }

        // Update guild leader
        await db('guilds').where({ id: player.guild_id }).update({ leader_id: targetPlayerId });

        // Update old leader role — if founder stays founder, else becomes member
        const newOldRole = player.guild_role === 'founder' ? 'founder' : 'member';
        await db('guild_members').where({ guild_id: player.guild_id, player_id: playerId }).update({ role: newOldRole });
        await db('players').where({ id: playerId }).update({ guild_role: newOldRole });

        // New leader
        await db('guild_members').where({ guild_id: player.guild_id, player_id: targetPlayerId }).update({ role: 'leader' });
        await db('players').where({ id: targetPlayerId }).update({ guild_role: 'leader' });

        logger.info(`Player ${playerId} transferred leadership to ${targetPlayerId}`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Transfer leadership error: ${err}`);
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

        if (player.guild_role === 'founder') {
            res.status(400).json({ error: 'The founder cannot leave the guild. Transfer leadership first.' });
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
            message: message?.trim() || null,
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
        console.log('Applications route - player:', player?.username, 'role:', player?.guild_role, 'guild:', player?.guild_id);

        if (!player.guild_id || !['founder', 'leader'].includes(player.guild_role)) {
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
        if (!['founder', 'leader'].includes(player.guild_role)) {
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
                role: 'member',
            });

            const guild = await db('guilds').where({ id: player.guild_id }).first();
            await db('players').where({ id: app.player_id }).update({
                guild_id: player.guild_id,
                guild_tag: guild.tag,
                guild_role: 'member',
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

        if (description !== undefined) updates.description = description.trim();
        if (open_applications !== undefined) updates.open_applications = open_applications;
        if (recruitment_message !== undefined) updates.recruitment_message = recruitment_message?.trim() || null;
        if (min_level_requirement !== undefined) updates.min_level_requirement = Math.max(1, parseInt(min_level_requirement));

        // Handle name change
        if (name !== undefined && name.trim() !== guild.name) {
            const existing = await db('guilds').where({ name: name.trim() }).whereNot({ id: guild.id }).first();
            if (existing) {
                res.status(400).json({ error: 'That guild name is already taken.' });
                return;
            }
            updates.name = name.trim();
        }

        // Handle tag change with cooldown
        if (tag !== undefined && tag.trim().toUpperCase() !== guild.tag) {
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
        await db('guilds').where({ id: guild.id }).delete();
        logger.info(`Guild ${guild.id} disbanded by player ${playerId}`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Disband guild error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
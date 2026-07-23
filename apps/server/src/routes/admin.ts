import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { io } from '../index';
import { logger } from '../lib/logger';
import { xpForLevel, levelFromXp } from '../services/xp';
import { sendSystemMessage } from './messages';
import { connectedPlayers } from '../index';

const router = Router();

// Helper to check permissions
async function hasPermission(playerId: number, permission: string): Promise<boolean> {
    const player = await db('players').where({ id: playerId }).first();
    if (player.is_admin) return true;
    if (!player.is_mod) return false;
    const perms = await db('mod_permissions').where({ player_id: playerId }).first();
    if (!perms) return false;
    return perms[permission] === true;
}

// Get online players
router.get('/players/online', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        if (!await hasPermission(playerId, 'can_view_players')) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

        const players = await db('players')
            .whereIn('players.id', [...connectedPlayers])
            .join('locations', 'players.current_location_id', 'locations.id')
            .select(
                'players.id',
                'players.username',
                'players.is_admin',
                'players.is_mod',
                'players.is_banned',
                'players.is_chat_muted',
                'players.strike_count',
                'locations.name as location_name',
            );

        res.json({ players });
    } catch (err) {
        logger.error(`Admin online players error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Search players
router.get('/players/search', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { q } = req.query;
    try {
        if (!await hasPermission(playerId, 'can_view_players')) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

        const players = await db('players')
            .where('username', 'ilike', `%${q}%`)
            .leftJoin('locations', 'players.current_location_id', 'locations.id')
            .select(
                'players.id',
                'players.username',
                'players.email',
                'players.is_admin',
                'players.is_mod',
                'players.is_banned',
                'players.is_chat_muted',
                'players.chat_muted_until',
                'players.is_forum_banned',
                'players.forum_banned_until',
                'players.banned_until',
                'players.ban_reason',
                'players.strike_count',
                'players.created_at',
                'players.last_login',
                'locations.name as location_name',
            )
            .limit(20);

        res.json({ players });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get player details
router.get('/players/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const targetId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    try {
        if (!await hasPermission(playerId, 'can_view_players')) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

        const player = await db('players')
            .where({ 'players.id': targetId })
            .leftJoin('locations', 'players.current_location_id', 'locations.id')
            .select(
                'players.id',
                'players.username',
                'players.email',
                'players.is_admin',
                'players.is_mod',
                'players.is_banned',
                'players.is_chat_muted',
                'players.chat_muted_until',
                'players.is_forum_banned',
                'players.forum_banned_until',
                'players.banned_until',
                'players.ban_reason',
                'players.strike_count',
                'players.created_at',
                'players.last_login',
                'locations.name as location_name',
            )
            .first();

        if (!player) {
            res.status(404).json({ error: 'Player not found.' });
            return;
        }

        const warnings = await db('warnings')
            .where({ player_id: targetId })
            .join('players as staff', 'warnings.issued_by', 'staff.id')
            .select('warnings.*', 'staff.username as issued_by_name')
            .orderBy('warnings.created_at', 'desc');

        const mutes = await db('mutes')
            .where({ player_id: targetId, is_active: true })
            .join('players as staff', 'mutes.issued_by', 'staff.id')
            .select('mutes.*', 'staff.username as issued_by_name')
            .orderBy('mutes.created_at', 'desc');

        const modPerms = await db('mod_permissions').where({ player_id: targetId }).first();

        res.json({ player, warnings, mutes, modPerms });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Send server announcement
router.post('/announce', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { message } = req.body;
    try {
        const player = await db('players').where({ id: playerId }).first();
        if (!player.is_admin && !player.is_mod) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

        if (!message?.trim()) {
            res.status(400).json({ error: 'Message required.' });
            return;
        }

        const now = new Date();
        const timestamp = now.toTimeString().slice(0, 5);

        const announcementData = {
            id: Date.now(),
            channel: 'server',
            playerName: '[SERVER]',
            guildTag: null,
            message: message.trim(),
            timestamp,
            isAnnouncement: true,
        }
        // Persist so it survives refreshes (loaded via /api/chat/history/server).
        await db('chat_messages').insert({
            player_id: playerId,
            channel: 'server',
            message: message.trim(),
            player_name: '[SERVER]',
            guild_tag: null,
            region: null,
            guild_id: null,
            sent_at: now,
        });

        io.emit('chat_world', announcementData);
        // Also emit as a banner
        io.emit('server_announcement', { message: message.trim() });

        logger.info(`Server announcement by ${player.username}: ${message.trim()}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Warn a player
router.post('/warn', requireAuth, async (req: AuthRequest, res: Response) => {
    const staffId = req.player!.playerId;
    const { targetId, reason, type } = req.body; // type: 'chat' or 'formal'
    try {
        if (!await hasPermission(staffId, 'can_send_messages')) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

        const target = await db('players').where({ id: targetId }).first();
        if (!target) {
            res.status(404).json({ error: 'Player not found.' });
            return;
        }

        const staff = await db('players').where({ id: staffId }).first();

        // Increment strike count
        await db('players').where({ id: targetId }).increment('strike_count', 1);
        const updatedTarget = await db('players').where({ id: targetId }).first();
        const strikeNumber = updatedTarget.strike_count;

        // Record warning
        await db('warnings').insert({
            player_id: targetId,
            issued_by: staffId,
            reason: reason?.trim() || 'No reason given.',
            type: type || 'formal',
            strike_number: strikeNumber,
        });

        if (type === 'chat') {
            // Send red warning in chat visible only to target
            io.to(`player_${targetId}`).emit('chat_warning', {
                message: `⚠ Warning from staff: ${reason?.trim() || 'No reason given.'} (Strike ${strikeNumber})`,
            });
        } else {
            // Send formal inbox message
            await sendSystemMessage(
                targetId,
                `Official Warning — Strike ${strikeNumber}`,
                `You have received an official warning from the Talaran moderation team.\n\nReason: ${reason?.trim() || 'No reason given.'}\n\nThis is strike ${strikeNumber} on your account. Continued violations may result in a mute or ban.`
            );
        }

        logger.info(`${staff.username} warned ${target.username} (strike ${strikeNumber}): ${reason}`);
        res.json({ success: true, strikeNumber });
    } catch (err) {
        logger.error(`Warn error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// List all locations (for admin teleport dropdowns)
router.get('/locations', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const player = await db('players').where({ id: playerId }).first();
        if (!player.is_admin && !player.is_mod) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }
        const locations = await db('locations')
            .select('id', 'name', 'region')
            .orderBy(['region', 'name']);
        res.json({ locations });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Teleport a player to a location
router.post('/teleport', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { targetId, locationId } = req.body;
    try {
        const staff = await db('players').where({ id: playerId }).first();
        if (!staff.is_admin) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }
        const target = await db('players').where({ id: targetId }).first();
        if (!target) {
            res.status(404).json({ error: 'Player not found.' });
            return;
        }
        const location = await db('locations').where({ id: locationId }).first();
        if (!location) {
            res.status(404).json({ error: 'Location not found.' });
            return;
        }

        // Stop any in-progress action/travel, then move them.
        await db('player_actions').where({ player_id: targetId }).delete();
        await db('players').where({ id: targetId }).update({ current_location_id: locationId });

        // Tell their client to reload into the new location.
        io.to(`player_${targetId}`).emit('force_refresh');

        logger.info(`${staff.username} teleported ${target.username} to ${location.name}`);
        res.json({ success: true, message: `Moved ${target.username} to ${location.name}.` });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// List all items (for the admin add-item tool)
router.get('/items', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const staff = await db('players').where({ id: playerId }).first();
        if (!staff.is_admin) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }
        const items = await db('items').select('id', 'name', 'type').orderBy('name');
        res.json({ items });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Add an item to a player's inventory
router.post('/give-item', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { targetId, itemId, quantity } = req.body;
    try {
        const staff = await db('players').where({ id: playerId }).first();
        if (!staff.is_admin) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }
        const qty = parseInt(quantity);
        if (!qty || qty < 1) {
            res.status(400).json({ error: 'Quantity must be at least 1.' });
            return;
        }
        const target = await db('players').where({ id: targetId }).first();
        if (!target) { res.status(404).json({ error: 'Player not found.' }); return; }
        const item = await db('items').where({ id: itemId }).first();
        if (!item) { res.status(404).json({ error: 'Item not found.' }); return; }

        const existing = await db('player_inventory')
            .where({ player_id: targetId, item_id: itemId }).first();
        if (existing) {
            await db('player_inventory')
                .where({ player_id: targetId, item_id: itemId })
                .increment('quantity', qty);
        } else {
            await db('player_inventory')
                .insert({ player_id: targetId, item_id: itemId, quantity: qty });
        }

        logger.info(`${staff.username} gave ${qty}x ${item.name} to ${target.username}`);
        res.json({ success: true, message: `Gave ${qty}× ${item.name} to ${target.username}.` });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Skills list, for the grant-XP picker
router.get('/skills', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const staff = await db('players').where({ id: playerId }).first();
        if (!staff.is_admin) { res.status(403).json({ error: 'No permission.' }); return; }
        const skills = await db('skills').select('id', 'name', 'is_implemented').orderBy('display_order');
        res.json({ skills });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Grant XP to a player, or set a skill straight to a level (testing aid).
//   mode 'add'      → adds `amount` XP (may be negative, floored at 0)
//   mode 'setLevel' → sets the skill's XP to exactly the start of level `amount`
router.post('/grant-xp', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { targetId, skillId, amount, mode } = req.body;
    try {
        const staff = await db('players').where({ id: playerId }).first();
        if (!staff.is_admin) { res.status(403).json({ error: 'No permission.' }); return; }

        const value = parseInt(amount);
        if (Number.isNaN(value)) { res.status(400).json({ error: 'Amount must be a number.' }); return; }

        const target = await db('players').where({ id: targetId }).first();
        if (!target) { res.status(404).json({ error: 'Player not found.' }); return; }
        const skill = await db('skills').where({ id: skillId }).first();
        if (!skill) { res.status(404).json({ error: 'Skill not found.' }); return; }

        const existing = await db('player_skills')
            .where({ player_id: targetId, skill_id: skillId }).first();
        const currentXp = existing ? parseInt(existing.xp.toString()) : 0;

        let newXp: number;
        if (mode === 'setLevel') {
            if (value < 1 || value > 99) { res.status(400).json({ error: 'Level must be between 1 and 99.' }); return; }
            newXp = xpForLevel(value);
        } else {
            newXp = Math.max(0, currentXp + value);
        }

        if (existing) {
            await db('player_skills')
                .where({ player_id: targetId, skill_id: skillId })
                .update({ xp: newXp });
        } else {
            await db('player_skills').insert({ player_id: targetId, skill_id: skillId, xp: newXp });
        }

        const newLevel = levelFromXp(newXp);
        logger.info(`${staff.username} set ${target.username}'s ${skill.name} to ${newXp} xp (level ${newLevel})`);
        res.json({
            success: true,
            message: `${target.username}'s ${skill.name} is now level ${newLevel} (${newXp.toLocaleString()} xp).`,
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

function formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
    const hours = Math.floor(minutes / 60)
    const remaining = minutes % 60
    if (remaining === 0) return `${hours} hour${hours === 1 ? '' : 's'}`
    return `${hours} hour${hours === 1 ? '' : 's'} and ${remaining} minute${remaining === 1 ? '' : 's'}`
}

function formatHours(hours: number): string {
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
    const days = Math.floor(hours / 24)
    const remaining = hours % 24
    if (remaining === 0) return `${days} day${days === 1 ? '' : 's'}`
    return `${days} day${days === 1 ? '' : 's'} and ${remaining} hour${remaining === 1 ? '' : 's'}`
}

// Mute a player
router.post('/mute', requireAuth, async (req: AuthRequest, res: Response) => {
    const staffId = req.player!.playerId;
    const { targetId, type, reason, durationHours } = req.body;
    try {
        if (!await hasPermission(staffId, 'can_moderate_chat')) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

        const target = await db('players').where({ id: targetId }).first();
        if (!target) {
            res.status(404).json({ error: 'Player not found.' });
            return;
        }

        const staff = await db('players').where({ id: staffId }).first();
        const now = new Date();
        const expiresAt = durationHours
            ? new Date(now.getTime() + durationHours * 60 * 1000) // minutes
            : null;

        await db('mutes').insert({
            player_id: targetId,
            issued_by: staffId,
            type,
            reason: reason?.trim() || null,
            expires_at: expiresAt,
            is_active: true,
        });

        if (type === 'chat') {
            await db('players').where({ id: targetId }).update({
                is_chat_muted: true,
                chat_muted_until: expiresAt,
            });
            io.to(`player_${targetId}`).emit('chat_muted', {
                message: durationHours
                    ? `You have been muted in chat for ${formatDuration(durationHours)}. Reason: ${reason || 'No reason given.'}`
                    : `You have been permanently muted in chat. Reason: ${reason || 'No reason given.'}`,
            });
        } else if (type === 'forum') {
            await db('players').where({ id: targetId }).update({
                is_forum_banned: true,
                forum_banned_until: expiresAt,
            });
            io.to(`player_${targetId}`).emit('chat_muted', {
                message: durationHours
                    ? `You have been banned from the forum for ${formatDuration(durationHours)}. Reason: ${reason || 'No reason given.'}`
                    : `You have been permanently banned from the forum. Reason: ${reason || 'No reason given.'}`,
            });
        }

        await sendSystemMessage(
            targetId,
            `Account ${type === 'chat' ? 'Chat Mute' : 'Forum Ban'}`,
            `Your account has received a ${type === 'chat' ? 'chat mute' : 'forum ban'}.\n\nReason: ${reason || 'No reason given.'}\n\nDuration: ${durationHours ? formatDuration(durationHours) : 'Permanent'}`
        );

        logger.info(`${staff.username} muted ${target.username} (${type}, ${formatDuration(durationHours)} || 'permanent'}h): ${reason}`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Mute error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Ban a player
router.post('/ban', requireAuth, async (req: AuthRequest, res: Response) => {
    const staffId = req.player!.playerId;
    const { targetId, reason, durationHours } = req.body;
    try {
        const staff = await db('players').where({ id: staffId }).first();
        if (!staff.is_admin && !await hasPermission(staffId, 'can_ban')) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

        const target = await db('players').where({ id: targetId }).first();
        if (!target) {
            res.status(404).json({ error: 'Player not found.' });
            return;
        }

        if (target.is_admin) {
            res.status(403).json({ error: 'Cannot ban an admin.' });
            return;
        }

        const now = new Date();
        const bannedUntil = durationHours
            ? new Date(now.getTime() + durationHours * 60 * 60 * 1000)
            : null;

        await db('players').where({ id: targetId }).update({
            is_banned: !durationHours,
            banned_until: bannedUntil,
            ban_reason: reason?.trim() || null,
        });

        await db('mutes').insert({
            player_id: targetId,
            issued_by: staffId,
            type: 'account',
            reason: reason?.trim() || null,
            expires_at: bannedUntil,
            is_active: true,
        });

        // Disconnect the player
        io.to(`player_${targetId}`).emit('force_logout', {
            message: durationHours
                ? `You have been banned for ${formatHours(durationHours)}. Reason: ${reason || 'No reason given.'}`
                : `You have been permanently banned. Reason: ${reason || 'No reason given.'}`,
        });

        logger.info(`${staff.username} banned ${target.username} (${formatHours(durationHours) || 'permanent'}h): ${reason}`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Ban error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Unban/unmute a player
router.post('/unban', requireAuth, async (req: AuthRequest, res: Response) => {
    const staffId = req.player!.playerId;
    const { targetId, type } = req.body; // type: chat, forum, account
    try {
        const staff = await db('players').where({ id: staffId }).first();
        if (!staff.is_admin && !await hasPermission(staffId, 'can_ban')) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

        await db('mutes').where({ player_id: targetId, type, is_active: true }).update({ is_active: false });

        if (type === 'chat') {
            await db('players').where({ id: targetId }).update({ is_chat_muted: false, chat_muted_until: null });
        } else if (type === 'forum') {
            await db('players').where({ id: targetId }).update({ is_forum_banned: false, forum_banned_until: null });
        } else if (type === 'account') {
            await db('players').where({ id: targetId }).update({ is_banned: false, banned_until: null, ban_reason: null });
        }

        logger.info(`${staff.username} unbanned ${targetId} (${type})`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Update mod permissions
router.post('/mod-permissions', requireAuth, async (req: AuthRequest, res: Response) => {
    const staffId = req.player!.playerId;
    const { targetId, permissions } = req.body;
    try {
        const staff = await db('players').where({ id: staffId }).first();
        if (!staff.is_admin) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }

        const target = await db('players').where({ id: targetId }).first();
        if (!target) {
            res.status(404).json({ error: 'Player not found.' });
            return;
        }

        // Set is_mod if any permissions are granted
        const anyPermission = Object.values(permissions).some(v => v === true);
        await db('players').where({ id: targetId }).update({ is_mod: anyPermission });

        await db('mod_permissions')
            .insert({ player_id: targetId, ...permissions })
            .onConflict(['player_id'])
            .merge();

        logger.info(`${staff.username} updated mod permissions for ${target.username}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Send system message to player
router.post('/message', requireAuth, async (req: AuthRequest, res: Response) => {
    const staffId = req.player!.playerId;
    const { targetId, subject, body } = req.body;
    try {
        if (!await hasPermission(staffId, 'can_send_messages')) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

        await sendSystemMessage(targetId, subject, body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
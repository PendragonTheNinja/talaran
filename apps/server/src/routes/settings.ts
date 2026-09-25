import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { endSessions, issueSession } from '../lib/sessions';
import {
    passwordProblem, hashPassword, passwordMatches, cleanEmail, EMAIL_PROBLEM, isUniqueViolation,
} from '../lib/credentials';
import { sendEmail, emailChangedEmail } from '../lib/email';

const router = Router();

// A guest has no password or email of their own yet. Claiming the character is
// how they get both, so these routes point there instead of failing.
const GUEST_ACCOUNT = 'Claim this character first to set a password and email.';

// Get settings
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const settings = await db('player_settings').where({ player_id: playerId }).first();
        const theme = settings?.theme ?? 'tavern';
        let paletteTokens: Record<string, string> | null = null;
        let paletteName: string | null = null;
        if (theme.startsWith('palette:')) {
            const palette = await db('player_palettes').where({ id: parseInt(theme.slice(8)) }).first();
            if (palette) {
                paletteTokens = typeof palette.tokens === 'string' ? JSON.parse(palette.tokens) : palette.tokens;
                paletteName = palette.name;
            }
        }
        res.json({
            mutedChannels: settings?.muted_channels ? JSON.parse(settings.muted_channels) : [],
            showTravelLog: settings?.show_travel_log ?? true,
            showItemAnimation: settings?.show_item_animation ?? true,
            hideTallyWhenBuilt: settings?.hide_tally_when_built ?? false,
            manualReferenceMode: settings?.manual_reference_mode ?? false,
            theme,
            paletteTokens,
            paletteName,
        });
    } catch (err) {
        res.json({
            mutedChannels: [],
            showTravelLog: true,
            showItemAnimation: true,
            hideTallyWhenBuilt: false,
            manualReferenceMode: false,
            theme: 'tavern',
        });
    }
});

// Change password
//
// The same rules as registration (audit M12): the shared minimum length and
// bcrypt cost from lib/credentials.ts.
router.post('/password', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { currentPassword, newPassword } = req.body;
    try {
        const player = await db('players').where({ id: playerId }).first();
        if (!player) {
            res.status(404).json({ error: 'Account not found.' });
            return;
        }
        if (player.is_guest || !player.password_hash) {
            res.status(400).json({ error: GUEST_ACCOUNT });
            return;
        }
        if (!(await passwordMatches(currentPassword, player.password_hash))) {
            res.status(400).json({ error: 'Current password is incorrect.' });
            return;
        }
        const weak = passwordProblem(newPassword);
        if (weak) {
            res.status(400).json({ error: `${weak}.` });
            return;
        }
        const hash = await hashPassword(newPassword);
        await db('players').where({ id: playerId }).update({ password_hash: hash });

        // Changing a password ends every OTHER session (audit H1): if the
        // player suspects someone has it, that someone is now logged out. This
        // tab carries on with the fresh token in the response.
        await endSessions(playerId);
        const token = await issueSession(playerId);

        logger.info(`Player ${playerId} changed password`);
        res.json({ success: true, token });
    } catch (err) {
        logger.error(`Change password error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Log out of every other device
//
// Ends every session this player has and hands the calling tab a fresh token,
// so it carries on while the rest are signed out on their next request.
router.post('/logout-others', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        await endSessions(playerId);
        const token = await issueSession(playerId);
        logger.info(`Player ${playerId} logged out of other devices`);
        res.json({ success: true, token });
    } catch (err) {
        logger.error(`Logout others error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Change email
//
// Held to the registration rules (audit M12): the address must look like one,
// and "in use" is case-insensitive, matching players_email_lower_unique. The
// new address starts unverified, because verification is proof of THAT
// mailbox, and a notice goes to the old address, which is the only place a
// hijacked owner would hear about it once resets start going elsewhere.
router.post('/email', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { password } = req.body;
    try {
        const player = await db('players').where({ id: playerId }).first();
        if (!player) {
            res.status(404).json({ error: 'Account not found.' });
            return;
        }
        if (player.is_guest || !player.password_hash) {
            res.status(400).json({ error: GUEST_ACCOUNT });
            return;
        }
        if (!(await passwordMatches(password, player.password_hash))) {
            res.status(400).json({ error: 'Password is incorrect.' });
            return;
        }
        const newEmail = cleanEmail(req.body.newEmail);
        if (!newEmail) {
            res.status(400).json({ error: `${EMAIL_PROBLEM}.` });
            return;
        }
        const oldEmail: string | null = player.email ?? null;
        if (oldEmail && oldEmail.toLowerCase() === newEmail.toLowerCase()) {
            res.status(400).json({ error: 'That is already your email.' });
            return;
        }
        const existing = await db('players')
            .whereRaw('LOWER(email) = LOWER(?)', [newEmail])
            .whereNot({ id: playerId })
            .first();
        if (existing) {
            res.status(409).json({ error: 'That email is already in use.' });
            return;
        }

        await db('players').where({ id: playerId }).update({ email: newEmail, email_verified_at: null });
        logger.info(`Player ${playerId} changed email`);

        // After the write, and never allowed to fail the change: the address
        // has already moved, and a mail outage must not make the player think
        // it didn't.
        if (oldEmail) {
            const { subject, html, text } = emailChangedEmail(player.username, newEmail);
            void sendEmail({ to: oldEmail, subject, html, text }).then(sent => {
                if (!sent) logger.error(`[settings] email-change notice failed for player ${playerId}`);
            });
        }

        res.json({ success: true });
    } catch (err) {
        // Two players claiming one address at once: the check above passed for
        // both, and the unique index turned the second away.
        if (isUniqueViolation(err)) {
            res.status(409).json({ error: 'That email is already in use.' });
            return;
        }
        logger.error(`Change email error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update chat settings
router.post('/chat', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { mutedChannels } = req.body;
    try {
        await db('player_settings')
            .insert({ player_id: playerId, muted_channels: JSON.stringify(mutedChannels) })
            .onConflict(['player_id'])
            .merge();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Update travel log preference
router.post('/travel-log', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { showTravelLog } = req.body;
    try {
        await db('player_settings')
            .insert({ player_id: playerId, show_travel_log: !!showTravelLog })
            .onConflict(['player_id'])
            .merge(['show_travel_log']);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Update travel log setting error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Reference mode for the manual. Per account, so it follows the player rather
// than the browser they happened to read on.
router.post('/manual-mode', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { manualReferenceMode } = req.body;
    try {
        await db('player_settings')
            .insert({ player_id: playerId, manual_reference_mode: !!manualReferenceMode })
            .onConflict(['player_id'])
            .merge(['manual_reference_mode']);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Update manual mode setting error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update item animation preference
router.post('/item-animation', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { showItemAnimation } = req.body;
    try {
        await db('player_settings')
            .insert({ player_id: playerId, show_item_animation: !!showItemAnimation })
            .onConflict(['player_id'])
            .merge(['show_item_animation']);
        res.json({ success: true });
    } catch (err) {
        // Logged, because a silent 500 here is undiagnosable from the client: the
        // GET falls back to `?? true` when the column is missing, so the toggle
        // renders fine and only the write fails.
        logger.error(`Update item animation setting error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update tally board link preference
router.post('/tally-link', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { hideTallyWhenBuilt } = req.body;
    try {
        await db('player_settings')
            .insert({ player_id: playerId, hide_tally_when_built: !!hideTallyWhenBuilt })
            .onConflict(['player_id'])
            .merge(['hide_tally_when_built']);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Update tally link setting error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update theme preference. Free themes for everyone; premium themes require
// the matching player_unlocks row ('theme:<id>').
const FREE_THEMES = ['tavern', 'scriptorium'];
const PREMIUM_THEMES = ['moonveil', 'mosswood', 'forgeheart'];
router.post('/theme', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { theme } = req.body;
    try {
        if (typeof theme !== 'string' || (!FREE_THEMES.includes(theme) && !PREMIUM_THEMES.includes(theme) && !theme.startsWith('palette:'))) {
            res.status(400).json({ error: 'Unknown theme.' });
            return;
        }
        if (PREMIUM_THEMES.includes(theme)) {
            const unlock = await db('player_unlocks')
                .where({ player_id: playerId, unlock_key: `theme:${theme}` })
                .first();
            if (!unlock) {
                res.status(403).json({ error: 'You have not unlocked that theme.' });
                return;
            }
        }
        if (theme.startsWith('palette:')) {
            const paletteId = parseInt(theme.slice(8));
            const perk = await db('player_unlocks')
                .where({ player_id: playerId, unlock_key: 'perk:custom_palette' })
                .first();
            if (!perk) {
                res.status(403).json({ error: 'Custom Palettes is a supporter perk.' });
                return;
            }
            const palette = Number.isInteger(paletteId)
                ? await db('player_palettes').where({ id: paletteId }).first()
                : null;
            if (!palette || (palette.player_id !== playerId && !palette.is_shared)) {
                res.status(404).json({ error: 'Palette not found or not shared.' });
                return;
            }
        }
        await db('player_settings')
            .insert({ player_id: playerId, theme })
            .onConflict(['player_id'])
            .merge(['theme']);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
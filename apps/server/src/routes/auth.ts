import { Router, Request, Response } from 'express';
import db from '../db';
import { Player } from '../types';
import { logger } from '../lib/logger';
import crypto from 'crypto';
import { sendEmail, passwordResetEmail } from '../lib/email';
import { requireAuthToClaim, AuthRequest } from '../middleware/auth';
import { createGuest, GuestCapacityError, GUEST_SESSION_MINUTES } from '../services/guest';
import { issueSession, endSessions } from '../lib/sessions';
import {
  passwordProblem, hashPassword, passwordMatches, cleanEmail, cleanUsername, EMAIL_PROBLEM, isUniqueViolation,
} from '../lib/credentials';
import { setUpNewPlayerWithin } from '../services/newPlayer';

const router = Router();

// Register
router.post('/register', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !req.body.email || !password) {
    res.status(400).json({ error: 'Username, email and password are required' });
    return;
  }

  // One rule for every chosen name (lib/credentials.ts): type, length, the
  // characters allowed, and the reserved guest suffix (audit L-4).
  const name = cleanUsername(username);
  if (!name.ok) {
    res.status(400).json({ error: name.error });
    return;
  }

  const email = cleanEmail(req.body.email);
  if (!email) {
    res.status(400).json({ error: EMAIL_PROBLEM });
    return;
  }

  const weak = passwordProblem(password);
  if (weak) {
    res.status(400).json({ error: weak });
    return;
  }


  try {
    // Case-insensitive on both. Registration was comparing exactly, so
    // "Pendragon" and "pendragon" could both exist — which makes impersonation
    // trivial and makes any case-insensitive lookup elsewhere (whispers, for one)
    // pick between them arbitrarily.
    const existing = await db('players')
      .whereRaw('LOWER(username) = LOWER(?)', [name.value])
      .orWhereRaw('LOWER(email) = LOWER(?)', [email])
      .first();

    if (existing) {
      res.status(409).json({ error: 'Username or email already taken' });
      return;
    }

    const password_hash = await hashPassword(password);

    // The account and everything a new character starts with, as one unit
    // (audit L-4): a failure part way used to leave an account with no skills.
    const player = await db.transaction(async (trx) => {
      const startingLocation = await trx('locations').where({ name: 'Talador' }).first();
      const [created] = await trx('players')
        .insert({
          username: name.value,
          email,
          password_hash,
          current_location_id: startingLocation?.id || null,
        })
        .returning(['id', 'username', 'email']);
      await setUpNewPlayerWithin(trx, created.id);
      return created;
    });

    // Initialize all skills at 0 XP for the new player
    const token = await issueSession(player.id)

    logger.info(`New player registered: ${player.username}`);
    res.status(201).json({ token, player });
  } catch (err) {
    // Two sign-ups racing for one name or address: the check above passed
    // for both, and the unique index turned the second away.
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: 'Username or email already taken' });
      return;
    }
    logger.error(`Registration error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  try {
    // Matching registration: someone who signed up as "Pendragon" should be able
    // to log in as "pendragon".
    const player = await db('players')
      .whereRaw('LOWER(username) = LOWER(?)', [username])
      .first() as Player | undefined;

    if (!player) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    // Password FIRST, then the ban (audit M9).
    //
    // The ban checks used to come first, so anyone who knew a username could
    // learn whether that account was banned, until when, and the moderator's
    // reason, without knowing the password. A ban and its reason are the
    // account holder's business: they are told only once they have proven it
    // is theirs, and everyone else gets the same answer as a wrong password.
    // A guest has no password, so a guest's name gets the same answer as a
    // wrong password rather than a 500.
    const valid = await passwordMatches(password, player.password_hash);

    if (!valid) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    if (player.is_banned) {
      res.status(403).json({ error: 'This account has been permanently banned.' });
      return;
    }

    if (player.banned_until && new Date(player.banned_until) > new Date()) {
      const until = new Date(player.banned_until).toLocaleDateString()
      res.status(403).json({ error: `Your account is banned until ${until}. Reason: ${player.ban_reason || 'No reason given.'}` });
      return;
    }

    await db('players')
      .where({ id: player.id })
      .update({ last_login: new Date() });

    const token = await issueSession(player.id)

    logger.info(`Player logged in: ${username}`);
    res.json({ token, player: { id: player.id, username: player.username, email: player.email } });
  } catch (err) {
    logger.error(`Login error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Password reset -------------------------------------------------------
// Tokens are stored HASHED (a DB leak must not yield usable reset links),
// are single-use, and expire in 1 hour. /forgot-password never reveals whether
// an email is registered.

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;      // 1 hour
const RESET_COOLDOWN_MS = 60 * 1000;            // min gap between requests per email
const resetCooldown = new Map<string, number>();

function hashResetToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

router.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body;
  // Same response in every case — no account-existence enumeration.
  const generic = { message: 'If an account exists for that email, a reset link is on its way.' };
  try {
    if (!email || typeof email !== 'string') {
      res.json(generic);
      return;
    }
    const normalized = email.trim().toLowerCase();

    const last = resetCooldown.get(normalized);
    if (last && Date.now() - last < RESET_COOLDOWN_MS) {
      res.json(generic);
      return;
    }
    resetCooldown.set(normalized, Date.now());

    const player = await db('players').whereRaw('LOWER(email) = ?', [normalized]).first();
    if (player) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      await db('players').where({ id: player.id }).update({
        reset_token: hashResetToken(rawToken),
        reset_token_expires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      });
      const base = process.env.CLIENT_URL || 'https://talaran.net';
      const link = `${base}/reset-password?token=${rawToken}`;
      const { subject, html, text } = passwordResetEmail(player.username, link);
      const sent = await sendEmail({ to: player.email, subject, html, text });
      if (!sent) logger.error(`[auth] reset email failed to send for player ${player.id}`);
    }
    res.json(generic);
  } catch (err) {
    logger.error(`Forgot-password error: ${err}`);
    res.json(generic);
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  const { token, password } = req.body;
  try {
    if (!token || typeof token !== 'string' || !password || typeof password !== 'string') {
      res.status(400).json({ error: 'Invalid request.' });
      return;
    }
    const weak = passwordProblem(password);
    if (weak) {
      res.status(400).json({ error: weak });
      return;
    }
    const player = await db('players')
      .where({ reset_token: hashResetToken(token) })
      .andWhere('reset_token_expires', '>', new Date())
      .first();
    if (!player) {
      res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
      return;
    }
    const password_hash = await hashPassword(password);
    await db('players').where({ id: player.id }).update({
      password_hash,
      reset_token: null,
      reset_token_expires: null,
    });
    // A reset is what the owner does when someone else has the account. Every
    // session issued before it ends now, sockets included, or the person who
    // took it stays logged in with the token they already hold (audit H1).
    await endSessions(player.id, db, { disconnect: true });
    logger.info(`[auth] password reset completed for player ${player.id}`);
    res.json({ success: true, message: 'Your password has been reset. You can now log in.' });
  } catch (err) {
    logger.error(`Reset-password error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Guest sessions ────────────────────────────────────────────────────────

// Create a throwaway character and drop straight into the game. No email, no
// password, no username to pick. This is the whole answer to "I am not
// signing up to find out whether your game is any good".
router.post('/guest', async (req: Request, res: Response) => {
  try {
    const guest = await createGuest();
    if (!guest) {
      res.status(503).json({ error: 'Could not start a guest session. Please try again.' });
      return;
    }

    // A day; the guest deadline column is the real limit.
    const token = await issueSession(guest.id, { isGuest: true });

    res.status(201).json({
      token,
      player: {
        id: guest.id,
        username: guest.username,
        email: null,
        is_guest: true,
        guest_expires_at: guest.guest_expires_at,
      },
      guest: {
        isGuest: true,
        expiresAt: guest.guest_expires_at,
        sessionMinutes: GUEST_SESSION_MINUTES,
      },
    });
  } catch (err) {
    if (err instanceof GuestCapacityError) {
      res.status(503).json({
        error: 'Too many people are trying the game right now. Please try again shortly, or register an account.',
        reason: 'guest_capacity',
      });
      return;
    }
    logger.error(`Guest creation error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Turn a guest into a real account, keeping every bit of progress. Because a
// guest is already a row in `players`, this is an UPDATE: no rows move, no
// foreign keys change, nothing has to be copied across.
// requireAuthToClaim, not requireAuth: an expired guest must get through here,
// and only here. Behind requireAuth every claim by an expired guest was refused
// with "claim your character to keep playing".
router.post('/upgrade', requireAuthToClaim, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { username, password } = req.body;

  if (!username || !req.body.email || !password) {
    res.status(400).json({ error: 'Username, email and password are required' });
    return;
  }
  // One rule for every chosen name (lib/credentials.ts): type, length, the
  // characters allowed, and the reserved guest suffix (audit L-4).
  const name = cleanUsername(username);
  if (!name.ok) {
    res.status(400).json({ error: name.error });
    return;
  }
  const email = cleanEmail(req.body.email);
  if (!email) {
    res.status(400).json({ error: EMAIL_PROBLEM });
    return;
  }
  const weak = passwordProblem(password);
  if (weak) {
    res.status(400).json({ error: weak });
    return;
  }

  try {
    const player = await db('players').where({ id: playerId }).first();
    if (!player) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    if (!player.is_guest) {
      res.status(400).json({ error: 'This account is already a full account.' });
      return;
    }

    // Deliberately no expiry check. A lapsed guest inside the retention window
    // should still be able to claim their character — that player came back,
    // which is the entire outcome this feature exists to produce.
    const clash = await db('players')
      .whereNot({ id: playerId })
      .andWhere(function () {
        this.whereRaw('LOWER(username) = LOWER(?)', [name.value])
          .orWhereRaw('LOWER(email) = LOWER(?)', [email]);
      })
      .first();

    if (clash) {
      res.status(409).json({ error: 'Username or email already taken' });
      return;
    }

    const password_hash = await hashPassword(password);

    await db.transaction(async (trx) => {
      await trx('players').where({ id: playerId }).update({
        username: name.value,
        email,
        password_hash,
        is_guest: false,
        guest_expires_at: null,
        // Left unverified on purpose. Once ENFORCE_EMAIL_VERIFICATION is on,
        // an upgraded account is in exactly the same position as any other new
        // registration, which is the point of having one predicate.
        email_verified_at: null,
      });
      // End every earlier session, the guest token included, so only the token
      // handed back below works from here on. This also drops the cached
      // session row, which still says "expired guest": without that, the new
      // token was refused as an expired guest for up to thirty seconds and the
      // claim panel reopened straight after a successful claim.
      await endSessions(playerId, trx);
    });

    const [{ started }] = await db('players')
      .where({ was_guest: true })
      .count<{ started: string }[]>('id as started');
    const [{ converted }] = await db('players')
      .where({ was_guest: true, is_guest: false })
      .count<{ converted: string }[]>('id as converted');

    logger.info(
      `[guest] converted ${player.username} -> ${name.value} (player ${playerId}); `
      + `${converted}/${started} guests claimed to date`,
    );

    const token = await issueSession(playerId);

    res.json({ token, player: { id: playerId, username: name.value, email, is_guest: false } });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: 'Username or email already taken' });
      return;
    }
    logger.error(`Guest upgrade error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
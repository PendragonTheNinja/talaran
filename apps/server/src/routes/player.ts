import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { levelFromXp, xpToNextLevel } from '../services/xp';
import { Request } from 'express';
import { connectedPlayers } from '../index';

const router = Router();

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const totalPlayers = await db('players').count('id as count').first();
    const onlinePlayers = connectedPlayers.size;
    res.json({
      totalPlayers: parseInt(totalPlayers?.count as string) || 0,
      onlinePlayers,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current player data including skills
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;

  try {
    const player = await db('players')
  .where({ id: playerId })
  .select('id', 'username', 'email', 'current_location_id', 'has_seen_welcome', 'is_admin', 'is_mod')
  .first();

    console.log('Player me result:', player);

    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    // Get all skills with player XP
    const skills = await db('skills')
      .leftJoin('player_skills', function() {
        this.on('skills.id', '=', 'player_skills.skill_id')
          .andOn('player_skills.player_id', '=', db.raw('?', [playerId]));
      })
      .select(
        'skills.id',
        'skills.name',
        'skills.type',
        'player_skills.xp'
      )
      .orderBy('skills.name');

    const skillsWithLevels = skills.map((skill: any) => {
      const xp = parseInt(skill.xp) || 0;
      const level = levelFromXp(xp);
      return {
        id: skill.id,
        name: skill.name,
        type: skill.type,
        xp,
        level,
        xpToNext: xpToNextLevel(xp),
      };
    });

    const totalLevel = skillsWithLevels.reduce((sum: number, s: any) => sum + s.level, 0);
    const totalXp = skillsWithLevels.reduce((sum: number, s: any) => sum + parseInt(s.xp) || 0, 0);

    // Get current action if any
    const currentAction = await db('player_actions')
      .where({ player_id: playerId })
      .first();

    res.json({
      player,
      skills: skillsWithLevels,
      totalLevel,
      totalXp,
      currentAction: currentAction || null,
    });

  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }

  router.post('/welcome-seen', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  try {
    await db('players').where({ id: playerId }).update({ has_seen_welcome: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});
});

export default router;
import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { levelFromXp, xpToNextLevel, xpProgressInLevel } from '../services/xp';
import { Request } from 'express';
import { connectedPlayers } from '../index';
import { logger } from '../index';

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
      .leftJoin('player_skills', function () {
        this.on('skills.id', '=', 'player_skills.skill_id')
          .andOn('player_skills.player_id', '=', db.raw('?', [playerId]));
      })
      .select(
        'skills.id',
        'skills.name',
        'skills.type',
        'player_skills.xp'
      )
      .where('skills.is_implemented', true)
      .orderBy('skills.display_order');

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
        progress: xpProgressInLevel(xp),
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

  router.get('/:id/profile', requireAuth, async (req: AuthRequest, res: Response) => {
    const targetId = parseInt(req.params.id as string);
    try {
      const player = await db('players')
        .where({ 'players.id': targetId })
        .leftJoin('locations', 'players.current_location_id', 'locations.id')
        .select(
          'players.id',
          'players.username',
          'players.guild_tag',
          'players.guild_role',
          'players.forum_post_count',
          'players.created_at',
          'players.last_login',
          'players.total_seconds_played',
        )
        .first();

      if (!player) {
        res.status(404).json({ error: 'Player not found.' });
        return;
      }

      const skills = await db('player_skills')
        .where({ player_id: targetId })
        .join('skills', 'player_skills.skill_id', 'skills.id')
        .where('skills.is_implemented', true)
        .select('skills.name', 'skills.type', 'player_skills.xp');

      const equipment = await db('player_equipment')
        .where({ player_id: targetId })
        .leftJoin('items as head', 'player_equipment.head_item_id', 'head.id')
        .leftJoin('items as neck', 'player_equipment.neck_item_id', 'neck.id')
        .leftJoin('items as back', 'player_equipment.back_item_id', 'back.id')
        .leftJoin('items as chest', 'player_equipment.chest_item_id', 'chest.id')
        .leftJoin('items as mainhand', 'player_equipment.mainhand_item_id', 'mainhand.id')
        .leftJoin('items as offhand', 'player_equipment.offhand_item_id', 'offhand.id')
        .leftJoin('items as legs', 'player_equipment.legs_item_id', 'legs.id')
        .leftJoin('items as hands', 'player_equipment.hands_item_id', 'hands.id')
        .leftJoin('items as feet', 'player_equipment.feet_item_id', 'feet.id')
        .leftJoin('items as finger', 'player_equipment.finger_item_id', 'finger.id')
        .leftJoin('items as mount', 'player_equipment.mount_item_id', 'mount.id')
        .leftJoin('items as trophy', 'player_equipment.trophy_item_id', 'trophy.id')
        .select(
          'head.name as head', 'neck.name as neck', 'back.name as back',
          'chest.name as chest', 'mainhand.name as mainhand', 'offhand.name as offhand',
          'legs.name as legs', 'hands.name as hands', 'feet.name as feet',
          'finger.name as finger', 'mount.name as mount', 'trophy.name as trophy',
        )
        .first();

      // Calculate levels and totals
      const { levelFromXp } = await import('../services/xp');
      const skillsWithLevels = skills.map(s => ({
        name: s.name,
        type: s.type,
        xp: parseInt(s.xp),
        level: levelFromXp(parseInt(s.xp)),
      }));

      const totalLevel = skillsWithLevels.reduce((sum, s) => sum + s.level, 0);
      const totalXp = skillsWithLevels.reduce((sum, s) => sum + s.xp, 0);

      res.json({ player, skills: skillsWithLevels, equipment, totalLevel, totalXp });
    } catch (err) {
      logger.error(`Profile error: ${err}`);
      res.status(500).json({ error: 'Server error' });
    }
  });
});

export default router;
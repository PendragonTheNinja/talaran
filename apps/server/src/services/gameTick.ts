import { Server } from 'socket.io';
import db from '../db';
import { logger } from '../index';
import { processWoodcuttingAction, calculateTimer } from './woodcutting';
import { levelFromXp, xpToNextLevel, xpForLevel } from './xp';
import { processMiningRock, processMiningVein, checkVeinAnnouncements } from './mining';
import { smeltIngots, smithPart, collectKiln, SMELT_RECIPES, SMITH_RECIPES, getSmithingCost } from './smithing';
import { sawPlanks, woodwork, SAW_RECIPES, WOODWORK_RECIPES } from './carpentry';
import { canMineHere, canMineVein, getActiveVeins, calculateMiningTimer } from '../services/mining';
import { isBotCheckDue, issueBotCheck } from './botCheck';
import { AGILITY_XP_RATE, EQUITATION_XP_RATE } from './travel'
import { rollTravelEvents } from './travelEvents'

const TICK_INTERVAL = 2000;

export function startGameTick(io: Server): void {
  logger.info('Game tick started');

  setInterval(async () => {
    try {
      await checkVeinAnnouncements();
      const completedActions = await db('player_actions')
        .where('completes_at', '<=', new Date())
        .where('bot_check_pending', false);
      for (const action of completedActions) {
        await processCompletedAction(io, action);
      }
    } catch (err) {
      logger.error(`Game tick error: ${err}`);
    }
  }, TICK_INTERVAL);
}

async function processTravelAction(playerId: number, locationId: number): Promise<any> {
  try {
    await db('players').where({ id: playerId }).update({ current_location_id: locationId });
    const location = await db('locations').where({ id: locationId }).first();
    logger.info(`Player ${playerId} arrived at ${location.name}`);
    return { success: true, locationName: location.name };
  } catch (err) {
    logger.error(`Travel completion error: ${err}`);
    return { success: false };
  }
}

async function processHunt(playerId: number, animalId: number): Promise<any> {
  try {
    const { resolveHunt } = await import('./hunting');
    const outcome = await resolveHunt(playerId, animalId);
    return { success: true, hunt: outcome };
  } catch (err) {
    logger.error(`Hunt completion error: ${err}`);
    return { success: false };
  }
}

async function processCompletedAction(io: Server, action: any): Promise<void> {
  try {
    let result: any;

    const now = new Date();
    const player = await db('players').where({ id: action.player_id }).first();
    if (player && isBotCheckDue(player, now)) {
      await issueBotCheck(action.player_id);
      // Freeze this action so the tick stops reprocessing it until they answer.
      await db('player_actions').where({ id: action.id }).update({ bot_check_pending: true });
      return;
    }

    switch (action.action_type) {
      case 'woodcutting':
        result = await processWoodcuttingAction(action.player_id, action.resource_node_id);
        break;
      case 'traveling':
        result = await processTravelAction(action.player_id, action.location_id);
        break;
      case 'mining_rock':
        result = await processMiningRock(action.player_id, action.resource_node_id);
        break;
      case 'mining_vein':
        result = await processMiningVein(action.player_id, action.action_data);
        break;
      case 'smelting':
        result = await smeltIngots(action.player_id, action.location_id, action.action_data);
        break;
      case 'smithing':
        result = await smithPart(
          action.player_id,
          action.location_id,
          action.action_data.split('_').slice(1).join('_'),
          action.action_data.split('_')[0]
        );
        break;
      case 'kiln_collect':
        result = await collectKiln(action.player_id, action.location_id);
        break;
      case 'sawing':
        result = await sawPlanks(action.player_id, action.location_id, action.action_data);
        break;
      case 'woodworking':
        result = await woodwork(action.player_id, action.location_id, action.action_data);
        break;
      case 'hunting':
        result = await processHunt(action.player_id, action.action_data);
        break;
      default:
        logger.warn(`Unknown action type: ${action.action_type}`);
        await db('player_actions').where({ id: action.id }).delete();
        return;
    }

    // Handle travel
    if (action.action_type === 'traveling') {
      await db('player_actions').where({ id: action.id }).delete();

      // XP is based on the BASE travel time (stashed in action_data at start),
      // so getting faster never reduces XP per trip.
      const baseTime = action.action_data ? parseInt(action.action_data) : 120;

      const equipment = await db('player_equipment').where({ player_id: action.player_id }).first();
      const hasMountEquipped = equipment?.mount_item_id !== null && equipment?.mount_item_id !== undefined;
      const skillName = hasMountEquipped ? 'Equitation' : 'Agility';
      const rate = hasMountEquipped ? EQUITATION_XP_RATE : AGILITY_XP_RATE;
      const travelXp = Math.round(baseTime * rate);

      const travelSkill = await db('skills').where({ name: skillName }).first();
      if (travelSkill) {
        await db('player_skills')
          .where({ player_id: action.player_id, skill_id: travelSkill.id })
          .increment('xp', travelXp);
      }

      // Build a result for the arrival screen (mirrors action_complete shape)
      const updatedSkill = await db('player_skills')
        .where({ player_id: action.player_id, skill_id: travelSkill?.id })
        .first();
      const destination = await db('locations').where({ id: action.location_id }).first();

      const totalXpNow = updatedSkill ? parseInt(updatedSkill.xp) : travelXp;
      const lvl = levelFromXp(totalXpNow);

      // ── Travel find-events ────────────────────────────────────────
      // Region of the destination drives the eligible event pool.
      const destRegion = destination?.region || 'Taiar Island'
      const agiLevelForLuck = skillName === 'Agility' ? lvl : 1  // mounted: no foraging luck for now
      const rolledEvents = skillName === 'Agility'
        ? rollTravelEvents(baseTime, destRegion, agiLevelForLuck)
        : []  // Equitation finds come later; Sailing will use this too

      // Add any found items to inventory (mirrors the gathering inventory-add pattern)
      for (const ev of rolledEvents) {
        const foundItem = await db('items').where({ name: ev.itemName }).first()
        if (!foundItem) continue
        const existing = await db('player_inventory')
          .where({ player_id: action.player_id, item_id: foundItem.id })
          .first()
        if (existing) {
          await db('player_inventory')
            .where({ player_id: action.player_id, item_id: foundItem.id })
            .increment('quantity', ev.quantity)
        } else {
          await db('player_inventory').insert({
            player_id: action.player_id,
            item_id: foundItem.id,
            quantity: ev.quantity,
          })
        }
      }

      // Write a persistent travel-log entry ONLY if something happened, then prune to 50
      if (rolledEvents.length > 0) {
        const fromLoc = await db('locations').where({ id: player?.current_location_id }).first()
        await db('travel_log').insert({
          player_id: action.player_id,
          from_location: fromLoc?.name || 'Unknown',
          to_location: destination?.name || 'Unknown',
          skill_name: skillName,
          events: JSON.stringify(rolledEvents),
        })

        // Keep only the newest 50 entries for this player
        const toDelete = await db('travel_log')
          .where({ player_id: action.player_id })
          .orderBy('created_at', 'desc')
          .offset(50)
          .select('id')
        if (toDelete.length > 0) {
          await db('travel_log').whereIn('id', toDelete.map(r => r.id)).delete()
        }
      }

      io.to(`player_${action.player_id}`).emit('travel_complete', {
        result: {
          itemName: null,
          xpAwarded: travelXp,
          skillName,
          totalXp: totalXpNow,
          level: lvl,
          xpToNext: xpToNextLevel(totalXpNow),
          xpAtLevel: xpForLevel(lvl),
          destination: destination?.name || 'your destination',
          drops: rolledEvents.map(e => ({ name: e.itemName, quantity: e.quantity })),
          events: rolledEvents,  // ← full event log for this walk (message + item)
        },
        xpInfo: travelSkill ? {
          skillName,
          leveledUp: false,
        } : undefined,
      });
      return;
    }

    // Handle hunting (bespoke: missed hunts still award XP + continue; arrows consume/recover)
    if (action.action_type === 'hunting') {
      const hunt = result.hunt;
      const animalId = action.action_data ? parseInt(action.action_data) : null;
      const animal = animalId ? await db('huntable_animals').where({ id: animalId }).first() : null;

      if (!animal || !hunt) {
        await db('player_actions').where({ id: action.id }).delete();
        return;
      }

      const huntingSkill = await db('skills').where({ name: 'Hunting' }).first();

      // ── Award XP (full on success, reduced on miss) ──
      if (huntingSkill) {
        await db('player_skills')
          .where({ player_id: action.player_id, skill_id: huntingSkill.id })
          .increment('xp', hunt.xp);
      }

      // ── Consume one arrow; recover it on the roll ──
      const arrowItem = await db('items').where({ name: 'Ambren Arrow' }).first();
      let outOfArrows = false;
      if (arrowItem) {
        const arrowRow = await db('player_inventory')
          .where({ player_id: action.player_id, item_id: arrowItem.id }).first();
        const netChange = hunt.arrowRecovered ? 0 : -1;
        const newQty = (arrowRow?.quantity || 0) + netChange;
        if (newQty <= 0) {
          if (arrowRow) await db('player_inventory')
            .where({ player_id: action.player_id, item_id: arrowItem.id }).delete();
          outOfArrows = true;
        } else {
          await db('player_inventory')
            .where({ player_id: action.player_id, item_id: arrowItem.id }).update({ quantity: newQty });
        }
      }

      // ── Add drops (on success) ──
      const addedDrops: { name: string; quantity: number; notable: boolean }[] = [];
      for (const d of hunt.drops) {
        const item = await db('items').where({ name: d.itemName }).first();
        if (!item) continue;
        const existing = await db('player_inventory')
          .where({ player_id: action.player_id, item_id: item.id }).first();
        if (existing) {
          await db('player_inventory')
            .where({ player_id: action.player_id, item_id: item.id }).increment('quantity', d.quantity);
        } else {
          await db('player_inventory')
            .insert({ player_id: action.player_id, item_id: item.id, quantity: d.quantity });
        }
        addedDrops.push({ name: d.itemName, quantity: d.quantity, notable: (d as any).notable });
      }

      // ── XP info for the result screen ──
      const updatedSkill = await db('player_skills')
        .where({ player_id: action.player_id, skill_id: huntingSkill?.id }).first();
      const currentXp = updatedSkill ? parseInt(updatedSkill.xp.toString()) : 0;
      const previousXp = currentXp - hunt.xp;
      const currentLevel = levelFromXp(currentXp);
      const previousLevel = levelFromXp(previousXp);
      const leveledUp = currentLevel > previousLevel;
      const xpNeeded = xpToNextLevel(currentXp);
      const xpAtLevel = xpForLevel(currentLevel);

      // ── Auto-restart unless out of arrows ──
      if (!outOfArrows) {
        const playerLevel = currentLevel;
        const { calculateHuntTimer } = await import('./hunting');
        const nextTimer = calculateHuntTimer(animal.base_timer, animal.min_timer, playerLevel, animal.required_level);
        const nextCompletion = new Date(now.getTime() + nextTimer * 1000);

        await db('player_actions').where({ id: action.id }).update({
          completes_at: nextCompletion,
          last_timer_seconds: nextTimer,
        });

        io.to(`player_${action.player_id}`).emit('action_complete', {
          actionType: action.action_type,
          result: {
            itemName: null,
            huntSuccess: hunt.success,
            animalName: hunt.animalName,
            arrowRecovered: hunt.arrowRecovered,
            xpAwarded: hunt.xp,
            skillName: 'Hunting',
            drops: addedDrops,
          },
          nextCompletes: nextCompletion,
          timerSeconds: nextTimer,
          xpInfo: { totalXp: currentXp, level: currentLevel, xpToNext: xpNeeded, leveledUp, xpAtLevel },
        });
      } else {
        await db('player_actions').where({ id: action.id }).delete();
        io.to(`player_${action.player_id}`).emit('action_complete', {
          actionType: action.action_type,
          result: {
            itemName: null,
            huntSuccess: hunt.success,
            animalName: hunt.animalName,
            arrowRecovered: hunt.arrowRecovered,
            xpAwarded: hunt.xp,
            skillName: 'Hunting',
            drops: addedDrops,
            ended: 'materials',
          },
          xpInfo: { totalXp: currentXp, level: currentLevel, xpToNext: xpNeeded, leveledUp, xpAtLevel },
        });
      }
      return;
    }

    // Handle failed actions
    if (!result.success) {
      await db('player_actions').where({ id: action.id }).delete();
      io.to(`player_${action.player_id}`).emit('action_failed', {
        error: result.error || 'Action failed',
      });
      return;
    }

    // Handle vein mining (no resource_node_id)
    if (action.action_type === 'mining_vein') {
      const vein = await db('ore_veins').where({ id: action.action_data }).first();
      if (!vein || vein.is_depleted) {
        // Find the rock node at this location and auto-restart
        const rockNode = await db('resource_nodes')
          .where({ location_id: action.location_id, skill: 'mining' })
          .whereNull('ore_subtype')
          .first();

        if (rockNode) {
          const miningSkill = await db('skills').where({ name: 'Mining' }).first();
          const playerSkillRow = await db('player_skills')
            .where({ player_id: action.player_id, skill_id: miningSkill.id })
            .first();
          const playerLevel = levelFromXp(playerSkillRow?.xp ? parseInt(playerSkillRow.xp) : 0);

          const equipment = await db('player_equipment').where({ player_id: action.player_id }).first();
          const tool = equipment?.mainhand_item_id
            ? await db('items').where({ id: equipment.mainhand_item_id }).first()
            : null;

          const nextTimer = calculateTimer(
            rockNode.base_timer,
            rockNode.min_timer,
            playerLevel,
            rockNode.required_level,
            tool ? tool.tier : 1,
            rockNode.required_tool_tier
          );

          const nextCompletion = new Date(now.getTime() + nextTimer * 1000);

          await db('player_actions').where({ id: action.id }).update({
            action_type: 'mining_rock',
            resource_node_id: rockNode.id,
            action_data: null,
            completes_at: nextCompletion,
            last_timer_seconds: nextTimer,
          });

          io.to(`player_${action.player_id}`).emit('vein_depleted', {
            oreName: vein ? (await db('items').where({ id: vein.ore_item_id }).first())?.name : 'Unknown',
          });

          io.to(`player_${action.player_id}`).emit('action_switched', {
            newActionType: 'mining_rock',
            nodeName: rockNode.name,
            timerSeconds: nextTimer,
          });
        } else {
          await db('player_actions').where({ id: action.id }).delete();
          io.to(`player_${action.player_id}`).emit('vein_depleted', {
            oreName: 'Unknown',
          });
        }
        return;
      }

      const miningSkill = await db('skills').where({ name: 'Mining' }).first();
      const playerSkillRow = await db('player_skills')
        .where({ player_id: action.player_id, skill_id: miningSkill.id })
        .first();
      const playerLevel = levelFromXp(playerSkillRow?.xp ? parseInt(playerSkillRow.xp) : 0);
      const oreItem = await db('items').where({ id: vein.ore_item_id }).first()
      const oreNode = await db('resource_nodes')
        .where({ location_id: action.location_id, skill: 'mining' })
        .whereNotNull('ore_subtype')
        .first();

      const baseTimer = oreNode?.base_timer || 28;
      const minTimer = oreNode?.min_timer || 25;
      const requiredLevel = oreNode?.required_level || 1;
      const requiredToolTier = oreNode?.required_tool_tier || 1;

      const equipment = await db('player_equipment').where({ player_id: action.player_id }).first();
      const playerTool = equipment?.mainhand_item_id
        ? await db('items').where({ id: equipment.mainhand_item_id, subtype: 'pickaxe' }).first()
        : null;

      if (!playerTool) {
        await db('player_actions').where({ id: action.id }).delete();
        io.to(`player_${action.player_id}`).emit('action_failed', {
          error: 'You no longer have a pickaxe equipped. Mining stopped.',
        });
        return;
      }
      const playerToolTier = playerTool.tier || 1;

      const nextTimer = calculateMiningTimer(baseTimer, minTimer, playerLevel, requiredLevel, playerToolTier, requiredToolTier);
      const nextCompletion = new Date(now.getTime() + nextTimer * 1000);

      await db('player_actions').where({ id: action.id }).update({
        completes_at: nextCompletion,
        last_timer_seconds: nextTimer,
      });
      const updatedSkill = await db('player_skills')
        .where({ player_id: action.player_id, skill_id: miningSkill.id })
        .first();
      const currentXp = updatedSkill ? parseInt(updatedSkill.xp.toString()) : 0;
      const previousXp = currentXp - (result.xpAwarded || 0);
      const currentLevel = levelFromXp(currentXp);
      const previousLevel = levelFromXp(previousXp);
      const leveledUp = currentLevel > previousLevel;
      const xpNeeded = xpToNextLevel(currentXp);
      const xpAtLevel = xpForLevel(currentLevel)
      const updatedVein = await db('ore_veins').where({ id: action.action_data }).first();

      io.to(`player_${action.player_id}`).emit('action_complete', {
        actionType: action.action_type,
        result: {
          ...result,
          remainingQuantity: updatedVein?.remaining_quantity ?? 0,
        },
        nextCompletes: nextCompletion,
        timerSeconds: nextTimer,
        xpInfo: { totalXp: currentXp, level: currentLevel, xpToNext: xpNeeded, leveledUp, xpAtLevel },
      });
      return;
    }

    if (action.action_type === 'smelting' || action.action_type === 'smithing') {
      // Check resources before restarting timer
      const recipe = action.action_type === 'smelting'
        ? SMELT_RECIPES[action.action_data]
        : SMITH_RECIPES[action.action_data];

      if (recipe) {
        for (const ingredient of recipe.ingredients) {
          const item = await db('items').where({ name: ingredient.name }).first();
          const inv = item ? await db('player_inventory')
            .where({ player_id: action.player_id, item_id: item.id })
            .first() : null;
          if (!inv || inv.quantity < ingredient.quantity) {
            await db('player_actions').where({ id: action.id }).delete();

            const smithingSkill2 = await db('skills').where({ name: 'Smithing' }).first();
            const lastSkill = await db('player_skills')
              .where({ player_id: action.player_id, skill_id: smithingSkill2.id })
              .first();
            const lastXp = lastSkill ? parseInt(lastSkill.xp.toString()) : 0;
            const lastLevel = levelFromXp(lastXp);
            const lastXpNeeded = xpToNextLevel(lastXp);
            const xpAtLevel = xpForLevel(lastLevel)

            io.to(`player_${action.player_id}`).emit('action_complete', {
              actionType: action.action_type,
              result,
              nextCompletes: null,
              timerSeconds: 0,
              xpInfo: { totalXp: lastXp, level: lastLevel, xpToNext: lastXpNeeded, xpAtLevel, leveledUp: false },
            });

            io.to(`player_${action.player_id}`).emit('action_failed', {
              error: `Out of ${ingredient.name}. Smithing stopped.`,
              info: true,
            });
            return;
          }
        }
      }

      const baseTimer = action.action_type === 'smelting'
        ? (SMELT_RECIPES[action.action_data]?.timer ?? 45)
        : getSmithingCost(action.action_data || '').timer;
      const timerSeconds = action.using_blacksmith ? baseTimer * 2 : baseTimer;
      const nextCompletion = new Date(now.getTime() + timerSeconds * 1000);

      await db('player_actions').where({ id: action.id }).update({
        completes_at: nextCompletion,
        last_timer_seconds: timerSeconds,
      });

      const smithingSkill = await db('skills').where({ name: 'Smithing' }).first();
      const updatedSkill = await db('player_skills')
        .where({ player_id: action.player_id, skill_id: smithingSkill.id })
        .first();
      const currentXp = updatedSkill ? parseInt(updatedSkill.xp.toString()) : 0;
      const previousXp = currentXp - (result.xpAwarded || 0);
      const currentLevel = levelFromXp(currentXp);
      const previousLevel = levelFromXp(previousXp);
      const leveledUp = currentLevel > previousLevel;
      const xpNeeded = xpToNextLevel(currentXp);
      const xpAtLevel = xpForLevel(currentLevel)

      io.to(`player_${action.player_id}`).emit('action_complete', {
        actionType: action.action_type,
        result,
        nextCompletes: nextCompletion,
        timerSeconds,
        xpInfo: { totalXp: currentXp, level: currentLevel, xpToNext: xpNeeded, leveledUp, xpAtLevel },
      });

      // Check action limit
      if (action.action_limit && action.action_limit > 0) {
        const actionsCompleted = (action.actions_completed || 0) + 1;
        if (actionsCompleted >= action.action_limit) {
          await db('player_actions').where({ id: action.id }).delete();
          io.to(`player_${action.player_id}`).emit('action_limit_reached', {
            message: `Action limit of ${action.action_limit} reached.`,
          });
          return;
        }
        await db('player_actions').where({ id: action.id }).update({
          actions_completed: actionsCompleted,
          last_timer_seconds: timerSeconds,
        });
      }
      return;
    }

    if (action.action_type === 'sawing' || action.action_type === 'woodworking') {
      const recipe = action.action_type === 'sawing'
        ? SAW_RECIPES[action.action_data]
        : WOODWORK_RECIPES[action.action_data];

      if (recipe) {
        for (const ingredient of recipe.ingredients) {
          const item = await db('items').where({ name: ingredient.name }).first();
          const inv = item ? await db('player_inventory')
            .where({ player_id: action.player_id, item_id: item.id })
            .first() : null;
          if (!inv || inv.quantity < ingredient.quantity) {
            await db('player_actions').where({ id: action.id }).delete();
            const carpSkill = await db('skills').where({ name: 'Carpentry' }).first();
            const lastSkill = await db('player_skills')
              .where({ player_id: action.player_id, skill_id: carpSkill.id }).first();
            const lastXp = lastSkill ? parseInt(lastSkill.xp.toString()) : 0;
            const lastLevel = levelFromXp(lastXp);
            io.to(`player_${action.player_id}`).emit('action_complete', {
              actionType: action.action_type,
              result,
              nextCompletes: null,
              timerSeconds: 0,
              xpInfo: { totalXp: lastXp, level: lastLevel, xpToNext: xpToNextLevel(lastXp), xpAtLevel: xpForLevel(lastLevel), leveledUp: false },
            });
            io.to(`player_${action.player_id}`).emit('action_failed', {
              error: `Out of ${ingredient.name}. Carpentry stopped.`,
              info: true,
            });
            return;
          }
        }
      }

      const baseTimer = recipe?.timer ?? 35;
      const timerSeconds = action.using_blacksmith ? baseTimer * 2 : baseTimer;
      const nextCompletion = new Date(now.getTime() + timerSeconds * 1000);

      await db('player_actions').where({ id: action.id }).update({
        completes_at: nextCompletion,
        last_timer_seconds: timerSeconds,
      });

      const carpentrySkill = await db('skills').where({ name: 'Carpentry' }).first();
      const updatedSkill = await db('player_skills')
        .where({ player_id: action.player_id, skill_id: carpentrySkill.id }).first();
      const currentXp = updatedSkill ? parseInt(updatedSkill.xp.toString()) : 0;
      const previousXp = currentXp - (result.xpAwarded || 0);
      const currentLevel = levelFromXp(currentXp);
      const previousLevel = levelFromXp(previousXp);
      const leveledUp = currentLevel > previousLevel;

      io.to(`player_${action.player_id}`).emit('action_complete', {
        actionType: action.action_type,
        result,
        nextCompletes: nextCompletion,
        timerSeconds,
        xpInfo: { totalXp: currentXp, level: currentLevel, xpToNext: xpToNextLevel(currentXp), leveledUp, xpAtLevel: xpForLevel(currentLevel) },
      });

      if (action.action_limit && action.action_limit > 0) {
        const actionsCompleted = (action.actions_completed || 0) + 1;
        if (actionsCompleted >= action.action_limit) {
          await db('player_actions').where({ id: action.id }).delete();
          io.to(`player_${action.player_id}`).emit('action_limit_reached', {
            message: `Action limit of ${action.action_limit} reached.`,
          });
          return;
        }
        await db('player_actions').where({ id: action.id }).update({
          actions_completed: actionsCompleted,
          last_timer_seconds: timerSeconds,
        });
      }
      return;
    }

    // Handle woodcutting and mining_rock (have resource_node_id)
    if (result.success && action.auto_restart) {
      const node = await db('resource_nodes').where({ id: action.resource_node_id }).first();
      if (!node) {
        await db('player_actions').where({ id: action.id }).delete();
        return;
      }

      const skillName = action.action_type === 'mining_rock' ? 'Mining' : 'Woodcutting';
      const relevantSkill = await db('skills').where({ name: skillName }).first();
      const playerSkillRow = await db('player_skills')
        .where({ player_id: action.player_id, skill_id: relevantSkill.id })
        .first();
      const playerLevel = levelFromXp(playerSkillRow?.xp ? parseInt(playerSkillRow.xp) : 0);

      const equipment = await db('player_equipment').where({ player_id: action.player_id }).first();
      const tool = equipment?.mainhand_item_id
        ? await db('items').where({ id: equipment.mainhand_item_id }).first()
        : null;

      const nextTimer = calculateTimer(
        node.base_timer,
        node.min_timer,
        playerLevel,
        node.required_level,
        tool ? tool.tier : 1,
        node.required_tool_tier
      );

      const nextCompletion = new Date(now.getTime() + nextTimer * 1000);
      await db('player_actions').where({ id: action.id }).update({
        completes_at: nextCompletion,
        last_timer_seconds: nextTimer,
      });
      const updatedSkill = await db('player_skills')
        .where({ player_id: action.player_id, skill_id: relevantSkill.id })
        .first();
      const currentXp = updatedSkill ? parseInt(updatedSkill.xp.toString()) : 0;
      const previousXp = currentXp - (result.xpAwarded || 0);
      const currentLevel = levelFromXp(currentXp);
      const previousLevel = levelFromXp(previousXp);
      const leveledUp = currentLevel > previousLevel;
      const xpNeeded = xpToNextLevel(currentXp);
      const xpAtLevel = xpForLevel(currentLevel)

      io.to(`player_${action.player_id}`).emit('action_complete', {
        actionType: action.action_type,
        result,
        nextCompletes: nextCompletion,
        timerSeconds: nextTimer,
        xpInfo: { totalXp: currentXp, level: currentLevel, xpToNext: xpNeeded, leveledUp, xpAtLevel },
      });

    } else if (!action.auto_restart) {
      await db('player_actions').where({ id: action.id }).delete();

      if (action.action_type === 'kiln_collect' && result.success) {
        const smithingSkill = await db('skills').where({ name: 'Smithing' }).first();
        const updatedSkill = await db('player_skills')
          .where({ player_id: action.player_id, skill_id: smithingSkill.id })
          .first();
        const currentXp = updatedSkill ? parseInt(updatedSkill.xp.toString()) : 0;
        const previousXp = currentXp - (result.xpAwarded || 0);
        const currentLevel = levelFromXp(currentXp);
        const previousLevel = levelFromXp(previousXp);
        const leveledUp = currentLevel > previousLevel;
        const xpNeeded = xpToNextLevel(currentXp);
        const xpAtLevel = xpForLevel(currentLevel)

        io.to(`player_${action.player_id}`).emit('action_complete', {
          actionType: action.action_type,
          result,
          nextCompletes: null,
          timerSeconds: 0,
          xpInfo: { totalXp: currentXp, level: currentLevel, xpToNext: xpNeeded, leveledUp, xpAtLevel },
        });
      } else {
        io.to(`player_${action.player_id}`).emit('action_complete', {
          actionType: action.action_type,
          result,
          nextCompletes: null,
        });
      }
    }

  } catch (err) {
    logger.error(`Error processing action ${action.id}: ${err}`);
  }
}
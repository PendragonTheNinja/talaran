# Talaran XP Rebalance — Formula & Rate Ladder

*Spec v1 — 2026-07-13. Supersedes the two-piece curve in `services/xp.ts`.*

## 1. Goals & anchors

| Anchor | Value |
|---|---|
| Time to level 100, optimal focused play, full content ladder | **~2,920 hours** (1 yr @ 8 h/day ≡ 6 mo @ 16 h/day) |
| Level-1 optimal earn rate | **~2,000 xp/hr** (today's Lanai Tree) |
| Time per level | **Always rises within a tier; small rewarding dip (~13–18%) at each tier unlock** |
| Formula | **One expression, no branches** |

The rebalance is two artifacts: the **XP formula** (§2) and the **rate ladder** (§3). The formula sets demand; the ladder is the supply-side contract every future action is tuned against. The old curve failed because the ladder was implicit and content never delivered it.

## 2. The formula

Per-level XP demand:

```
xpPerLevel(i) = round( 0.081 × (i + 30)³ × (1.33^(1/12))^(i−1) )
```

Drop-in for `services/xp.ts`:

```ts
const XP_SCALE = 0.081;                       // calibrates the journey to ~2,920 optimal hours
const LEVEL_SHIFT = 30;                       // pacing shape: keeps early levels from being instant
const RATE_GROWTH = Math.pow(1.33, 1 / 12);   // ladder growth: content earn rate ×1.33 per 12 levels

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += Math.round(XP_SCALE * Math.pow(i + LEVEL_SHIFT, 3) * Math.pow(RATE_GROWTH, i - 1));
  }
  return total;
}
```

`levelFromXp`, `xpToNextLevel`, `xpProgressInLevel` are unchanged — they derive from `xpForLevel`.

**Why this shape.** The cube term `(i+30)³` carries the pacing (the +30 shift is what keeps levels 1–25 from flying by — a pure power or pure exponential can't do that at this total). The exponential term is *exactly* the ladder's growth rate, so time-per-level = demand ÷ supply rises smoothly by construction.

Key values: `xpForLevel(50) = 1,816,585` · `xpForLevel(100) = 35,538,537`.
Per-level samples: L1 → 2,413 · L13 → 8,565 · L25 → 23,838 · L50 → 132,887 · L75 → 544,258 · L99 → 1,785,292.

## 3. The rate ladder

**The rule:** an action unlocking at level `u` targets

```
target xp/hr = POLICY × 1.10 × R̂(u),   where R̂(u) = 2000 × (1.33^(1/12))^(u−1)
```

R̂ is the smooth reference curve; the 1.10 is the unlock dip bonus — new content lands ~10% "hot," and because rates stay ~flat within a tier while demand grows, time-per-level rises until the next unlock dips it again. That sawtooth is the intended feel.

### Policies (per-skill deviation from the ladder)

| Content class | Policy | Rationale |
|---|---|---|
| Gathering (default) | ×1.0 | The baseline. |
| Mining — rocks | ×0.5 | Deliberately slow filler; always available. |
| Mining — ores | ×1.3 | Not 100% uptime; rewards active play. Blended mining ≈ band. |
| Crafting — finished goods | ×1.8 | Materials are the other half of the journey (~1,667 hands-on hr to 100; the rest is gathering or trade). Matches current live tuning. |
| Crafting — intermediates (saw, smelt) | ×0.6 of crafting band | Bulk steps shouldn't out-earn finished goods. Matches current live tuning exactly. |
| Hunting | ×1.0 nominal | Effective rate = xp_success × catch% + xp_failure × miss%, arrow economy priced in. Tune to band at the animal's unlock level. |

### Sampled targets (xp/hr at unlock, gathering ×1.0)

| Unlock | 1 | 13 | 25 | 37 | 50 | 62 | 75 | 87 |
|---|---|---|---|---|---|---|---|---|
| Target | 2,200 | 2,926 | 3,892 | 5,176 | 7,049 | 9,376 | 12,770 | 16,983 |

Hunting cadence (1, 9, 17, 25, 33, 41, 50, 58, 66, 75, 83, 91): 2,200 · 2,661 · 3,218 · 3,892 · 4,706 · 5,692 · 7,049 · 8,525 · 10,311 · 12,770 · 15,443 · 18,677.

Crafting (×1.8): 3,960 · 5,267 · 7,005 · 9,316 · 12,689 · 16,876 · 22,985 · 30,570.

Any cadence works — dense skills (smithing per-level items, fishing) just sample R̂ at each unlock's level. **Woodcutting forest pairs:** two forest rungs per wood type — (1, 13) Lanai · (25, 37) Hatch · (50, 62) Bearn · (75, 87) Mirrith · (100) Craxial. The second forest of a pair is the "old growth" variant: same wood, higher rung rate.

## 4. Validation (stepwise simulation, real tier jumps)

Full ladder, gathering pattern (rungs every 12, +0.5%/lvl timer reduction within tier):

| L1→2 | 1→12 | 1→25 | 1→50 | 1→75 | 99→100 | 1→100 |
|---|---|---|---|---|---|---|
| 1.1 hr | 22 hr | 83 hr | 407 hr | 1,230 hr | 99 hr | **2,907 hr** |

Time-per-level monotone within every tier: ✓. Dips at unlocks: 13% (L13) → 18% (L87), growing with tier — later unlocks feel bigger, as they should.

**Alpha projection** (only rungs 1 + 13 exist today): 1→25 = 83 hr (identical — early content already covers it), 1→50 = 560 hr, 1→100 = 9,077 hr. Long-tail grind until higher tiers ship, exactly as intended.

## 5. Alpha player re-mapping

Raw XP is preserved; displayed levels re-map the moment the formula lands:

| Old level | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 50 |
|---|---|---|---|---|---|---|---|---|---|
| New level | 3 | 7 | 10 | 14 | 17 | 21 | 25 | 28 | 37 |

Patch-note draft: *"Alpha XP rebalance — the leveling curve has been rebuilt from the ground up so every future content tier slots into a single long-term progression. Your XP is untouched, but displayed levels have shifted (most drop a few levels). Earn rates on some actions changed to match the new curve. One curve, no more mid-game kinks — this is the formula the full game ships with."*

## 6. Existing content retune

Checked every live action against the ladder. **Current tuning already conforms almost everywhere** — the policies above are formalizations of what the game already does:

| Action | Current | Target | Verdict |
|---|---|---|---|
| Lanai Tree (45s, L1) | 25 | 28 | **change** |
| Old Growth Lanai (60s, L13) | 65 | 49 | **change** |
| Granite Rock (20s) | 6 | 6 | keep |
| Burgh / Ambren Ore (28s) | 20 | 20 | keep |
| Lanai Tool Rod (35s) | 39 | 39 | keep |
| Lanai Staff (140s, L5) | 156 | 169 | **change** |
| Lanai Sawhorse (350s) | 390 | 385 | keep (within 2%) |
| Smith part (90s) | 100 | 99 | keep |
| Smelt Ambren (45s) | 30 | 30 | keep (0.6× intermediate) |
| Saw planks (35s) | 23 | 23 | keep (0.6× intermediate) |

Three numbers change. Two live in the `resource_nodes` table (SQL update + seed sync), one is a code constant in `carpentry.ts`.

## 7. Rollout

1. Replace `xpForLevel` in `services/xp.ts` (one REPLACE block; rewrite the stale calibration comment — the old one claims 1,200 xp/hr Lanai; reality is 2,000).
2. Retune: `UPDATE resource_nodes SET xp_reward = 28 WHERE name = 'Lanai Tree'; UPDATE resource_nodes SET xp_reward = 49 WHERE name = 'Old Growth Lanai Tree';` + mirror in `seeds/03_locations.ts` + staff `xp: 156 → 169` in `carpentry.ts`.
3. Deploy + announce (§5 draft). No migration needed; levels recompute from raw XP.

## 8. Placing future content (the recipe)

1. Pick the unlock level `u`. 2. Read target = policy × 1.10 × R̂(u) (§3 tables). 3. Choose a base timer that feels right for the action (higher tiers: longer base *and* higher absolute min_timer; existing ratio min ≈ 0.53–0.56 × base is a good default). 4. Set `xp = round(target × timer / 3600)`. Done.

Worked example — Hatch Forest at 25: target 3,892 xp/hr, pick 50s timer → `xp_reward = 54`, `min_timer ≈ 27`.

## 9. Tunable knobs (change deliberately, then recalibrate)

| Knob | Value | Effect if raised |
|---|---|---|
| `TIER_MULT` (ladder growth) | 1.33 / 12 lvls | Bigger unlock highs, faster power creep; top rung 16,983 → ~21k at 1.4 |
| Crafting policy | 1.8 | More hands-on crafting speed, cheaper mats-share of journey |
| Rocks / ores policy | 0.5 / 1.3 | Mining passivity vs. activity balance |
| Unlock dip | 1.10 | Deeper dips, hotter unlocks |
| `XP_SCALE`, `LEVEL_SHIFT` | 0.081, 30 | Total journey length / early-game pace |

Changing any of these requires re-deriving `XP_SCALE` (and re-checking §6 targets) — the calibration sim reproduces this whole doc in one run; ask Claude to regenerate.

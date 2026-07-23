# Farming M1 — Build Summary

The full M1 vertical slice is built and compiling (server `tsc` 0, client `tsc` 30 baseline). You can raise a farmstead at Novita and grow crops end to end. **Hold off applying until you've eyeballed the flagged numbers below** — especially the XP, which still wants a sim.

## What's in the box

**`migrations/`** (apply in order, after the foraging ones)
- `20260722010000_create_homestead_tables.ts` — `player_properties` (the homestead container, thin/extensible), `crops` (definitions), `farm_plots`.
- `20260722010100_seed_farming_content.ts` — 8 crops, produce items, **Ambren Hoe** (Smithing) + **Ambren Nails** (Smithing, 1 ingot → 30) + **Granite Block** (Crafting, 3 Granite → 1), lights up Farming.

**`server/`**
- `farming.ts` → `apps/server/src/services/farming.ts` (new)
- `routes_farming.ts` → `apps/server/src/routes/farming.ts` (new; rename on drop)
- `index.ts` → modified (mounts `/api/farming`)

**`client/`**
- `FarmPanel.tsx` + `FarmPanel.css` → `apps/client/src/components/` (new)
- `LocationPanel.tsx` → modified (a "Your Homestead →" button at Novita)
- `GameLayout.tsx` → modified (opens the panel)

**`docs/IDEAS.md`** — the event-chat "firsts" feed idea, for the repo.

## How it plays

At **Novita**, the location panel shows **Your Homestead →**. With no farmstead, the panel offers to raise one for **500 Lanai Planks + 500 Granite Blocks + 1,000 Ambren Nails** (Carpentry ≥ 1 for tier 1) — it shows have/need per material and only enables the button when you're standing in Novita with the goods. Building grants **4 plots × 10 seeds**.

**Plots are built individually, not granted by house tier.** The farmstead comes with its first field enclosed; each additional field costs **Fence Panels + Granite Blocks** (escalating: field 2 = 15 panels/25 blocks, field 20 = 105 panels/205 blocks) and your **Farming level caps how many you may own** — 1 at level 1, +1 every 3 levels, hitting the 20 ceiling around level 57. A **Fence Panel** is a new Carpentry item (4 planks + 8 nails), so a farmer can buy fencing from a carpenter rather than grinding Carpentry themselves.

**Crops are island-locked.** Each crop carries a `region` (all eight are `Taiar Island`); sowing validates it against the farmstead's location region, so next island's farms will need that island's forageables. A nullable `grows_anywhere` flag exists for hardy crops that should ignore the lock — unset for now.

Then per plot: **Till** (needs the Hoe) → **Sow** (pick an unlocked crop + seed count, consumes seeds, sets a real-time grow timer) → the plot counts down → **Harvest** yields `seeds × yield_per_seed` produce + XP. Annual plots return to *tilled* (stay worked — no re-tilling); the two berries are **perennial** and re-grow in place. No tick involved — growth is computed from `ready_at` on read, like your tanning jobs.

## Deploy

Standard: drop files in, `cd apps/server && npm run migrate && npm run build`, build client, `pm2 restart`. Server `tsc` should be 0, client 30. Crops are inert produce for now (Cooking/processing are later milestones), same build-ahead-of-sink pattern foraging used.

## ⚑ Flagged before you commit

1. ~~**Farming XP is placeholder and unsimmed.**~~ **DONE — tuned and verified.** Per-plot rate is set to **0.12 × the active gathering reference** for each crop's level, so per-plot output rises with crop tier. Verified by parsing the migration back out: all eight crops land within 0.2% of target. Resulting curve — 1-plot starter farm **12%** of an active skill, 5 plots at L12 **60%**, maxed 20-field farm **~86%** (≈60% at realistic harvest uptime). Passive never beats active, and there's headroom for tending (M3) and processing (M4) to stack on top. *(Note: farming is deterministic — fixed yields and XP — so there's nothing to Monte-Carlo; the verification is exact arithmetic against the shipped values.)* Old text: `xp_per_seed` (30–90) + flat till/sow XP (8/10) are guesses. Model agreed: **passive core ~0.35× active, stacking on top of active play; tending/processing lift engaged players toward ~0.5×+**. The level-capped plot model solves the old balance problem elegantly — since plot count rises with Farming level and per-plot XP is fixed, total farm output naturally scales with level, which is what the band curve already does. So I can tune per-plot XP so a *level-appropriate* farm sits on band at **every** stage, instead of balancing one arbitrary farm size. Still to do: set the numbers and Monte-Carlo them like foraging.
2. **Establish cost** (500/500/1,000), **plot cost curve** (`plotCost()`), **plot cap curve** (`plotCapForLevel()`), and **seeds per plot** (10) — all at the top of `farming.ts`, trivially tuned.
3. **Grow times** (12h–28h) and **yields** (3–5/seed) live in the content migration.

## What's next (later milestones)

- **XP sim + tuning** (do before ship).
- **M2 — soil:** the 3-state Rich/Normal/Depleted system, harvest depletes, legumes/fallow restore, manure once Husbandry lands. (`soil_state` column already there.)
- **M3 — tending:** optional water/weed for a yield/speed bonus. (`tended` column already there.)
- **M4 — processing:** grain (thresh/mill → flour → bread) and flax (ret → scutch → fibres → cloth); reuses the recipe system + tanning's passive soak.
- **M5 — tiered construction:** bigger farmsteads (more plots) via higher Carpentry + higher-tier planks; the house at Talador; item/currency storage.

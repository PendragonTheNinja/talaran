# Talaran Economy — Spec v1 (handoff)

*2026-08-08. Designed with Nathan in the Fishing chat; written for Opus to
continue. Everything in §1 is LOCKED with Nathan; do not re-litigate it.*

## 1. Locked decisions

- **Currency:** gold ("gold"/"g"). Talers stay the separate premium currency;
  the earned/premium line is never crossed.
- **THE PEG — value is derived, never chosen** (same doctrine as item tier):
  `value = xp of the yielding action ÷ 5`, minimum 1, whole gold. The
  xp-rebalance band therefore prices everything: ~440g of value created per
  on-band hour at level 1, growing with the same 1.33^(1/12) curve.
- **NPC walls:** an NPC buyer takes anything at **45%** of value (the floor); a
  general store sells a SMALL list of basics at **175%** (the ceiling). The
  130-point spread is where player trading lives. Both in Talador, the trade
  hub, alongside future player stalls (stall rent = recurring gold sink).
- **Faucet bound:** NPC buyback soft-caps **per player, per item, per day** —
  full price for roughly one hour's worth of a single item, then steps down
  (75% → 50% → 25% of the floor). Constants, tunable.
- **No tool repair, ever.** Tools break outright and are replaced; that is the
  smith/carpenter employment engine and an ITEM sink. Gold's sinks are NPC
  store purchases, later stall rent and building costs.
- **Starting gold:** none at signup. A blindingly obvious tutorial quest
  (~25g reward) teaches the system; "money comes from doing" is the first
  lesson. (Nathan also wants a broader new-player tutorial quest soon after —
  players have joined not knowing to click the map to move.)
- **Uneven gold/hr across skills is fine and intended.** Derived value is the
  anchor and the NPC floor; player demand does the rest.
- **`items.value` is nullable; null = "no price, do not show".** Loot log and
  admin already treat it that way.

## 2. Derivation rules (implemented in `src/scripts/deriveValues.ts`)

1. Gathered: `xp ÷ 5`.
2. Weighted tables price rarity by conservation: `v_i = actionValue / (N·p_i)`
   so `Σ p_i·v_i = actionValue` (Frogspawn ~115g falls out of its 1-in-119
   drop; nothing is hand-set).
3. Crafted: `inputs + labour`, labour at the BASE band (never the crafting
   ×1.8 XP multiplier — that is an incentive, not value). Cheapest acquisition
   wins.
4. Husbandry products: `feed + 60s tending`. **NOT elapsed passive time** —
   animals run in parallel; the first draft priced Milk at 481g that way.
   Correct: Milk 11g, Cheese 74g.
5. Tier estimate for anything unsourced: unlock=(tier−1)×12+1, nominal 60s
   action, flagged HAND-TUNE in the report.

## 3. Status

**DONE, in this handoff:**
- `20260808153000_add_item_value.ts` — items.value column.
- `src/scripts/deriveValues.ts` — the engine, `npm run values:derive`
  (`-- --write` fills the column). package.json script added.
- `docs/derived-values.md` + `.csv` — a real run against a full DB (v1 rules +
  the husbandry fix). 220/221 priced, 0 orphan refs. Sanity anchors: Tiddle 9g,
  Conger 10g, Frogspawn 115g, Wisp Cap 231g, Excellent Lanai Log 37g,
  Milk 11g, Cheese 74g, Squonk Tears 600g.
- `20260725030000_travel_time_override.ts` — patched with a fresh-install
  guard (see §5 finding 1). Hand this replacement to Nathan.

**RESOLVED 2026-08-08 (second session).** The v2 run now completes. Fixes made:
- Module stub extended to intercept `../index` (services/drops reaches the
  Express bootstrap). `JWT_SECRET` must be set to any value for the run.
- **Ordering bug:** tier-estimate ran AFTER the recipe fixpoint, so a recipe
  whose input was only tier-estimated never fired. Leaves (items no recipe
  produces) are now estimated first; the fixpoint runs; the rest are estimated
  last. This alone unlocked the whole metal chain.
- A real recipe cost now beats a tier ESTIMATE even when dearer (an estimate is
  a placeholder, not a competing acquisition path).
- **Crops repriced by attention, not growth XP** — the same trap as husbandry,
  and it bit twice. `xp_per_seed` is large (Flax 497) because farming pays for
  an 18-hour GROW, and elapsed growth is not player time. Pricing off it put
  Flax at 35g, Linen Thread at 138g and the Fishing Net at 849g. Now seed +
  120s handling: Flax 8g.

Result: 220/221 priced, HAND-TUNE down from 135 to **90**, and every section
populates (saw/smelt/smith/woodwork all live).

**OPEN — for Nathan, not bugs in the engine:**
1. **`Deerhide`, `Boarhide`, `Slothhide` are referenced but DO NOT EXIST as
   items.** They appear in `huntable_animals.drop_table` AND in the tanning
   recipes (`Tan Deerhide`), but no migration or seed ever creates them; the
   items table has `Deer Hide`, `Boar Hide`, `Cowhide`, `Thick Hide`. Verify on
   LIVE before acting — if live matches, hunting drops and the whole tanning →
   Buckskin → Leather Strips chain are silently broken, which is also why every
   smith tool needing Leather Strips still falls to a tier estimate.
2. **The linen chain is expensive:** Flax 8g → Linen Thread 66g → Fishing Net
   417g, because each step consumes several of the previous. May be correct
   (linen IS labour-intensive) or may be a quantity that wants tuning. Nathan's
   call; the numbers are honest to the recipe data.
3. `drop_table_entries` is EMPTY on a fresh database, so the `byproduct` method
   produced nothing here. Live may have rows (Bird's Nest); re-run there.

**Superseded issue list (kept for context):** the v2 additions (sections
below) are written in the script but the run died on import side-effects
before completing, so the shipped report still shows **135 tier-estimates**
that v2 should collapse:
- Hunting reads `xp_success` (NOT `xp_reward` — column doesn't exist) and the
  jsonb `drop_table`; ores are `X Ore` / `Dense X Ore` (no poor/fine/exc);
  byproducts come from `drop_table_entries.source_key`. All coded.
- Sawing/woodworking/smelting/smithing live as exported constants in
  `services/carpentry.ts` / `services/smithing.ts` (they predate the recipes
  table). The script imports them with a `Module._load` stub for
  `routes/quests`. **Two boot traps found so far:** `JWT_SECRET` must be set
  (any value) for the run, and something in the import chain still throws
  after that — extend the stub to also intercept requests resolving to
  `../index` (return `{ logger: console, io: {} }`) or lazy-require the
  services inside `main()`. Fix, run `npm run values:derive`, and the
  HAND-TUNE count should drop from 135 to roughly 30 (mostly legacy trimmed
  foraging items and far-future tools, which is correct).

## 4. Build order after that (M1 currency)

1. `gold` on players + `gold_ledger` (taler_ledger's shape: every grant/drain
   with a source string — at 30 players the whole economy is readable).
2. Fix the **non-functional trade gold field** (audit finding, still open) so
   player↔player gold actually moves.
3. NPC buyer + general store in Talador, walls at 45/175, per-player daily
   soft caps. Store stock: a handful of basics (bait staples, torches-tier
   convenience), never gear that competes with crafters.
4. Tutorial quest granting ~25g.
5. **Arbitrage validate check:** walk every recipe; if NPC-sell(inputs) <
   NPC-buy(output) anywhere, flag it. Structurally impossible while
   buy% < sell% and outputs ≥ inputs+labour, but content rows change — make
   the report prove it forever.
6. M2: player stalls in Talador with rent (sink), suspicious-trades tool after
   values exist (docs/IDEAS.md).

## 5. Findings for Nathan (real bugs, found doing this)

1. **Fresh installs are broken** (CLAUDE.md §6 landmine, live instance):
   `20260725030000` uses `travel_speed_modifier` before `20260731120000`
   creates it — works on live only because live ran piecemeal in authoring
   order. Patched copy in this handoff. A second order dependency:
   `20260731120000` throws if Novice's Pony isn't seeded, but base seeds can't
   run until late-migration columns exist, and `02_items.ts` seed **deletes
   all items** (it would wipe migration-added content if run late). The whole
   seed/migration bootstrap deserves its own small fix pass; the sandbox
   workaround was migrate→seed-at-stall→continue with per-migration commits.
2. `huntable_animals` babies (Calf/Foal at ~1%) price very high via the hunt
   path (~100g+); breeding will be the cheaper real source once modelled.
   Acceptable for now, worth knowing.


---

## Session 3 (2026-08-08, against LIVE content snapshot)

Ran against live's `content-snapshots/` export (commit cee9b6c), not seed data.
**206/208 items priced, 0 orphan references.**

### THE recurring bug, found three times
**Elapsed passive time is not player time.** Every system where work happens
while the player does something else was initially priced off its clock, and
every time the result was absurd:

| System | Wrong basis | Wrong price | Fix | Now |
|---|---|---|---|---|
| Husbandry products | full `product_seconds` | Milk 481g | feed + 60s tending | Milk ~11g |
| Crops | `xp_per_seed` (18h grow) | Flax 35g, Net 849g | seed + 120s handling | Flax 8g |
| Passive recipes (`mode='passive'`) | `timer_seconds` (6h soak) | Leather 1081g, Boots 6228g | inputs + 60s handling | Leather 19g, Boots 120g |

Rule for anything added later: **price the attention an action costs, never the
clock it runs on.** Active timers are player time and price normally.

### Live content confirmed the seed drift
`Lanai Bark`, `Deerhide`, `Boarhide`, `Slothhide` exist on LIVE but are created
**nowhere in the repo** (not in `02_items.ts`, not in any migration) — they were
authored through the admin panel under the DB-first model. `02_items.ts` still
has the stale `Deer Hide`/`Boar Hide`. Consequences:
1. A fresh install produces a broken game (no Lanai Bark → tanning dead → no
   leather → no smith tools). Sits alongside the other fresh-install faults.
2. **Recommended: a validate-report check** cross-referencing every recipe
   input, drop-table `itemName`, crop and animal item reference against
   `items`. It would have caught all four instantly.
3. Either refresh `02_items.ts` from a live export or declare snapshots the
   install path and note it in CLAUDE.md.

### Sanity anchors (live data)
Ambren Ore 4g → Ingot 11g → Hatchet/Pickaxe 47g. Cowhide → Leather 19g →
Leather Strips 5g → Boots 120g. Deerhide 4g. Snare 27g.

### Still open
- **107 HAND-TUNE placeholders**, but most are NOT genuinely unsourced: live's
  snapshot predates the fishing migrations, so `fish_species`, `bait_values`,
  `foraging_habitats`, `crops` and `animal_species` were absent from the export
  (the registry additions are also undeployed). **Deploy the fishing + registry
  work to live, re-export, re-run** and this number should fall a long way.
- `deriveValues.ts` now skips absent tables with a warning rather than dying, so
  the same script works before and after that deploy.
- The linen chain is still dear (Flax 8g → Linen Thread ~66g → Fishing Net
  ~417g) because each step consumes several of the previous. Honest to the
  recipe data; Nathan's call whether the quantities want tuning.

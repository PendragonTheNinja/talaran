# CLAUDE.md — Talaran Project Constitution

*The first thing a new session reads. Last updated 2026-07-26.*

Talaran is a live browser-based medieval skilling MMORPG in alpha (~30+ players) by Nathan (`PendragonTheNinja`). Live at talaran.net · repo `PendragonTheNinja/talaran`, branch `main` · React/TS/Vite client + Node/Express/TS server + PostgreSQL/Knex + Socket.io · PM2 on Hetzner behind Cloudflare · monorepo: `apps/client`, `apps/server`. **Production lives at `/var/www/talaran`** (`ssh talaran` from Nathan's WSL; his working repo is `~/talaran`).

## 0. Before you build anything

**Read this whole file, then read the nearest existing implementation in full** — not the slice that looks relevant, the whole file. Before a new skill: a finished skill's service, route, tick block, *and* client panel. Before new UI: the component that already does the closest thing. Before writing any new file, name the existing feature it mirrors; if that can't be answered with a filename, the codebase hasn't been read yet.

**§2b-2 is a table of exactly which file to open for what you are building. Use it. It is faster than searching and it is the accumulated answer to "why didn't you copy the thing that already worked?"**

Every repeat failure this past patch was a convention that already existed here and went unread, not a hard call gotten wrong: a two-column storage list built without opening the inventory grid; thirteen recipes shipped with no `flavor_text` (a column that exists for exactly that); an action with no cancel button (checklist item 7); hard-coded client scene text (§2 forbids it by name); a migration edited after it had run (§3 freezes it); pen-building paying the wrong skill when the farmstead beside it had paid Carpentry for months; a slaughter reporting one item when `drops` existed and was already animated. Reading first is the single highest-leverage habit.

**When you catch yourself pattern-matching from memory instead of from a file open in front of you, stop and open the file.** Nearly every entry above was written by an assistant who "knew" how the codebase worked.

## 1. Working rules (non-negotiable)

1. **One step at a time.** One change → Nathan tests → next. Sizable work: plan → thumbs-up → increments.
2. **Read before write, same turn.** The actual file plus a sibling for patterns. Never guess imports, names, CSS classes, or signatures. Every landmine in §5 was found this way; every bug shipped was a place this got skipped.
3. **Verify in the sandbox before delivering.** Write into the clone, type-check, deliver only on a clean result. Sim-validate balance numbers before they ship (§4).
4. **Prefer rebuilt files over REPLACE blocks for anything non-trivial.** Edit Nathan's real bytes programmatically, then hand over the whole file. Report the diffstat (`git diff --stat HEAD`) — pure additions should show 0 deletions, and every deletion should be accounted for. **Three overlapping splices in one function is how `RACK_ITEM` survived a deletion and crashed the dev server.** Blocks are for small, isolated, unambiguous edits only.
5. **Say so when a file is genuinely regenerated** rather than surgically edited, so it gets extra scrutiny.
6. **Sync discipline.** Nathan applies locally and pushes rarely; the clone diverges. On "pushed": `git fetch && git reset --hard origin/main && git clean -fd`. Not pushed? Ask for a push or a paste — never edit against a reconstruction. **Diffing is only possible when he's pushed; that's what makes full-file replacements safe.**
7. **Evidence, not theory.** Read the code, instrument it, prove the cause. Never diagnose from a polluted working tree — read from the commit object (`git show HEAD:path`) when it matters.
8. **Migrations: create command first, always.** See §3.
9. **Deploys:** infrequent, batched; fresh commit message + markdown patch notes every time, never reused.
10. Dense and direct. Engage with pushback — **Nathan's instincts are usually pointing at something real.** The feather bottleneck, the sinew circularity, the "crafting" name collision, the duplicate carpentry link, and the ingots-in-a-barrel absurdity were all his catches.

## 2. Architecture principles

- **Nouns are rows, verbs are code.** Things-with-stats (nodes, animals, recipes, items, trap types, quests, flavor text) live in the DB. Math (XP curve, timers, catch chance, policies) lives in code.
- **Balance changes ship as migrations** — upsert-by-name, idempotent, loud `throw` on missing references, never silent no-ops.
- **New systems get transactions.** `db.transaction` + `forUpdate()` row locks. `services/trapping.ts` and `services/tanning.ts` are the reference implementations. Legacy systems (trades, the kiln's collect) get retrofitted as touched.
- **`recipes` is the single home for bench crafts.** 15+ recipes across Carpentry/Smithing/Crafting run through one executor and render through one component (`RecipeList`). Sawing and smelting stay bespoke — they consume *by quality across material types* and pay out through the drop system, which the simple inputs/outputs table can't express.
- **`action_type: 'recipe'` is the skill-agnostic executor.** It reads `recipe.skill` and pays XP accordingly. **This is NOT the Crafting skill.** The word has three meanings — keep them straight:
  - `recipe` / `services/recipes.ts` / `/api/recipes` = the executor
  - **Crafting** = a skill (leather now, gems later)
  - `type: 'crafting'` in `seeds/01_skills.ts` = a skill *category* (processing skills: Carpentry, Smithing, Cooking, Farming, Husbandry)
- **`recipes.for_skill` drives UI grouping** — tabs are *who the output serves*, not who makes it. Verdale's woodworking serves four skills (Sawhorse→Carpentry, Tool Rod→Smithing, Staff→Agility, Tanning Rack→Crafting). Nathan's idea; it was already Smithing's hidden pattern.
- **`recipes.station` names a `workstations.type`** ('carpentry', 'smithing', 'tanning'). Active workstation at your location = full speed; otherwise **timer ×2** ("making do at the public bench"), matching the legacy `usingBench ? timer*2 : timer` exactly. `null` station = camp craft, no penalty.
- **Client must never infer from action type.** The server sends `skillName`, `flavorText`, `recipeName`. A hard-coded `currentAction === 'x' ? 'Skill' : ...` chain silently mislabeled recipe crafts as Woodcutting — and would have mislabeled any future action type the same way.

### New player_actions type checklist (every item is a shipped bug we fixed)
1. `last_timer_seconds` set on the **initial insert**, not just restarts.
2. Client restore-switch case in `GameView.tsx` — *or the action vanishes on refresh while the server loops it forever.* This produced the phantom-hunt 409 bug.
3. Route start: existing-action check → 409, **and** catch pg `23505` → 409 (the unique constraint on `player_actions.player_id` is the real guard).
4. `last_bot_check` + `bot_check_pending: false` on insert.
5. Resolve path must delete-or-restart on **every** exit branch, and re-validate preconditions each cycle (equipped items, `is_active` flags).
6. Socket listeners registered **and** added to the `socket.off` cleanup.
7. Scene text + cancel button driven by server data, not a hard-coded action-type chain. **Until that refactor exists, both ARE hard-coded chains of `currentAction === '...'` with no default, so a new type renders no flavour text and no cancel button and fails silently.** Fishing shipped this bug. Add a `*_SCENE_TEXT` map beside `FARM_SCENE_TEXT`/`HUSBANDRY_SCENE_TEXT`, and a cancel entry in the block near the bottom of `GameView.tsx`.
8. **Clear `lastResult` on start.** Every `startX` in `GameView.tsx` does `setLastResult(null)` + timer/travel cleanup, or the previous result card hangs under the new timer. Mirror `startForage`, not the shortest nearby branch (`kiln_collecting` is three lines and misses this).
9. **The result card has THREE render branches** (hunting / message-carrying / generic) and a change to one reaches none of the others. Anything XP-only (till, build, tend) also falls through the generic branch's `itemName` gate and renders nothing — send a `message` and give it a branch. Check all three every time.
10. **New recipes set `flavor_text`.** The per-skill fallback in `RECIPE_FLAVOR_BY_SKILL` is a net, not the plan, and needs an entry for any new recipe-owning skill.
11. **The action limiter is applied per repeating block, not once centrally.** A resolve branch that returns early skips all three copies, and the new skill silently ignores limits every other skill honours. Copy the `action.action_limit` block into any new looping branch. Fishing shipped this bug too.
12. **`GameLayout.handleLocationAction` needs a branch if a PANEL starts the action.** It ends in a `setGameViewAction({ type, id })` fallback that only works for action types the scene already understands. A panel-started build (`shop_build`) fell through it and the player saw nothing happen, then was told they were already busy. Panels must also call `onActionStarted(seconds, kind)` — `FarmPanel.tsx:116` is the reference.
13. **Verify by grepping the FILE's vocabulary, not your own.** Grepping for the skill name only confirms what you added. Grep `currentAction ===` and `case '` and diff that list against your action types; that is what surfaces the render sites nobody thinks to search for.

## 2a-1. Verifying the client actually compiles

**`npx tsc --noEmit` in `apps/client` checks NOTHING.** The root `tsconfig.json` is `"files": []` with project references, so it exits 0 on any codebase, however broken. Use:

```
npx tsc --noEmit -p tsconfig.app.json
```

The client currently has ~21 pre-existing type errors, so a clean run is not the bar. The bar is **no NEW errors**, measured against the untouched tree:

```
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\)//' | sort > /tmp/now.txt
git stash -q && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\)//' | sort > /tmp/base.txt && git stash pop -q
comm -13 /tmp/base.txt /tmp/now.txt      # anything here is yours
```

Strip line/column before comparing, or every shifted line reads as a new error. `npx vite build` succeeds regardless of type errors, so a green build proves nothing about types.

### Migrations are not type-checked either

`apps/server/tsconfig.json` **excludes** `src/db/seeds` and `src/db/migrations`, so `npx tsc --noEmit` in `apps/server` reports 0 while a migration is broken. `npm run migrate` compiles them through ts-node and fails at the terminal, which is the worst place to find out.

Before handing over any migration, check it:

```
cd apps/server
cat > /tmp/tsc-mig.json <<'EOF'
{ "compilerOptions": { "target":"ES2020","module":"commonjs","lib":["ES2020"],
    "strict":true,"esModuleInterop":true,"skipLibCheck":true,"noEmit":true,"types":["node"] },
  "include": ["src/db/migrations/**/*.ts"] }
EOF
cp /tmp/tsc-mig.json tsconfig.migrations.json && npx tsc -p tsconfig.migrations.json; rm tsconfig.migrations.json
```

Known trap: adding `.count()` to a `.select()` makes knex infer the row as the aggregate shape alone, so `row.some_column` stops existing. Type the call — `.select<{ player_id: number }[]>('player_id')` — rather than reaching for `any`.

## 2b. Client patterns (match these, don't invent)

- **Items are always an icon grid**, never a text list: `getItemIcon(name)` from `lib/items`, rendered as `inventory-slot` tiles, name fallback on image error, quantity badge. Inventory, ground items, and property storage all do this.
- **Persistent modes follow drop mode** (`dropMode`/`tradeMode` in `LeftPanel.tsx`): a toggle that changes what tapping an inventory item does. Full-screen panels cover the inventory, so any "tap your items to do X" feature must be a mode that outlives the panel, and the panel overlay must pass clicks through (`pointer-events`) while it's active. Give the grid a visible active state; `drop-mode-active` is referenced but never styled, so don't copy that gap.
- **Feature panels are one modal with tabs**, not several location buttons. The farm panel carries Storage / Fields / Processing; new sub-systems become tabs.
- **Admin main-column cards are `admin-action-card`** with an emoji-led `admin-section-title`. `admin-section` is the plain sidebar style and renders an unboxed control that looks broken. Gate admin-only tools on `isAdmin` in the UI too, not just the route.
- **`recipes.station` is a `workstations.type`, never a display name.** Valid values: `'tanning'`, `'smithing'`, `'carpentry'`, or null for benchless work. Services query it directly (`services/tanning.ts` filters `station: 'tanning'`), so a recipe with `'Tanning Rack'` is not broken — it is *invisible*, which is worse, because it saves and reads back fine. This has now happened twice: 20260716025233 fixed the original three, and Tan Cowhide repeated it by copying the pre-fix seed.
- **A result card reports EVERY item, not the first.** Services return `drops: [{name, quantity}]` alongside `itemName`; `gameTick` passes it through; `GameView` animates each into the pack. Anything with more than one yield (slaughter, hunting kills, sawing secondaries) must populate `drops` or the extra items land silently in the inventory with nothing on screen. Canonical: `rollSecondaryDrops` in `services/carpentry.ts` and the hunting block in `gameTick.ts`.
- **Building a structure pays CARPENTRY**, never the skill the structure serves. Farmsteads, fields, coops and paddocks all award Carpentry at the Carpentry rate and report `skillName: 'Carpentry'`. The skill a building belongs to is earned by *using* it.
- **Reuse `RecipeList`** for any skill's recipes; never write a second one. Its category tabs wrap (crossover `for_skill` means a bench advertises every skill it serves, so the list grows).

## 2b-2. Where to look before writing a feature

Every new skill is a re-implementation of an existing one. Read the closest sibling **in full** before writing, and copy its shape; the checklist in §0 catches the plumbing, this catches the behaviour.

| Building… | Read first | Because |
|---|---|---|
| a timed action of any kind | `services/farming.ts` + §0 checklist | start/resolve split, `player_actions`, tool checks |
| anything with multiple yields | `services/carpentry.ts` (`resolveSaw`) | the `drops` array and its animation |
| a homestead sub-system | `services/farming.ts`, `services/husbandry.ts` | plot/pen capacity, property rows, build XP |
| a structure the player builds | `resolveEstablish` / `resolveBuildPlot` | mallet+saw gate, **Carpentry XP** |
| a quest with world-state steps | `backfillQuestObjectives` in `routes/quests.ts` | steps already satisfied must auto-complete |
| an NPC | `routes/npcs.ts` `getDialogueStage` | stages are derived, and scoped by `npc_name` |
| a passive/persistent entity | `services/husbandry.ts` (`accrue`) | pause-aware clocks, lazy evaluation, no cron |
| a new panel | `FarmPanel.tsx` | tabs not buttons, help button per tab |
| anything reading `recipe.inputs` | `services/liquids.ts` + §2c-4 | liquids are volume, not inventory rows |

## 2c. Property & homestead model

- A **property** (`player_properties`) is a container a player owns at a location — farmstead at Novita, house at Talador later. It holds sub-systems (plots, storage, later pens/stables). **Not a workstation** (those are single-purpose benches keyed by `type`).
- **Storage is per-property**, keyed by the location the player stands in, so a new property type gets storage with no new code. One slot = one unique item stack of any size; topping up an existing stack never needs a free slot.
- **Sub-system capacity lives on the property row** (`plot_slots`, `storage_slots`) so a tier upgrade is a number change, not a schema change.
- **Skill gates belong to the skill that owns the sub-system.** Farming level caps plot count; Carpentry level caps house tier. Never gate one skill's capacity behind another skill's level — materials trade between players, levels don't.

## 2c-1. Shops & the marketplace (shipped 2026-08-11)

- **A shop IS a property.** `player_properties` with `type='shop'`, so `property_storage` works unchanged and a shop and farmstead coexist at one location via the existing `(player_id, location_id, type)` unique. `player_shops` adds only the commerce layer on top.
- **`propertyForPlayerHere()` excludes shops unless asked by name.** It used to match on player+location alone, which was fine while a farmstead was the only ownable thing; now a bare `.first()` at a town holding both returns whichever Postgres feels like. Pass a type.
- **Two gold stores per shop, and they never mix**: `till_gold` (takings, withdraw only) and `buy_fund_gold` (backs standing buy orders). Part of the fund is reserved against outstanding orders; only `buyFundAvailable()` may be withdrawn.
- **Escrow both sides.** Listing MOVES goods out of storage onto the shelf, so a shop can never advertise more than it holds. Cancelling with full storage **refuses** rather than destroying anything.
- **Presence is enforced in the service layer, not the routes**, so the rule holds however a call arrives.
- **Merchants and their stock are seed data** (`08_merchants.ts`), not code — idempotent, upsert-only, declarative (a line removed from the file deactivates the row). Run it ALONE: `npm run seed` executes every seed, and `02_items.ts` opens by deleting `player_inventory` and `player_equipment`.
- **There is deliberately no cross-shop item index.** Finding a good price is a player activity. Don't build a search box.

## 2c-3. Husbandry

- **Animal clocks are PAUSE-AWARE, and this is the whole skill.** An animal accrues growth and product only while its pen is both fed and mucked. We store accrued fed-seconds + `accrued_at` and fold forward on read — no tick sweep, unlike `farm_plots.ready_at` which is a wall-clock stamp. Copying the farming pattern here is wrong.
- **Nothing can die.** There is no death path, no health column, no starvation. An unfed animal *stops*. Neglect costs the time away and nothing else. Do not add mortality; it punishes exactly the player who took a week off.
- **Juvenile → Adult → Elder.** Elders are slower at everything they *produce* (yield and interval both), and never die. But an elder **butchers out at full value** — age never reduces meat or hide. Only XP is weighted, by life lived.
- **`xp_slaughter` is a full-life maximum**, paid at `life_accrued / full_lifespan` (capped at 1.0 from elderhood). Without this, butchering the instant an animal matured paid up to **6.4× the intended rate**, since every milestone lands at or before adulthood and only product XP requires waiting. Mounts are exempt — a flat payout, because collecting one at maturity is the intended play.
- **XP parity rule:** a full pen earns what a full plot earns. Per-animal rate targets `(0.12 / pen_capacity) × band(species level)`, the same 0.12 Farming uses per plot. Filled farm ≈ 63% of band at realistic uptime; Farming is ~60%.
- **A pen holds one species**, locked on first placement, released when the last head leaves. Coop = small stock, paddock = large.
- **Mounts leave the pen as items, and items do not age.** A collected mount is permanent. Dual gate: Husbandry to raise, Equitation to ride (`SUBTYPE_SKILL` in `routes/equipment.ts` — `horse`/`pony` map to Equitation, and without that entry `level_required` on a mount is decorative).
- **No breeding, on purpose.** Young come only from Trapping (Nesting Hen, Wild Sow) and Hunting (Calf, foals). This is what keeps a homestead skill sending players back into the world.

## 2c-4. Liquids (`services/liquids.ts`)

Milk is not an item a player holds. It is volume inside buckets, and the whole system rests on one invariant:

> **An open container is a bucket that has LEFT the inventory.** Every bucket is therefore in exactly one of three states — empty in the pack, sealed as a `Bucket of X`, or open with units in it. Never nowhere, never counted twice.

- `Lanai Bucket` (empty) and `Bucket of Milk` (sealed, 10 units) are ordinary stackable items, so storage, trade and pickup handle them with no special cases. **This is the point**: an earlier design tracked capacity as a permit (buckets × 10) and the storage route happily handed back unlimited milk, because the constraint did not travel with the item.
- `player_liquids` holds the ONE open container per liquid per player, 1..per-1 units. A row at full capacity should never exist — it seals into an item instead.
- The open container follows the **player**, not a workstation. Dairy has no bench, milking happens at a pen, Cooking will happen at a hearth; binding it to a place would strand milk the moment the player walked indoors.
- Partials cannot be traded, stored or dropped. This is enforced by having no inventory row at all, not by a check: `routes/inventory.ts` appends a synthetic tile so the player can see it, and the client ignores every mode for `synthetic` items.
- **`Milk` still exists as an item row** because recipes name it and `animal_species` produces it, but it can never appear in an inventory again. Do not "fix" this by granting loose Milk.

**The trap, and it has already bitten once:** recipes declare `{ itemName: 'Milk', qty: 3 }` and know nothing about buckets. Four places check recipe inputs — `hasInputs`, `inputsRemaining`, the consume loop in `resolveRecipe`, and **the repeat check in `gameTick.ts`**. All four must call `isLiquid()` first. The fourth was missed on the first pass, so crafting cheese worked exactly once and then stopped with "out of resources". **Any new code that reads `recipe.inputs` and queries `player_inventory` is this bug again.**

## 2c-2. The Manual (`docs/manual-spec.md` is the authority)

Prose is markdown in `apps/client/public/manual/<section>/<slug>.md`, versioned with the code it documents; `manifest.json` drives the nav, so adding a page is a content operation. **Numbers are never hand-written**: `{{data:<query>[:<param>]}}` resolves against the registry in `apps/server/src/routes/manual.ts`, which reads the same tables the game executes against. Content can only name a registered query, never a table.

Also available: `{{tabs}}` / `{{tab:Label}}` / `{{/tabs}}` for one skill with several faces (Trapping under Hunting, Tanning under Crafting — these are *not* separate contents entries), and `{{details:Label}}` / `{{/details}}` for appendices.

`manual_pages` rows **override** the files; deleting a row restores the committed version. Once a page is edited in game the file in git no longer matches what players see — the admin editor flags those ✎ and has an export-for-commit button. Use it.

Two rules the prose must keep: **Talaran is the world, Taiar Island is one island** (attribute island-specific facts explicitly, or they become lies when the second island ships), and any registry query touching `locations` must emit an island column that appears only once content spans more than one.

## 2d. Writing style for player-facing text

Applies to everything a player reads: item/habitat descriptions, NPC dialogue, quest text, flavor text, scene text, result messages, button labels, errors.

- **NO EM DASHES. None.** Not sparingly, not where they "earn it". Zero, in anything a player reads. The previous instruction was "use them sparingly" and it did not work: a patch shipped 27 player-facing lines carrying one, and the Husbandry patch shipped many more. The rule is now absolute because a soft limit is not a limit.
  - Applies to: item and habitat descriptions, NPC dialogue, quest text and objectives, flavor text, scene text, result and error messages, button labels, manual pages, patch notes.
  - Use instead: a full stop (usually best), a comma, a colon, a semicolon, or a rewritten sentence. If a clause seems to need an em dash, it is usually two sentences.
  - Hyphens in compound words are fine (`bark-liquor`, `well-fed`). Ranges are fine. This is about the dash used as a dramatic pause.
  - **Before shipping any player-facing text, grep it.** An em dash is easy to type without noticing and impossible to spot by eye in a 200-line migration.
  - Claude's own conversational replies are not covered by this. Player-facing game text is.
  - Text written before this rule may still contain them. Nathan is clearing those by hand. Do not run a sweep over old content; just never add another.
- **Text is content, so it lives in the DB.** A wording change ships as a migration, not a code edit. Exception: UI chrome (button labels, status lines) lives in the component.
- Keep the voice: plain, concrete, a little folkloric. NPCs talk like working people, not narrators.

## 3. Migrations — hard-won rules

- **`migrate:make`, paste contents, THEN run.** Running `npm run migrate` before saving the file **burns the filename** — knex records it as complete and the real contents *never execute*. This happened (`tannery_all_timber`) and cost an hour of confusion.
- **An already-run migration is frozen.** Knex tracks by filename, not contents. Editing does nothing. If it's the latest: `migrate:down` → edit → `migrate`. If it's buried: **write a new forward-fix migration** (see `merge_tanners_scraps_into_leather_strips`, `tannery_timber_only`). **Once a migration is delivered to Nathan, treat it as applied unless he says otherwise — ask before editing it.** Editing `20260721040000` after delivery silently lost a `scene_text` column *and* a gloves-recipe deletion, each needing its own repair migration.
- **`migrate:down` reverts one migration; `migrate:rollback` reverts the whole batch.** Use `down`.
- **Honest `down()` functions are load-bearing** — they're what makes the edit-and-re-run loop possible at all.
- **Knex orders by FILENAME.** A migration saved without its timestamp prefix sorts *after* everything (`s` > `2`) and runs last. `seed_trapping_content.ts` lost its prefix via a browser download and would have reset tanning to broken **as the final act of the production deploy**. Never save a downloaded migration without matching the generated filename.
- **Filenames must match between local and prod**, or the two databases silently diverge.

## 4. Economy governance

- **`docs/xp-rebalance.md` is law.** `xpPerLevel(i) = round(0.081 × (i+30)³ × (1.33^(1/12))^(i−1))`. One formula, no branches. Anchors: ~2,920 optimal hours to 100; 2,000 xp/hr at L1; tier grid at 12/25/37/50/62/75/87/100.
- **Placing new content = the 4-step recipe** (§8 there): unlock level → ladder target × policy → pick timer → `xp = target × timer / 3600`. **Sim-validate anything novel.** Trapping XP was 4–8% of its policy band until a sim caught it, and the arrow economy was feather-starved at 30% of demand because the spec checked crafting *time* and never checked *supply*.
- **Policies:** gathering ×1.0 · mining rocks ×0.5 / ores ×1.3 · crafting finished goods ×1.8 · intermediates ×0.6 of the crafting band · **passive ×0.30** (trapping) · kiln-tier (~2%) for tanning · unlock dip ×1.10.
- **`items.tier` is DERIVED, never chosen.** It is the band of the **lowest level at which the item can be obtained**, in twelves: **tier 1 = below level 13 · tier 2 = 13–24 · tier 3 = 25–36**, and so on. It is not a judgement about how impressive or valuable the thing is. A Conger Eel weighing 133 lb is tier 1 because it is catchable at Fishing 6; Sloth Meat is tier 2 because the Ground Sloth is level 17. Taiar hosts nothing above tier 2. Existing items are not all correct, so **do not infer the rule from neighbouring rows** — that is how ten of the eighteen fish shipped as tier 2 and 3 (`20260807200500` fixes them).
- Trophy rates scale to event frequency: ~0.33%/kill (hunting), ~5%/catch (trapping) — comparable per-hour.
- Skill build order: Carpentry → Crafting → Hunting → Husbandry → Foraging → Farming → Fishing → Cooking → Combat. **But its position understates Foraging — see the circularity rule.**

### Material families (locked)
- **Leather** (farmed, Husbandry): the mainline. Five tiers of Leather and Leather Strips; armor, saddles, storage. Cattle-only at every sheet tier and strip tiers 2–5.
- **Buckskin** (wild, Hunting): ONE item, yield-scaled by animal size (Deerhide 1 / Boarhide 2 / Slothhide 3). Cuts into **tier-1 Leather Strips only**.
- **Feathers**: wild (pheasant) = trickle; **farmed (Husbandry chickens) = volume**. Same wild/farmed shape as Buckskin/Leather. Do *not* spread feathers to Woodcutting/Agility — trapping is the bird-catching mode, and that's its identity. *(Was geese; Nathan cut geese during the Husbandry build and gave feathers to chickens instead — one fewer species for the same loop.)*
- **Bark** (Carpentry sawing byproduct) supplies tanning's tannins. The five barks map onto five future leather tiers: Lanai tans tier-1, Hatch tier-2, etc.
- Cryptids are the rare tier (Squonk, 0.5% weight). `notable` and `perishable` are per-drop data flags, never inferred from chance.

### Currency (shipped 2026-08-11)

- **Value is DERIVED, never chosen.** `value = xp of the yielding action ÷ 5`, min 1, whole gold. `scripts/deriveValues.ts` writes it. **Do not hand-edit `items.value`** expecting it to survive; the next `--write` overwrites anything not marked `value_locked`. Setting a value in the admin content browser sets that flag automatically. The `OVERRIDES` map at the top of the script is the versioned alternative and locks the row too.
- **The doctrine that has held this together, and that has been got wrong three times: price the ATTENTION an action costs, never the clock it runs on.** Husbandry, crops and passive recipes each broke it. It is why no passive skill drops gold, and why farming's gold finds are on `farm_till` and `farm_harvest` only.
- **The walls: NPC sells at 175% of value, buys at 45%** (pawnbroker 35%). Because buy% sits far below sell%, store-to-NPC arbitrage always loses money *by construction*. `validateWalls()` proves it stays that way; content changes, and a silent inversion is a money printer.
- **Gold from gathering is 1% of xp/hr, at every level, for every timer.** `coins = (xp/5) × (1..3)` at a 2.5% chance; the timer cancels out algebraically. ~22g/hr at L1, ~70g at L50, a constant 11% uplift on merchant income. If it needs to feel richer, raise the multiplier, not the frequency — frequency is what turns a surprise into income.
- **Three safety nets exist and are wired to the admin Balance tab**: `reconcileGold()` (ledger drift — should ALWAYS be empty), `validateWalls()` (arbitrage), `unmappedItems()` (priced items no themed merchant claims, which fall to the pawnbroker's worse rate). A check nobody runs is the same as not having one.
- **The vault counter has two sources**, because shop tax never touches `gold_ledger`: `npc_purchase` from the ledger, plus `SUM(tax)` from `shop_transactions`. See the ledger-invariant landmine in §5.
- **Merchant domains are a map in `services/marketplace.ts`, grouped by the chain that PRODUCES an item**, not what it is made of. A hatchet is the smith's business despite the wooden handle. Unmatched items fall to the pawnbroker, which guarantees nothing is unsellable but is silent — `unmappedItems()` is how you notice a whole skill's output landed there.
- **Daily allowances are per player, per item, per day.** Never a global pool: that hands the good rates to whichever timezone wakes first. Daily merchant stock rotation is seeded from the date string, never `Math.random()`, or the shelves reshuffle whenever pm2 bounces.

### The circularity rule (important)
**The wild economy is gated on itself**: bow → hunt → hide → leather → snare, and both bowstrings and snare cordage would come from hunting. **Foraging is the only thing that breaks the circle** — plant fiber → cordage → snare, and wild flax → linen thread → bowstring, neither requiring a bow. Husbandry *cannot* fix this (it depends on Hunting); it supplies volume, not entry.

Therefore: **tool breakage cannot ship until every tool has a craft path that doesn't require that tool.** Breakage before Foraging = soft-locks. Bow crafting waits on Foraging for the same reason (sinew was rejected: bow→hunt→sinew→bow). Sinew is fine as a *drop* — just never as the bowstring.

## 5. Known landmines

- **The client type-check is a lie.** `apps/client/tsconfig.json` has `"files": []` + project references, so `npx tsc --noEmit` compiles **zero files** and always exits 0. The real command is **`npx tsc --noEmit -p tsconfig.app.json`**. Vite doesn't type-check on build, which is why pre-existing client type errors have accumulated (missing `is_admin`, two conflicting `Skill` types, `onRequestTrade`, `onDropModeChange`, `xpAtLevel` missing from `XpInfo`). Baseline was **30 at a68b680 (2026-07-26)**, **34 at 8d06bfd (2026-08-07)**, and **27 at 8b5f68b (2026-08-11)** — it moves in both directions: measure it yourself on a clean tree before starting, then diff the error *sets* (not just the counts) after. Don't chase zero.
- **pg returns `numeric`/`decimal` as strings.** Use `integer` columns (trap weights are relative ints: 640/355/5) or parse explicitly.
- **CSS tokens have no bare names**: `--color-border-mid/-dark/-gold`, `--color-text-base/-muted/-bright`, `--color-gold`. There is no `--color-border`, `--color-text`, or `--color-error`. Buttons are `btn btn-gold`, not `btn primary`. Check `apps/client/src/index.css` before styling.
- **`:Zone.Identifier` files** breed whenever a browser download is dragged into the repo via Explorer. Gitignored now; if they reappear, something bypassed it. One attached itself to a migration filename and nearly broke the deploy.
- **`lib/markdown.ts` strips more than you expect.** `ALLOWED_TAGS` has no `table`, `details`, or `summary`, and `ALLOWED_ATTR` is only `href/target/rel`, so heading `id`s vanish and markdown tables disappear silently. `addLinkTargets()` also forces every anchor to `target="_blank"`. Anything structural in rendered markdown has to be a React component, not markup.
- **Prod-only data hazard**: `huntable_animals` lived only in prod until canonicalized. When touching a system, verify its data exists in the repo.
- **Travel start deletes any existing action unconditionally** (`routes/travel.ts`) — the universal escape hatch. Remember when reasoning about stuck states.
- **NPCs only render inside submenus** unless `submenu` is null (top-level render added for Geonsen).
- **The smithing quest gate is now UI-only.** `canSmith` refused server-side; the generic executor only applies ×2. The button is still gated.
- Rate-limit ordering bug in `index.ts`: `generalLimit` registered after most mounts; chat limiters defined but unwired. Known, unfixed.
- **Two guild components exist; only one renders.** `GameLayout.tsx` mounts **`GuildPanel`**. `GuildModal.tsx` is dead code and is referenced nowhere. A whole feature was once built into `GuildModal` and appeared to do nothing. Grep `GameLayout.tsx` for what actually renders before editing any panel.
- **`players` has a `guild_id` column.** So in any `guild_forum_*` query that joins `players`, a bare `.where({ guild_id })` is ambiguous and Postgres refuses it. Table-qualify every filter key in joined queries. The denormalised `guild_id` on guild forum tables is both the safety measure and the footgun.
- **Express 5 removed the `:param?` optional route syntax.** `router.get('/data/:query/:param?')` is a boot-time parse error, not an optional segment. Register two routes against one handler instead; that also survives a downgrade, unlike v8's `{/:param}` brace form.
- **A completed migration's file must stay on disk.** knex refuses to run with "migration directory is corrupt" if a row in `knex_migrations` has no matching file. `20260726020000_guild_forum_categories.ts` is an abandoned approach whose effect is reverted by `20260726030000` — it is kept deliberately. Do not tidy it away.
- Client style: 4-space + no semicolons in `apps/client` and server *services*; `gameTick.ts`/index-adjacent use 2-space + semicolons. Match the file you're in.
- **`items.stackable` no longer exists** (dropped `20260801040000`). Every content migration written before that date inserts it, so copying an older one as a template throws on insert.
- **`.where().increment('xp')` on `player_skills` silently drops the XP when the row does not exist.** No error, no warning, the award simply evaporates. Rows CAN be missing: seeds do not re-run, so a skill added to `01_skills.ts` after a player registered leaves that player with no `player_skills` row, and only Carpentry ever got a backfill migration (`20260610002423`). **Always upsert** (`first()`, then `increment` or `insert`) as `services/recipes.ts`, `services/husbandry.ts`, `services/farming.ts` and `services/fishing.ts` do. `services/carpentry.ts` still increments raw; it happens to be safe only because of that one backfill. This shipped as a real bug: cutting bait awarded Crafting XP to nobody who predated Crafting. It fails toward "nothing happened", is invisible on a fresh test account, and is invisible in review.
- **A recipe's XP in its seed migration is not its live XP.** `20260723060000_recipe_timer_floor_and_xp.ts` rebalanced the tool and material recipes, and knex tracks by filename, so the original files still read the old values while the database holds the new ones. Copying a sibling recipe's numbers out of its seed file shipped the fishing hook at double band and the net at two thirds of it. **Query the live row, or check whether a later migration touched it, before calibrating anything against it.**
- **`window` is a reserved SQL word.** `fish_species` uses `time_window`.
- **A new gathering skill is invisible until `routes/location.ts` says it exists.** `LocationPanel.tsx` renders each skill's entry button off a field in the location payload (`foragingHabitats`, `huntableAnimals`, `fishSpeciesCount`). Ship the skill without adding one and there is no way into it from the world, however complete the panel is.
- **Build-tool checks live in `services/construction.ts`. Never write a local copy.** Farming and shops each had their own, and both got it wrong the same way: mallet checked as EQUIPPED, saw checked as merely CARRIED. Husbandry independently got it right, so one rule had two behaviours and nothing said which was correct. The slot map is the load-bearing part — mallet is `mainhand_item_id`, saw is `offhand_item_id`, they fit together, and checking the wrong column fails silently for one of them.
- **`fish_species` holds two kinds of row.** Salvage (`kind='salvage'`) shares the table with fish because it shares location, weight, xp and discovery. Every query needs a `kind` filter. Without one, River Mussels and Locked Rusty Chests offered themselves up to be cut into bait — and it had to be fixed in FOUR places (the picker, the endpoint, the resolver, and gameTick's auto-restart), because hiding a row in the client is decoration, not a control.
- **Express matches routes in registration order, so `/:id` must be declared LAST.** `router.get('/:shopId')` sitting above `/mine/state` swallowed it: `mine` arrived as the shopId, failed to parse, and every owner endpoint under it was unreachable. Looks fine in review and is invisible until something downstream needs the route.
- **Any transaction touching TWO players' gold must lock both rows up front, in ASCENDING player id order.** Two transactions grabbing the same pair in opposite orders deadlock under load, at the worst possible moment. `lockPlayersInOrder()` in `services/gold.ts` handles it; `transferGoldWithin()` calls it for you. The trade window and the shop sale path share these rows.
- **`gold_ledger` deltas must always sum to `players.gold`.** That invariant is the only thing making `reconcileGold()` meaningful. Shop takings go to the shop's TILL, not the owner's balance, so writing a ledger row at sale time puts every player with uncollected takings permanently out of reconciliation. The owner's row happens at collection (`shop_till_withdraw`); the sale itself is history in `shop_transactions`, and the tithe is a column on it, not a ledger line. The vault counter therefore has two sources, which is why (see §4).
- **A trap reset must clear `bait_category`.** `collectTrap` sets the trap back to `state: 'set'`, and for one patch it left the bait on, so a single bait aimed every subsequent catch until the snare broke. Anything that resets a row to a reusable state must consider every field the previous use wrote.
- **`quests.skill` is nullable now** (`20260810170000`). The tutorial belongs to no trade. Client renders must guard it rather than printing `null`.
- **Dialogue actions carry the quest ID, not the name.** `resolveActionQuest` accepts a name as a warned fallback, so `start_quest:Some Quest Name` appears to work until somebody renames it. And `complete_talk_objective` **requires a payload** — the route matches on `complete_talk_objective:` with a colon, and a bare action silently completes nothing.
- **`training-path` in `routes/manual.ts` only reads `resource_nodes` and `recipes`.** Any skill whose progression lives in its own table (`crops`, `fish_species`) renders an EMPTY manual table until a branch is added for it. Both Farming and Fishing hit this.

## 6. Deploy ritual

On the box (`ssh talaran`): `cd /var/www/talaran` → `git pull` → `cd apps/server && npm run migrate` → build → `pm2 restart`. Patch notes + fresh commit message per deploy.

**Box hygiene:** kernel reboot pending since June. **Before rebooting**, confirm `pm2 startup` is registered and `pm2 save` has snapshotted the process list, or the game stays down until someone SSHes in manually. Fold the reboot into a deploy window.

**Before any deploy carrying many migrations: do a fresh-database dry run.** Nathan's local passes because migrations were run piecemeal in authoring order; prod runs them all at once in filename order. That difference is exactly what the `seed_trapping_content` filename bug exposed.

## 7. Docs index & open threads

- `docs/husbandry-design.md` — pre-build Husbandry design. Kept for reasoning; §2c-3 above is the summary of record.

Specs: `docs/marketplace-spec.md` (gold, the Taiar Marketplace, player shops, and the new player tutorial) · `docs/manual-spec.md` (the manual's authority — content model, directives, IA, voice) · `docs/xp-rebalance.md` · `docs/trapping-spec.md` · `docs/crafting-launch-spec.md` · `docs/fishing-spec.md` · `docs/IDEAS.md` (parking lot; the event-chat "firsts" feed lives here). Sims are regenerable — ask Claude to re-derive constants when knobs change.

**Shipped 2026-07-26 (a68b680):** the Manual (19 pages, public `/manual` + in-game panel, live data blocks, admin override editor) and per-guild forums (`guild_forum_*`, own boards and per-board rank permissions, Forum tab in `GuildPanel`).

**Shipped 2026-08-11 (Patch 2.5, "Coin"):** gold + `gold_ledger`, the Taiar Marketplace (5 merchants, 175/45/35 walls, per-player daily allowances with step-down), player shops (storage, listings, standing buy orders with reserved gold, history, unseen-trade badge), gold from gathering, Quank and the new player tutorial, quest rewards folded into the final conversation, trap bait drawn from the fishing pouch, guild tags in Players Here, and the `Coin & Commerce` manual page.

**Deferred by choice, not forgotten:** shop tier ladder (tier 2+ storage/slots — the per-tier numbers already live in a table so it is data plus one row) · stall rent · a poll on one-shop-per-island vs per-location · the Provisioner (seeded but disabled: while inactive, fish/crops/forage fall to the pawnbroker's 35% instead of a themed 45%; set `is_active: true` with `sells: false` to fix without needing a shelf).

**Quank name-drops Merrick** in both dialogue scripts. Rename the smith and that line needs editing in `20260810180000`.

**Manual pages still unwritten:** Cooking, Combat, plus Trading, Item Firsts, Themes & Palettes, and a Bestiary. (Fishing shipped 2026-08-07.) The Skills sidebar will want grouping before those land. `/manual` is also not yet linked from the homepage.

**Next patch, in rough priority:**
- **Husbandry** — SHIPPED (see §Husbandry below). Chickens/cows/pigs, rouncey + palfrey, pens, and the manure faucet.
- **Legacy deletion**: `WOODWORK_RECIPES`, `SMITH_RECIPES`, their routes, and gameTick's `woodworking`/`smithing` branches. Kept one deploy so in-flight actions could resolve; delete now.
- **Onboarding discovery**: the bow moved to Geonsen's quest and nothing signals he exists. Nathan wants quests discovered by finding the giver, *not* listed in the panel — so this needs a hint, an NPC pointer at Talador, or the bow staying at spawn with Geonsen giving only snares.
- Tutorial NPC per skill, the Geo- pattern (Geoffrey/forge, Geossica/workshop, Geonsen/hunt, Georgic/field, Georemy/water — all shipped; keep the convention for new skills). Names are real Je- names with the Je swapped for Geo-.
- **Farming follow-ups (deferred, agreed):** manure source (needs Husbandry) · passive retting pool (needs a farmstead structure) · farmstead/house tiers + Talador house (need Serph nails + the currency/economy plan) · the event-chat "firsts" feed (`item_firsts.announced` is ready).
- Crafting content: gems + finery (deferred — jewelry had no purpose yet). Sinks for Squonk Tears / Rabbit's Foot / Prized Plume.
- Tooltip unification (skill-hover style wins, one shared component).
- Audit continuation: `gameTick` + economy services, trade atomicity, ground-item dupe, the ~29 client type errors → `docs/audit.md`.
- Husbandry: buffalo (L25, Thick Leather), beekeeping (~L35), aurochs (L50, Heavy Leather), sheep (~L60, blocked on a textile consumer), mounts IV–IX. **Breeding** (~L20-25) is deliberately unbuilt — babies come only from the wild, and that's what sends players back out.
- Paper-doll reskin parked, recoverable at commit `8745528`. UI queue: number-font token (`--font-num`, tabular figures), stage-at-rest treatment.

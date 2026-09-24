# CLAUDE.md — Talaran

*Read top to bottom at session start. Last rewritten 2026-09-22; current as of `263afaf`.*

Talaran is a live browser-based medieval skilling MMO in alpha (~30 players), built solo by Nathan (`PendragonTheNinja`). Live at talaran.net · repo `PendragonTheNinja/talaran`, branch `main`.

**Stack:** pnpm monorepo. `apps/server`: Node/Express 5/TypeScript, PostgreSQL via Knex, Socket.io. `apps/client`: React 19/Vite/TypeScript. PM2 on Hetzner behind Cloudflare. Production is `/var/www/talaran` (`ssh talaran`); Nathan works in WSL at `~/talaran`.

**Test account:** `Pendragon`. Assume it in queries, scripts and repro steps.

**Balance assumption:** the average player is logged in far more than 2 hours a day (plan for ~8), and even the "active" skills are nearly passive: click, wait on a timer.

---

## 0. Session start

1. **Sync.** Clone at `/home/claude/talaran`. If it exists: `git fetch origin && git reset --hard origin/main && git clean -fd`. If the sandbox was wiped, re-clone. Nathan applies changes locally and pushes in batches, so the clone lags his machine. **Never edit against a reconstruction.** If he hasn't pushed, ask for a push or a paste.
2. **Install:** `npx -y pnpm@10.33.0 install --frozen-lockfile`.
3. **Baselines** (see §3 for the commands). Record the client error set before touching anything.
4. **Before building anything, read the nearest existing implementation in full** (§6 says which file). If you cannot name the existing feature a new file mirrors, you have not read enough yet. Nearly every shipped bug in this project's history was a convention that already existed here and went unread, not a hard call gotten wrong. When you catch yourself working from memory of how the codebase "usually" works, open the file.

---

## 1. Working contract

1. **One step at a time** unless Nathan asks for a batch. Sizable work: plan → thumbs-up → increments, with Nathan testing between.
2. **Read before write, in the same turn.** The actual file plus a sibling for patterns. Never guess imports, names, CSS classes, column names or signatures.
3. **Verify in the sandbox before delivering.** Write into the clone, type-check, run migrations against real Postgres (§3), sim-validate balance numbers (§8). Deliver only on a clean result.
4. **Evidence, not theory.** Diagnose by reading, instrumenting and reproducing. Read from the commit object (`git show HEAD:path`) when the working tree might be polluted.
5. **Take the long-run route.** Build it where it properly belongs, generic and data-driven. No placeholders, no expedient shortcuts, no second copy of something that exists.
6. **Engage with pushback.** Nathan's instincts are usually pointing at something real: the feather bottleneck, the sinew circularity, the "crafting" name collision and the ingots-in-a-barrel absurdity were all his catches.
7. Dense and direct.

### Handoffs (every delivery)

- **Prefer whole rebuilt files over REPLACE blocks** for anything non-trivial. Edit Nathan's real bytes programmatically, hand over the whole file, and report `git diff --stat HEAD`. Pure additions show 0 deletions; account for every deletion. Say so when a file was regenerated rather than surgically edited. Blocks are for small, isolated, unambiguous edits only.
- **Hand off only files changed in this turn.** Never resend earlier files unless asked; he has already slotted them in.
- **Always give the full path** from `apps/server/src/` or `apps/client/src/`. Fourteen filenames exist in both `routes/` and `services/`.
- **Disambiguate same-named files in the filename itself** (`services-husbandry.ts` / `routes-husbandry.ts`). No subfolders for this. Uniquely named files keep their real names.
- **Migrations:** hand over the complete file with its real `YYYYMMDDHHMMSS_name.ts` name, later than everything in `apps/server/src/db/migrations/`. Nathan drops it in and runs `npm run migrate`. **There is no `migrate:make`; never tell him to generate one.**
- **Commit messages are ONE line.** Multi-line `-m` strings break in his shell.
- **Patch notes** are fully formatted markdown (headers, bold, bullets, rules, blockquotes), fresh every deploy, never reused, and never including changes from a previous deploy.

---

## 2. Architecture

- **Nouns are rows, verbs are code.** Things with stats (nodes, animals, recipes, items, trap types, quests, flavor text, NPC dialogue) live in the DB. Math (XP curve, timers, catch chance, policies) lives in code.
- **Text is content, so it lives in the DB.** A wording change ships as a migration. UI chrome (button labels, status lines) lives in the component.
- **Balance changes ship as migrations:** upsert-by-name, idempotent, loud `throw` on a missing reference, never a silent no-op.
- **Every new system gets transactions and row locks.** Reference implementations: `services/gold.ts`, `services/trapping.ts`, `services/tanning.ts`, `services/husbandry.ts`, `services/shops.ts` (buy path). Legacy paths get retrofitted as touched. §4 lists the rules.
- **Presence is enforced in the service layer**, not the route, so the rule holds however a call arrives.
- **Client never infers from action type.** The server sends `skillName`, `flavorText`, `recipeName`. A hard-coded `currentAction === 'x' ? …` chain once mislabeled every recipe craft as Woodcutting.
- **Never trust the client for anything that matters.** Quantities are validated as integers > 0 on the server. Action strings (NPC dialogue, recipe keys) are checked against server-side state. Prices shown on screen travel back with the request and are compared.

### The word "recipe" has three meanings
- `recipe` / `services/recipes.ts` / `/api/recipes` = **the skill-agnostic executor** (`action_type: 'recipe'`). It reads `recipe.skill` and pays that skill.
- **Crafting** = a skill (leather now, gems later).
- `type: 'crafting'` in `seeds/01_skills.ts` = a skill *category* (processing skills).

### Recipes
- `recipes` is the single home for bench crafts; they render through one component, **`RecipeList`**. Never write a second list.
- Sawing and smelting stay bespoke: they consume *by quality across material types* and pay out through the drop system.
- **`recipes.for_skill`** drives UI tabs (who the output *serves*, not who makes it).
- **`recipes.station`** is a `workstations.type` (`'carpentry'`, `'smithing'`, `'tanning'`, …) or `null` for camp crafts. **Never a display name:** `'Tanning Rack'` saves and reads back fine and is invisible to `services/tanning.ts`. This has shipped twice.
- Active workstation at your location = full speed; otherwise timer ×2 ("making do at the public bench"). `null` station = no penalty.
- **New recipes set `flavor_text`.** `RECIPE_FLAVOR_BY_SKILL` in `GameView.tsx` is a net, not the plan, and needs an entry for any new recipe-owning skill.

### Property & homestead
- A **property** (`player_properties`) is a container a player owns at a location (farmstead, shop, later a house). Not a workstation.
- **Storage is per-property**, keyed by where the player stands. One slot = one unique item stack of any size; topping up never needs a free slot.
- **Capacity lives on the property row** (`plot_slots`, `storage_slots`) so a tier upgrade is a number change.
- **Skill gates belong to the skill that owns the sub-system.** Never gate one skill's capacity behind another skill's level.
- **Building a structure pays CARPENTRY**, never the skill the structure serves, and reports `skillName: 'Carpentry'`.
- **Build-tool checks live in `services/construction.ts`. Never write a local copy.** Mallet is `mainhand_item_id`, saw is `offhand_item_id`; checking the wrong column fails silently.
- **`propertyForPlayerHere()` excludes shops unless asked by name.** Pass a type.

### Shops & marketplace
- **A shop IS a property** (`type='shop'`), so `property_storage` works unchanged. `player_shops` adds only commerce.
- **Two gold stores per shop, never mixed:** `till_gold` (takings, withdraw only) and `buy_fund_gold` (backs buy orders; only `buyFundAvailable()` may be withdrawn).
- **Escrow both sides.** Listing MOVES goods out of storage; cancelling with full storage refuses rather than destroys.
- **Merchants and stock are seed data** (`seeds/08_merchants.ts`), declarative. **Run it ALONE:** `npm run seed` runs every seed, and `02_items.ts` opens by deleting `player_inventory` and `player_equipment`.
- **No cross-shop item index, deliberately.** Finding a good price is a player activity.
- **Daily allowances are per player, per item, per day**, never a global pool. Daily stock rotation is seeded from the date string, never `Math.random()`.

### Husbandry
- **Animal clocks are PAUSE-AWARE; this is the whole skill.** Accrue only while the pen is fed and mucked. Store accrued fed-seconds + `accrued_at` and fold forward on read. No tick sweep. Copying farming's wall-clock `ready_at` here is wrong.
- **Nothing can die.** No mortality, no starvation. Neglect costs the time away and nothing else.
- Juvenile → Adult → Elder. Elders produce slower and never die, but **butcher at full value**. Only XP is weighted by life lived: `xp_slaughter × min(1, life_accrued / full_lifespan)`. Mounts are a flat payout.
- **XP parity:** a full pen earns what a full plot earns. Per-animal rate `(0.12 / pen_capacity) × band(species level)`.
- A pen holds one species, locked on first placement, released when the last head leaves.
- **Mounts leave the pen as items, and items do not age.** Dual gate: Husbandry to raise, Equitation to ride (`SUBTYPE_SKILL` in `routes/equipment.ts`).
- **No breeding, on purpose.** Young come only from Trapping and Hunting. That is what sends homestead players back into the world.

### Liquids (`services/liquids.ts`)
> **An open container is a bucket that has LEFT the inventory.** Every bucket is empty in the pack, sealed as `Bucket of X`, or open with units in it. Never nowhere, never counted twice.
- `player_liquids` holds ONE open container per liquid per player. A full one seals into an item.
- The open container follows the **player**, not a workstation.
- Partials cannot be traded, stored or dropped, enforced by having no inventory row. `routes/inventory.ts` appends a `synthetic` tile.
- `Milk` exists as an item row because recipes name it; it must never appear in an inventory. Do not "fix" this.
- **Code that reads `recipe.inputs` against inventory must handle liquids** (`isLiquid()` first). Current sites: `hasInputs` (the tick's repeat check calls it; never re-implement that check), `inputsRemaining`, `affordability`, and the consume loop in `resolveRecipe`. Use `parseInputs`, which accepts the column as a string or an already-parsed array. Any new code that reads `recipe.inputs` and queries `player_inventory` directly is this bug again.

### Materials & the circularity rule (locked)
- **Leather** (Husbandry, cattle) is the mainline, five tiers. **Buckskin** (Hunting) is one item, yield-scaled by animal size, and cuts into tier-1 strips only.
- **Feathers:** wild pheasant = trickle, farmed chickens = volume. Don't spread feathers to other skills.
- **Bark** (sawing byproduct) supplies tannins; five barks map to five leather tiers.
- **Cryptids are the rare tier** (Squonk, 0.5% weight). `notable` and `perishable` are per-drop data flags, never inferred.
- **The wild economy is gated on itself** (bow → hunt → hide → leather → snare). **Foraging is the only thing that breaks the circle** (plant fiber → cordage; wild flax → linen → bowstring). Therefore **tool breakage cannot ship until every tool has a craft path that doesn't need that tool.** Sinew is fine as a drop, never as the bowstring.

---

## 3. Verification commands

**Server type-check:** `cd apps/server && npx tsc --noEmit`. Baseline 0. Note: `tsconfig.json` **excludes** `src/db/migrations` and `src/db/seeds`, so this says nothing about them.

**Client type-check:** `cd apps/client && npx tsc --noEmit -p tsconfig.app.json`. **Plain `npx tsc --noEmit` in `apps/client` checks zero files and always exits 0.** Baseline **20 errors at `263afaf`** (same set as `6e0afa6`). Vite does not type-check, so a green build proves nothing. The bar is **no NEW errors**; compare error *sets* with line/column stripped:
```
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\)//' | sort > /tmp/now.txt
git stash -q && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\)//' | sort > /tmp/base.txt && git stash pop -q
comm -13 /tmp/base.txt /tmp/now.txt   # anything here is yours
```
Piping tsc into `head` makes `$?` report head's status. Redirect to a file first.

**Migration type-check:**
```
cd apps/server && cat > tsconfig.migrations.json <<'EOF'
{ "compilerOptions": { "target":"ES2020","module":"commonjs","lib":["ES2020"],"strict":true,
  "esModuleInterop":true,"skipLibCheck":true,"noEmit":true,"types":["node"] },
  "include": ["src/db/migrations/**/*.ts"] }
EOF
npx tsc -p tsconfig.migrations.json; rm tsconfig.migrations.json
```

**Type-checking a migration is not verifying it. Run it against real Postgres:**
```
apt-get install -y postgresql && pg_ctlcluster 16 main start
su postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres';\" -c 'CREATE DATABASE talaran_test;'"
```
Build only the tables the migration touches, with the column types the repo declares, then run `up`, `up` again (idempotency), `down`, `up`. **The full chain cannot be replayed from zero** (it fails at `20260715010528`, because migrations need seed data and seeds need later tables), so build the subset.

**Concurrency check.** Any route that moves items or gold: mount the real router on a scratch Express app against the scratch DB, sign a token with the test `JWT_SECRET`, fire 5 parallel requests, and assert that the item's total across pack + storage + ground + worn slots is unchanged. **Import `../index` first** in any harness, or the circular imports leave routers undefined (§9).

Other scripts: `pnpm items:audit` (item-page coverage gaps; should eventually gate deploys) · `pnpm values:derive` (writes `items.value`).

---

## 4. Data integrity rules

These are the rules the 2026-09-22 audit found broken. Each one produced a live bug.

1. **Never read a quantity and write an absolute value back.** `update({ quantity: row.quantity - n })` from an unlocked read is a lost update; two parallel requests both pass the check and both write. Use a transaction, `forUpdate()` the row you read, and write relatively. Best of all, a single conditional statement: `UPDATE … SET quantity = quantity - $n WHERE … AND quantity >= $n`.
2. **Read the state you are about to change INSIDE the transaction, locked.** The equip/unequip dupes read the slot outside the transaction, so two requests both returned the worn item.
3. **Returning from a `db.transaction` callback COMMITS it.** Only a throw rolls back. Any failure after a write inside a transaction must `throw` a typed error. `TradeAbort` in `routes/trades.ts` is the pattern. Returning `{ success: false }` after removing a seller's goods commits the removal.
4. **`forUpdate()` on a row that does not exist locks nothing.** First-of-the-day counters and first-time rows need the player row locked first, or an `INSERT … ON CONFLICT DO NOTHING` before the locked read.
5. **Make completion the gate.** A reward path must flip state with a conditional update (`WHERE status = 'active'`) and pay only if exactly one row changed. Checking, then writing, then paying pays once per parallel request.
6. **Two players' gold: lock both rows up front in ASCENDING id order.** `lockPlayersInOrder()` / `transferGoldWithin()` in `services/gold.ts` do this. Trades and shop sales share these rows; opposite orders deadlock under load.
7. **`gold_ledger` deltas must always sum to `players.gold`.** Shop takings go to the TILL, not the owner, so a sale writes no ledger row; the owner's row happens at `shop_till_withdraw`. The tithe is a column on `shop_transactions`.
8. **XP goes through `awardXp()` in `services/xp.ts`, the only writer to `player_skills`.** It upserts in one statement (a bare `.increment('xp')` silently drops the award when the row is missing, and rows ARE missing for skills added after a player registered), counts `total_xp_earned`, and pushes `skill_xp_changed`. Never pass `total_xp_earned` to `incrementStats` yourself. Inside a transaction pass `trx`: its stats write runs on the same transaction and its push waits for the commit (audit N-1, fixed).
9. **Validate client numbers on the server:** `Math.floor(Number(x))`, finite, > 0. A negative trade quantity reverses the direction of the move.
10a. **Tokens are issued by `issueSession()` and checked by `checkSession()` in `lib/sessions.ts`, and nowhere else.** Every token carries `tv` (the player's `token_version`); `requireAuth` and the socket handshake compare it and check the ban and guest columns, cached 30s per player. `endSessions(playerId, x, { disconnect })` ends every session issued before it: bans and password resets pass `disconnect: true`, a player ending their own other sessions does not. Never call `jwt.sign` directly (audit H1).
10. **Emit sockets after commit, never inside a transaction.** A rollback would un-happen what you announced. Push through `lib/realtime.ts` (`pushToPlayer`, `pushToRoom`, `pushToAll`), never `io` from `index.ts`. Inside a transaction use `pushToPlayerAfterCommit(trx, …)`, or `afterCommit(trx, fn)` from `lib/afterCommit.ts` for any other side effect (bookkeeping through the global connection included). Both run immediately when handed the plain `db`.

---

## 5. Timed actions (`player_actions` + `services/gameTick.ts`)

The tick is a 2-second `setInterval`, one branch per action type. **It claims before it resolves** (`claimDueActions`, audit H2): one `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING *` takes up to 200 due rows and pushes each `completes_at` five minutes out as a lease, so two ticks or two processes never take the same row, and a process that dies mid-resolve retries the action once, five minutes later. Every normal outcome replaces the lease (a repeat writes the next completion, a finish deletes the row), so a resolve path that returns WITHOUT doing either leaves the action waiting five minutes; that is deliberate, and better than the old retry every two seconds. A `ticking` flag skips a tick that finds the previous one still running. The server still runs as one fork-mode PM2 process (`ecosystem.config.cjs`) for the session cache and presence, not for the tick.

### New action type checklist (every item is a bug that shipped)
1. `last_timer_seconds` set on the **initial insert**, not just restarts.
2. **Client restore case in `GameView.tsx`**, or the action vanishes on refresh while the server loops it forever.
3. Route start: existing-action check → 409, **and** catch pg `23505` → 409. The unique constraint on `player_actions.player_id` is the real guard.
4. `last_bot_check` + `bot_check_pending: false` on insert.
5. The resolve path **deletes or restarts on every exit branch**, and **re-validates preconditions each cycle** (equipped items, `is_active` flags, bench tools, `kind` filters).
6. Socket listeners registered **and** added to the `socket.off` cleanup.
7. **Scene text and cancel labels are rows in `action_presentation`**, keyed `(action_type, kind)`, looked up through `lib/actionPresentation.ts`. A new type works with a plain sentence and a Stop button and no client change; add a row in a migration for proper wording. Do not add a `*_SCENE_TEXT` map; those were deleted.
8. **Clear `lastResult` on start:** every `startX` in `GameView.tsx` does `setLastResult(null)` plus timer/travel cleanup. Mirror `startForage`.
9. **The result card has THREE render branches** (hunting / message-carrying / generic). XP-only results (till, build, tend) fall through the generic branch's `itemName` gate and render nothing: send a `message`.
10. **The action limiter is copied per repeating block**, not central. Copy the `action.action_limit` block into any new looping branch. (Only processing skills set a limit at start today.)
11. **`GameLayout.handleLocationAction` needs a branch if a PANEL starts the action.** Panels also call `onActionStarted(seconds, kind)`; see `FarmPanel.tsx`.
12. **Multiple yields go in `drops: [{name, quantity}]`**, passed through the tick and animated per item. Canonical: `rollSecondaryDrops` in `services/carpentry.ts` and the hunting block in `gameTick.ts`.
13. **Grep the FILE's vocabulary, not yours.** Diff `grep "currentAction ==="` and `grep "case '"` against your action types to find render sites nobody thinks to search for.
14. **Coins:** add the type to `GOLD_FIND_ACTIONS` only if a person is actively doing something. Passive work never finds gold.
15. **Buff lookups pass the action's real skill name, and gathering timers go through `calculateTimer` in `services/woodcutting.ts`.** Mining had its own copy, `calculateMiningTimer`, identical except it had no buff step, so a Mining provision never applied to vein mining or a first swing at a rock (audit M1, fixed; the copy is deleted).

### Other tick facts
- **Absence cancels after 30 minutes.** `lib/presence.ts` deletes an action at resolution time once the player has had no socket for `OFFLINE_GRACE_MS`, measured from `players.last_seen`. That column is persisted, so a deploy never resets anyone's allowance: it is stamped on join, on every disconnect, and once a minute for everyone connected by the playtime flush in `services/playtime.ts` (the heartbeat that makes a crash safe). `RESTART_GRACE_MS` (90s) forgives everyone just after boot. The same column is the guild list's "Last seen". **Two presence answers exist:** `isPlayerOnline` in `lib/presence.ts` (room-counted, correct with several tabs) and `onlinePlayers()`/`isOnline` in `lib/realtime.ts` (a Set the first closed tab empties; used for playtime, online lists and guild dots). Prefer `isPlayerOnline` until they are merged (audit M10).
- **The tick re-reads each row before resolving** and skips it if the type, data or `completes_at` changed (travel deletes and replaces rows mid-batch). Since the claim, this guards against the player acting between the claim and the resolve, not against another tick.
- **Travel start deletes any existing action unconditionally** (`routes/travel.ts`). It is the universal escape hatch when reasoning about stuck states.
- The bot check freezes a completed action (`bot_check_pending`) and resumes it on a correct answer.

---

## 6. Where to look before building

| Building… | Read first, in full | Because |
|---|---|---|
| any timed action | `services/farming.ts` + §5 | start/resolve split, `player_actions`, tool checks |
| anything moving items or gold | `services/gold.ts`, `buyFromShop` in `services/shops.ts`, `convertBaitItem` in `services/fishing.ts` | locked, relative, throw-on-failure |
| multiple yields | `services/carpentry.ts` (`resolveSaw`) | the `drops` array and its animation |
| a homestead sub-system | `services/farming.ts`, `services/husbandry.ts` | capacity on the property row, build XP |
| a player-built structure | `resolveEstablish` / `resolveBuildPlot` | mallet + saw gate, **Carpentry XP** |
| a passive/persistent entity | `services/husbandry.ts` (`accrue`) | pause-aware clocks, lazy evaluation, no cron |
| a quest with world-state steps | `backfillQuestObjectives` in `routes/quests.ts` | steps already satisfied must auto-complete |
| an NPC | `getDialogueStage` in `routes/npcs.ts` | stages are derived, scoped by `npc_name` |
| a new panel | `FarmPanel.tsx` | tabs not buttons, help button per tab |
| anything reading `recipe.inputs` | `services/liquids.ts` + §2 Liquids | liquids are volume, not rows |
| a new gathering skill | `routes/location.ts` | the skill is invisible until the location payload carries its field (`foragingHabitats`, `fishSpeciesCount`, …) |

---

## 7. Client patterns

- **Items are always an icon grid:** `getItemIcon(name)` from `lib/items`, `inventory-slot` tiles, name fallback on image error, quantity badge. Never a text list.
- **Persistent modes follow drop mode** (`dropMode`/`tradeMode` in `LeftPanel.tsx`): a toggle that changes what tapping an item does, outliving any panel. The panel overlay passes clicks through (`pointer-events`) while active. Style the active state; `drop-mode-active` is referenced but never styled, so don't copy that gap.
- **Feature panels are one modal with tabs**, not several location buttons.
- **Admin cards are `admin-action-card`** with an emoji-led `admin-section-title`. Gate admin tools on `isAdmin` in the UI as well as the route.
- **CSS tokens have no bare names:** `--color-border-mid/-dark/-gold`, `--color-text-base/-muted/-bright`, `--color-gold`. No `--color-border`, `--color-text`, `--color-error`. Buttons are `btn btn-gold`. Check `apps/client/src/index.css`.
- **`lib/markdown.ts` strips more than expected:** no `table`, `details`, `summary`; attributes are only `href/target/rel`, so heading ids vanish; every anchor is forced to `target="_blank"`. Anything structural in rendered markdown must be a React component.
- **Style: 4-space, no semicolons** in `apps/client` and server services; **2-space + semicolons** in `gameTick.ts` and index-adjacent files. Match the file you're in.
- `GuildPanel` is the live guild UI (`GuildModal` was deleted in `8750a07`). Grep `GameLayout.tsx` for what actually renders before editing any panel.

---

## 8. Economy governance

- **`docs/xp-rebalance.md` is law.** `xpPerLevel(i) = round(0.081 × (i+30)³ × (1.33^(1/12))^(i−1))`. ~2,920 optimal hours to 100; 2,000 xp/hr at L1; tier rungs at 1/13/25/37/50/62/75/87/100.
- **Placing content:** unlock level → ladder target × policy → pick timer → `xp = target × timer / 3600`. **Sim-validate anything novel**, and check *supply*, not just crafting time (the arrow economy was feather-starved at 30% of demand because the spec only checked time).
- **Policies:** gathering ×1.0 · mining rocks ×0.5 / ores ×1.3 · finished goods ×1.8 · intermediates ×0.6 of the crafting band · passive ×0.30 · tanning at kiln tier (~2%) · unlock dip ×1.10.
- **A recipe's XP in its seed migration is not its live XP.** Later migrations rebalance by name (e.g. `20260723060000`). Query the live row or check later migrations before calibrating against a sibling.
- **`items.tier` is DERIVED:** the band of the lowest level at which the item can be obtained. Bands: T1 1–12 · T2 13–24 · T3 25–36 · T4 37–49 · T5 50–61 · T6 62–74 · T7 75–86 · T8 87–99 · T9 100. A level that starts a rung opens the new tier. Tier is never about rarity or value. Taiar hosts nothing above T2. **Don't infer the rule from neighbouring rows**; many were wrong.
- **Durability scales with tier:** a larger guaranteed use count before the break roll, and a lower break chance after. Tracked per player per item name, whether carried, worn or socketed.
- **Trophy rates scale to event frequency:** ~0.33%/kill (hunting), ~5%/catch (trapping).

### Currency
- **Value is DERIVED:** `value = xp of the yielding action ÷ 5`, min 1, whole gold, written by `scripts/deriveValues.ts`. Hand edits are overwritten unless `value_locked` (set automatically by the admin content browser; the script's `OVERRIDES` map is the versioned alternative).
- **Price the ATTENTION an action costs, never the clock it runs on.** This has been gotten wrong three times (husbandry, crops, passive recipes). It is why passive skills never drop gold, and farming finds gold only on `farm_till` and `farm_harvest`.
- **Walls:** NPCs sell at 175% of value, buy at 45%, pawnbroker 35%. Buy% far below sell% means NPC arbitrage always loses. `validateWalls()` proves it stays that way.
- **Gold from gathering = 1% of xp/hr** at every level and timer: `coins = (xp/5) × (1..3)` at 2.5%. Raise the multiplier, never the frequency.
- **Safety nets, wired to the admin Balance tab:** `reconcileGold()` (always empty), `validateWalls()`, `unmappedItems()` (priced items no themed merchant claims). Run them after any economy change.
- **Merchant domains** (`services/marketplace.ts`) group by the chain that PRODUCES an item, not its material.
- Economy design decisions locked with Nathan: `docs/economy-spec.md` §1. Do not re-litigate.

### Skill build order
Carpentry → Crafting → Hunting → Husbandry → Foraging → Farming → Fishing → Cooking → Combat. The position understates Foraging (circularity rule, §2). Tutorial NPCs use the Geo- convention (Geoffrey, Geossica, Geonsen, Georgic, Georemy): a real Je- name with Je swapped for Geo-.

---

## 9. Known landmines

### Server
- **Nothing in `services/`, `routes/` or `lib/` imports from `index.ts`, statically or dynamically (2026-09-24).** Keep it that way: importing `index.ts` boots a whole game server (listener, tick, startup checks), so a script that reached a module importing it started a second one. `logger` comes from `lib/logger.ts`; pushes go through `lib/realtime.ts`. A harness can now mount any router directly without importing `index.ts` first. `dotenv` loads in time only because `db/index.ts` happens to call it first.
- **Express 5 removed `:param?`.** It is a boot-time parse error. Register two routes against one handler.
- **Express matches in registration order: `/:id` goes LAST.** `/:shopId` above `/mine/state` swallowed every owner endpoint.
- **pg returns `numeric`/`bigint` as strings.** Use integer columns or parse explicitly. `players.gold` is bigint; normalise with `Number()`.
- **`window` is a reserved SQL word** (`fish_species.time_window`).
- **`players` has a `guild_id` column**, so any `guild_forum_*` query joining `players` must table-qualify filter keys, or Postgres calls it ambiguous.
- **Adding `.count()` to a `.select()`** makes Knex infer only the aggregate shape. Type the call (`.select<{ player_id: number }[]>(…)`) rather than using `any`.
- **`fish_species` holds fish AND salvage** (`kind`). Every query needs a `kind` filter; hiding salvage in the client alone had to be fixed in four places.
- **`training-path` in `routes/manual.ts` reads only `resource_nodes` and `recipes`.** A skill whose progression lives in its own table renders an empty manual table until it gets a branch.
- **A reset to a reusable state must clear every field the last use wrote.** A trap reset that kept `bait_category` aimed every later catch.
- **`quests.skill` is nullable.** Client renders must guard it.
- **Dialogue actions carry the quest ID** (`start_quest:12`). Names are a warned fallback. `complete_talk_objective` **requires** a payload after the colon.
- **Quank name-drops Merrick** in `20260810180000`. Rename the smith and that line needs a migration.
- **`items.stackable` no longer exists** (dropped `20260801040000`). Older content migrations insert it; don't copy them as templates.
- **Prod-only data hazard:** when touching a system, verify its data exists in the repo, not just on the box (`huntable_animals` lived only in prod until canonicalized).

### Migrations
- **`npc_dialogues.text_lines` is `text[]`: pass a plain JS array.** `npc_dialogues.options` is `jsonb`: pass `JSON.stringify(...)`, because the pg driver turns a JS array into a Postgres array literal. Same care for any `specificType('text[]')` or `jsonb` column.
- **Never hardcode ids from `content-snapshots/`.** Look up by name and throw a clear error if missing.
- **Save the file, THEN run migrate.** Running it before the contents are on disk burns the filename: Knex records it complete and the contents never execute.
- **An applied migration is frozen** (Knex tracks by filename). Latest: `migrate:down` → edit → migrate. Buried: write a forward-fix. **Once delivered to Nathan, treat a migration as applied unless he says otherwise; ask before editing it.**
- `migrate:down` reverts one; `migrate:rollback` reverts a whole batch. Use `down`. Honest `down()` functions are what make the edit-and-rerun loop possible.
- **Knex orders by filename.** A migration saved without its timestamp prefix sorts last and runs last. Filenames must match between local and prod.
- **A completed migration's file must stay on disk**, or Knex refuses to run ("migration directory is corrupt"). `20260726020000_guild_forum_categories.ts` is abandoned but kept deliberately.
- Guard schema alters with `hasColumn` so a half-failed migration can be re-run.
- **`:Zone.Identifier` files** appear when a browser download is dragged in via Explorer. One attached itself to a migration filename once.

---

## 10. Player-facing writing

Applies to everything a player reads: item and habitat descriptions, NPC dialogue, quest text, flavor and scene text, result and error messages, button labels, manual pages, patch notes. Not to conversation with Nathan.

- **NO EM DASHES. Zero.** Use a full stop, comma, colon, semicolon, or a rewritten sentence. Hyphens in compounds and ranges are fine. **Grep before shipping any player-facing text.** Old text may still contain them; Nathan clears those by hand. Don't run a sweep.
- **Banned:** "it's not just X, it's Y", "more than just", "not merely", "a testament to", "at its core", "the heart of", "delve", "tapestry", "rich history of", "seamlessly", "unlock", "whether you're a X or a Y", corporate register (leverage, streamline, optimize, robust, utilize, facilitate), and a closing sentence that restates the paragraph.
- **Concrete nouns** ("tannin-stained hands", not "the tanning experience"). **Specific numbers** ("nine winters", not "many years"; the Manual narrator may use period diction like "a great many").
- **Vary sentence length hard.** Fragments are good. No three-item lists used for rhythm.
- **Written from inside the world.** A pickaxe description does not mention mining levels. Period-plausible diction. NPCs talk like working people, not narrators. Plain, concrete, a little folkloric.
- **Overused, now capped:** the corrective reversal ("It is not a hunt. It is a transaction with a deer.") at most once per page and only where it genuinely turns the meaning. "Which is a different thing" is retired. Grep for both.
- Don't add rules aimed at evading AI detection. Write well because Talaran should sound like itself.

### The Manual (`docs/manual-spec.md` is the authority)
- Prose is markdown in `apps/client/public/manual/<section>/<slug>.md`; `manifest.json` drives the nav.
- **Numbers are never hand-written:** `{{data:<query>[:<param>]}}` resolves against the registry in `routes/manual.ts`. Content names a registered query, never a table.
- `{{tabs}}` / `{{tab:Label}}` / `{{/tabs}}` for one skill with several faces; `{{details:Label}}` / `{{/details}}` for appendices.
- `manual_pages` rows **override** the files. In-game edits drift from git; the admin editor flags them ✎ and exports for commit.
- **Talaran is the world; Taiar Island is one island.** Attribute island-specific facts explicitly. Registry queries touching `locations` emit an island column shown only once content spans more than one island.

---

## 11. Deploy

On the box: `cd /var/www/talaran` → `git pull` → `cd apps/server && npm run migrate` → build → `pm2 restart`. One-line commit message, fresh markdown patch notes.

- **Before a deploy carrying many migrations, do a fresh-order dry run.** Local ran them piecemeal in authoring order; prod runs them all at once in filename order.
- **The server runs from `ecosystem.config.cjs` at the repo root**: one fork-mode process named `talaran-server`. Restart it by that name. Never `pm2 start` it a second time under another name, and never switch to cluster mode: the session cache and presence live in process memory.
- **Box hygiene:** a kernel reboot has been pending since June. Before rebooting, confirm `pm2 startup` is registered and `pm2 save` has snapshotted the process list.

---

## 12. Docs index

| Doc | What it is |
|---|---|
| `docs/AUDIT-2026-09-22.md` | **Current audit.** Findings, fix batches, structural recommendations. Check status here before touching trades, inventory, storage, equipment, quests or the tick. |
| `docs/xp-rebalance.md` | XP law (§8). |
| `docs/economy-spec.md` | Locked economy decisions. |
| `docs/marketplace-spec.md` | Gold, merchants, player shops, new-player tutorial. |
| `docs/manual-spec.md` | Manual content model, directives, voice. |
| `docs/trapping-spec.md` · `docs/crafting-launch-spec.md` · `docs/fishing-spec.md` · `docs/cooking-outline.md` | Per-system specs. |
| `docs/derived-values.md` / `.csv` | Output of `values:derive`. Regenerated, not edited. |
| `docs/IDEAS.md` | Parking lot (the event-chat "firsts" feed lives here). |
| `docs/BUILD-NOTES.md` · `docs/WIRING.md` · `docs/FARMING-M1-NOTES.md` | Historical handoff notes from the Foraging and Farming builds. Archive candidates. |

**Cited but missing from the repo:** `docs/support-spec.md` (referenced by `routes/paddleWebhook.ts`, `services/talers.ts`, `services/store.ts`) and `docs/husbandry-design.md`. §2 Husbandry is the summary of record.

---

## 13. Open threads

- **Audit fix batches 1–4** (`docs/AUDIT-2026-09-22.md` §8).
- **Legacy deletion:** `WOODWORK_RECIPES`, `SMITH_RECIPES`, their routes, and the tick's `woodworking`/`smithing` branches. Still referenced in `gameTick.ts`.
- **Onboarding discovery:** the bow moved to Geonsen's quest and nothing signals he exists. Nathan wants quests discovered by finding the giver, not listed in a panel.
- **Combat** is next (design documented; pending Foozard's review).
- **Deferred by choice:** shop tier ladder (numbers already in a table) · stall rent · one-shop-per-island vs per-location poll · the Provisioner (seeded but disabled; activate with `sells: false`) · farming manure source / retting pool / house tiers · breeding (deliberately unbuilt).
- **Husbandry roadmap:** buffalo (L25, Thick Leather), aurochs (L50, Heavy Leather), sheep (~L60, blocked on a textile consumer), mounts IV–IX.
- **Crafting content:** gems + finery. Sinks for Squonk Tears, Rabbit's Foot, Prized Plume.
- **Manual pages unwritten:** Combat, Trading, Item Firsts, Themes & Palettes, Bestiary. The Skills sidebar wants grouping first. `/manual` is not yet linked from the homepage.
- **UI queue:** tooltip unification (skill-hover style wins), number-font token (`--font-num`, tabular figures), stage-at-rest treatment. Paper-doll reskin parked at `8745528`.

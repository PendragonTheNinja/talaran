# Foraging — Build Notes (wake-up summary)

Good morning. The **entire Foraging backend is built and compiling** (server `tsc` = 0, client `tsc` = 30 baseline, no new errors). The only thing left is wiring the menu into `GameView.tsx` — I deliberately left that for us to do together rather than half-wire it while you slept and risk handing you a broken client build. Spec for it is below.

---

## Consistency audit (you asked — here's the honest version)

I re-checked foraging against woodcutting / mining / hunting for the things that get silently dropped:

- **`incrementStats` — was missing, now fixed.** Woodcutting and mining call it every action (`total_actions_completed`, `total_xp_earned`, + a skill counter). I'd skipped it in the first pass. It's now in `processForagingAction`, incrementing `total_items_foraged` / `total_actions_completed` / `total_xp_earned` on every gather, *outside* the discovery guard — matching **mining** (which is the correct reference; woodcutting has it mis-scoped *inside* the discovery block, so woodcutting actually under-counts). Added a `total_items_foraged` column to `player_stats` in the schema migration to back it.
- **Hunting has the same gap** — it calls `incrementStats` **zero** times. That's the pre-existing omission you were remembering; I'd copied it. Foraging is now fixed; **hunting still isn't.** One-line fix, happy to fold it in — see Open items.
- **Verified consistent:** skill row already exists in the seed (`Foraging`, `type: gathering`, `display_order: 4`), the `/stop` endpoint is type-agnostic (deletes by player, so foraging stops cleanly), the action-row shape matches mining's `action_data` pattern, and the tick emit mirrors hunting.
- **Two deliberate divergences** (not bugs, but flagging so they're your call): (1) discovery uses a dedicated `player_foraging_discoveries` table + flat 10 Exploration XP per new item, rather than woodcutting's `player_exploration` node-discovery row + `required_level*5` XP — because the `???` feature needs per-item granularity. (2) No `updateQuestObjectiveProgress` hook yet (hunting has a `'hunt'` one) — there's no `'forage'` objective type defined, so I didn't invent one. Trivial to add when a foraging quest exists.

---

## What's in the box

**`migrations/`**
- `20260721020000_create_foraging_tables.ts` — `foraging_habitats` (JSON `drop_table`, ID-robust) + `player_foraging_discoveries` (the `???`-until-found log).
- `20260721020100_seed_foraging_content.ts` — all ~33 items, the four Lanaivale habitats with weighted drop tables (commons + folklore rares), the three tool recipes, and flips `Foraging.is_implemented = true`. Upsert-by-name throughout — idempotent, prod-safe, `down()` leaves items alone. Mirrors your `seed_trapping_content.ts` exactly.

**`server/`**
- `foraging.ts` → `apps/server/src/services/foraging.ts` (new)
- `routes_foraging.ts` → `apps/server/src/routes/foraging.ts` (new; rename on drop)
- `gameTick.ts` → `apps/server/src/services/gameTick.ts` (MODIFIED — import, `case 'foraging'`, and the repeat/emit block)
- `index.ts` → `apps/server/src/index.ts` (MODIFIED — import + `app.use('/api/foraging', …)`)

**`client/`**
- `ForagingMenu.tsx` + `ForagingMenu.css` → `apps/client/src/components/` (new; compiles, not yet rendered)

---

## How it plays

Pick-a-habitat, exactly as we designed. Four patches at Lanaivale unlock at **L1 / L5 / L9 / L13** (Sunlit Meadow → Forest Floor → Creekbank → Bramble Thicket). Working a habitat auto-repeats; each cycle is a **weighted pick of one find**. Tools (all optional, checked from inventory):

- **🔪 Knife** — shortens the timer (5%/tier, capped 50%).
- **🧤 Gloves** — *required* to gather the prickly rows (nettle, brambles, sloe, elderberry, blackthorn, hedgewitch's sprig). Without them those rows are simply excluded from the roll.
- **🧺 Basket** — +1 quantity per gather (the slight, reliable yield nudge).

**Discovery:** every item shows `???` in the habitat card until you personally pull it there; the card shows an `X/Y found` counter so completion is legible. First-time discovery of an item also drops 10 Exploration XP.

**Rares (folklore-flavored, sparkle via `notable`):** Four-Leaf Clover, Faelight Bloom, Witch's Butter, Ghost Pipe, Frogspawn, Wisp Cap, Blackthorn Sprig, Hedgewitch's Sprig — plus Oak Gall (ink) and Willow Bark as mid-tier notables. Descriptions are in the Papa-Yaga register.

**Seasons seam:** `drop_table` entries can carry an optional `season` field; absent = year-round, and the resolver has the filter point marked but does nothing with it yet. Turning seasons on later = a `getSeason()` helper + tagging new rows. No migration needed.

---

## Deploy (once the GameView wiring below is done)

1. Drop the two migration files into `apps/server/src/db/migrations/` as-is. Timestamps (`…020000`, `…020100`) already sort after your latest (`…013355`), so ordering is correct — no `migrate:make` needed. *(If you'd rather generate your own timestamps: `cd apps/server && npx knex --knexfile knexfile.ts migrate:make create_foraging_tables` then `… seed_foraging_content`, and paste the bodies in order.)*
2. Apply the new + modified server files, apply the client files, do the GameView wiring.
3. Build/verify locally: `cd apps/server && npx tsc --noEmit` (expect 0) and `cd apps/client && npx tsc --noEmit -p tsconfig.app.json` (expect your 30 baseline).
4. Commit, push. On the box: `git pull` → `cd apps/server && npm run migrate` → build server, build client → `pm2 restart <name>`.
5. Sanity check on prod: the migration throws loudly if `Lanaivale` isn't found, so a clean migrate confirms the location lookup succeeded.

**Recipe input assumptions** (all should already exist — flag if any are named differently): `Reeds` (basket; also foraged at Creekbank, so the loop is self-contained), `Buckskin` + `Leather Strips` (gloves), `Ambren Ingot` + `Lanai Planks` (knife).

---

## The one remaining piece — GameView wiring

Mirror the **hunting** wiring; the touch points are the same shape. In `apps/client/src/components/GameView.tsx`:

1. **Import + state.** `import ForagingMenu from './ForagingMenu'` and a `const [showForaging, setShowForaging] = useState(false)`.

2. **Open trigger.** Wherever the Hunting menu button/entry point lives for a location, add a sibling "Forage" entry that calls `setShowForaging(true)`. (Foraging should show at Lanaivale — same gate you use to decide whether Hunting shows at Eld Grove. If it's easier, just always render the button and let the menu say "nothing to forage here" when the habitat list is empty — the endpoint already returns `[]` gracefully.)

3. **Render the menu.**
   ```tsx
   {showForaging && (
     <ForagingMenu
       onClose={() => setShowForaging(false)}
       onStartForage={handleStartForage}
       playerForagingLevel={/* the player's Foraging level, same source hunting uses for its level */}
     />
   )}
   ```

4. **Start handler** (mirror `handleStartHunt` around line ~850):
   ```tsx
   const handleStartForage = async (habitatId: number) => {
     try {
       const res = await apiFetch<{ timerSeconds: number; completesAt: string }>('/api/foraging/start', {
         method: 'POST', body: JSON.stringify({ habitatId }),
       })
       setCurrentAction('foraging')
       // start the countdown exactly as hunting does with res.timerSeconds / res.completesAt
     } catch (err: any) {
       addLog(err.message || 'Could not start foraging.', 'error')
     }
   }
   ```

5. **`action_complete` branch.** In the socket `action_complete` handler, add an `actionType === 'foraging'` case. The payload `result` is `{ itemName, quantity, xpAwarded, skillName: 'Foraging', notable, firstDiscovery }`. Log something like:
   `You found {quantity}× {itemName}.` — sparkle if `notable`, and prepend `New discovery! ` if `firstDiscovery`. XP/level-up come through `xpInfo` just like hunting.

6. **Active-scene display** (optional polish, mirror `currentAction === 'hunting'` at ~1037/1076): a `currentAction === 'foraging'` branch for the scene text (e.g. "You move through the {habitat}, gathering as you go…") and the timer bar. The loop already runs server-side without this; it's just the visual.

That's the whole list. 1–5 make it fully functional; 6 is flavor. When you're up, ping me and we'll do these against your current `GameView.tsx` one block at a time — I didn't want to guess at your latest version of that file.

---

## Open / deferred

- **Hunting's missing `incrementStats`** — same gap foraging just fixed; hunting tracks no stats at all. One `incrementStats(player, { total_animals_hunted: 1, total_actions_completed: 1, total_xp_earned: hunt.xp })` in the tick's hunting block (needs a `total_animals_hunted` column). Say the word and I'll add it alongside this batch.
- **Tuning knobs** (all easy to change in the content migration): habitat unlock levels (1/5/9/13), weights, per-item XP, basket = +1 flat. Say the word and I'll rebalance.
- **Foraging XP curve check** — I set per-find XP by eye against the item's rarity, not against a band sim like we did for trapping. Worth a quick sim pass before it matters.
- **Higher-tier baskets/gloves/knives** and **T2 foraging** (future island) — the tier fields and location lookup are ready for them.
- **Gloves as equipment vs. inventory** — currently "own it in inventory and it works," which sidesteps the three-tools-one-slot problem. Flag if you'd rather they equip.
- Still on the wider backlog from before: v2.1 patch-notes post + Store-open announce, the bot-check craft-fix confirmation from Aragon/TraBach.

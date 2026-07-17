# CLAUDE.md — Talaran Project Constitution

*The first thing a new session reads. Last updated 2026-07-16.*

Talaran is a live browser-based medieval skilling MMORPG in alpha (~30+ players) by Nathan (`PendragonTheNinja`). Live at talaran.net · repo `PendragonTheNinja/talaran`, branch `main` · React/TS/Vite client + Node/Express/TS server + PostgreSQL/Knex + Socket.io · PM2 on Hetzner behind Cloudflare · monorepo: `apps/client`, `apps/server`. **Production lives at `/var/www/talaran`** (`ssh talaran` from Nathan's WSL; his working repo is `~/talaran`).

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
7. Scene text + cancel button driven by server data, not a hard-coded action-type chain.

## 3. Migrations — hard-won rules

- **`migrate:make`, paste contents, THEN run.** Running `npm run migrate` before saving the file **burns the filename** — knex records it as complete and the real contents *never execute*. This happened (`tannery_all_timber`) and cost an hour of confusion.
- **An already-run migration is frozen.** Knex tracks by filename, not contents. Editing does nothing. If it's the latest: `migrate:down` → edit → `migrate`. If it's buried: **write a new forward-fix migration** (see `merge_tanners_scraps_into_leather_strips`, `tannery_timber_only`).
- **`migrate:down` reverts one migration; `migrate:rollback` reverts the whole batch.** Use `down`.
- **Honest `down()` functions are load-bearing** — they're what makes the edit-and-re-run loop possible at all.
- **Knex orders by FILENAME.** A migration saved without its timestamp prefix sorts *after* everything (`s` > `2`) and runs last. `seed_trapping_content.ts` lost its prefix via a browser download and would have reset tanning to broken **as the final act of the production deploy**. Never save a downloaded migration without matching the generated filename.
- **Filenames must match between local and prod**, or the two databases silently diverge.

## 4. Economy governance

- **`docs/xp-rebalance.md` is law.** `xpPerLevel(i) = round(0.081 × (i+30)³ × (1.33^(1/12))^(i−1))`. One formula, no branches. Anchors: ~2,920 optimal hours to 100; 2,000 xp/hr at L1; tier grid at 12/25/37/50/62/75/87/100.
- **Placing new content = the 4-step recipe** (§8 there): unlock level → ladder target × policy → pick timer → `xp = target × timer / 3600`. **Sim-validate anything novel.** Trapping XP was 4–8% of its policy band until a sim caught it, and the arrow economy was feather-starved at 30% of demand because the spec checked crafting *time* and never checked *supply*.
- **Policies:** gathering ×1.0 · mining rocks ×0.5 / ores ×1.3 · crafting finished goods ×1.8 · intermediates ×0.6 of the crafting band · **passive ×0.30** (trapping) · kiln-tier (~2%) for tanning · unlock dip ×1.10.
- Trophy rates scale to event frequency: ~0.33%/kill (hunting), ~5%/catch (trapping) — comparable per-hour.
- Skill build order: Carpentry → Crafting → Hunting → Husbandry → Foraging → Farming → Fishing → Cooking → Combat. **But its position understates Foraging — see the circularity rule.**

### Material families (locked)
- **Leather** (farmed, Husbandry): the mainline. Five tiers of Leather and Leather Strips; armor, saddles, storage. Cattle-only at every sheet tier and strip tiers 2–5.
- **Buckskin** (wild, Hunting): ONE item, yield-scaled by animal size (Deerhide 1 / Boarhide 2 / Slothhide 3). Cuts into **tier-1 Leather Strips only**.
- **Feathers**: wild (pheasant) = trickle; **farmed (Husbandry geese) = volume**. Same wild/farmed shape as Buckskin/Leather. Do *not* spread feathers to Woodcutting/Agility — trapping is the bird-catching mode, and that's its identity.
- **Bark** (Carpentry sawing byproduct) supplies tanning's tannins. The five barks map onto five future leather tiers: Lanai tans tier-1, Hatch tier-2, etc.
- Cryptids are the rare tier (Squonk, 0.5% weight). `notable` and `perishable` are per-drop data flags, never inferred from chance.

### The circularity rule (important)
**The wild economy is gated on itself**: bow → hunt → hide → leather → snare, and both bowstrings and snare cordage would come from hunting. **Foraging is the only thing that breaks the circle** — plant fiber → cordage → snare, and wild flax → linen thread → bowstring, neither requiring a bow. Husbandry *cannot* fix this (it depends on Hunting); it supplies volume, not entry.

Therefore: **tool breakage cannot ship until every tool has a craft path that doesn't require that tool.** Breakage before Foraging = soft-locks. Bow crafting waits on Foraging for the same reason (sinew was rejected: bow→hunt→sinew→bow). Sinew is fine as a *drop* — just never as the bowstring.

## 5. Known landmines

- **The client type-check is a lie.** `apps/client/tsconfig.json` has `"files": []` + project references, so `npx tsc --noEmit` compiles **zero files** and always exits 0. The real command is **`npx tsc --noEmit -p tsconfig.app.json`**. Vite doesn't type-check on build, which is why **~29 pre-existing client type errors** have accumulated (missing `is_admin`, two conflicting `Skill` types, `onRequestTrade`, `onDropModeChange`). Measure against that baseline; don't chase zero.
- **pg returns `numeric`/`decimal` as strings.** Use `integer` columns (trap weights are relative ints: 640/355/5) or parse explicitly.
- **CSS tokens have no bare names**: `--color-border-mid/-dark/-gold`, `--color-text-base/-muted/-bright`, `--color-gold`. There is no `--color-border`, `--color-text`, or `--color-error`. Buttons are `btn btn-gold`, not `btn primary`. Check `apps/client/src/index.css` before styling.
- **`:Zone.Identifier` files** breed whenever a browser download is dragged into the repo via Explorer. Gitignored now; if they reappear, something bypassed it. One attached itself to a migration filename and nearly broke the deploy.
- **Prod-only data hazard**: `huntable_animals` lived only in prod until canonicalized. When touching a system, verify its data exists in the repo.
- **Travel start deletes any existing action unconditionally** (`routes/travel.ts`) — the universal escape hatch. Remember when reasoning about stuck states.
- **NPCs only render inside submenus** unless `submenu` is null (top-level render added for Geonsen).
- **The smithing quest gate is now UI-only.** `canSmith` refused server-side; the generic executor only applies ×2. The button is still gated.
- Rate-limit ordering bug in `index.ts`: `generalLimit` registered after most mounts; chat limiters defined but unwired. Known, unfixed.
- Client style: 4-space + no semicolons in `apps/client` and server *services*; `gameTick.ts`/index-adjacent use 2-space + semicolons. Match the file you're in.

## 6. Deploy ritual

On the box (`ssh talaran`): `cd /var/www/talaran` → `git pull` → `cd apps/server && npm run migrate` → build → `pm2 restart`. Patch notes + fresh commit message per deploy.

**Box hygiene:** kernel reboot pending since June. **Before rebooting**, confirm `pm2 startup` is registered and `pm2 save` has snapshotted the process list, or the game stays down until someone SSHes in manually. Fold the reboot into a deploy window.

**Before any deploy carrying many migrations: do a fresh-database dry run.** Nathan's local passes because migrations were run piecemeal in authoring order; prod runs them all at once in filename order. That difference is exactly what the `seed_trapping_content` filename bug exposed.

## 7. Docs index & open threads

Specs: `docs/xp-rebalance.md` · `docs/trapping-spec.md` · `docs/crafting-launch-spec.md`. Sims are regenerable — ask Claude to re-derive constants when knobs change.

**Next patch, in rough priority:**
- **Foraging** — the front door to the wild economy (plant fiber → cordage → snares; wild flax → linen → bowstrings). Unblocks bow crafting and, eventually, tool breakage.
- **Legacy deletion**: `WOODWORK_RECIPES`, `SMITH_RECIPES`, their routes, and gameTick's `woodworking`/`smithing` branches. Kept one deploy so in-flight actions could resolve; delete now.
- **Onboarding discovery**: the bow moved to Geonsen's quest and nothing signals he exists. Nathan wants quests discovered by finding the giver, *not* listed in the panel — so this needs a hint, an NPC pointer at Talador, or the bow staying at spawn with Geonsen giving only snares.
- Tutorial NPC per skill (Geoffrey/forge, Geossica/workshop, Geonsen/hunt — the Geo- pattern).
- Crafting content: gems + finery (deferred — jewelry had no purpose yet). Sinks for Squonk Tears / Rabbit's Foot / Prized Plume.
- Tooltip unification (skill-hover style wins, one shared component).
- Audit continuation: `gameTick` + economy services, trade atomicity, ground-item dupe, the ~29 client type errors → `docs/audit.md`.
- Husbandry: geese (feather volume), cattle (leather), live-capture box trap (the Hunting→Husbandry bridge).
- Paper-doll reskin parked, recoverable at commit `8745528`. UI queue: number-font token (`--font-num`, tabular figures), stage-at-rest treatment.

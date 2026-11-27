# Invasions: design

*Fourth draft, 2026-11-27: the roster is simulated and its drops are set; nothing is open. **Built so far (2026-11-27):** steps 1 to 3 on the server, the realms and creatures of step 6, and the top-three gold of step 4; see §12. Nothing here is built. It extends the world-events system (`docs/WORLD-EVENTS-AND-MUSEUMS.md`, "Invasions, later") and the fight engine (`docs/combat-spec.md`). Where this conflicts with either, they win until Nathan decides otherwise. **OPEN** marks what waits on Nathan; **SIM** marks what `scripts/combatSim.ts` settles before any content is seeded.*

**Decided (Nathan, 2026-11-27):** they are called **tears**. **Staff send every invasion**; there is no automatic schedule. Gatherers at the place **are not affected**. The realms are **Greek myth and the Welsh Otherworld**, twelve creatures between them (§7, roster approved). Invaders drop more and better than natives, and their rare gear has **no bad luck protection** (§6). An invader's best drops are **gear for other skills, better than its tier** (§6).

---

## 0. What an invasion is

Staff open a tear somewhere on an island and things from another world come through. Everyone who fights there draws from one shared horde. Kill enough of them before the tear closes and the place is held, and the Chronicle remembers it. Run out the clock and the tear closes on its own, and the horde goes back with it. Either way, the three who killed most are paid in gold by their kills.

It is the combat version of a skill event. A skill event is "this place pays more for a while, until the pool runs dry". An invasion is "this place is under attack, until the horde runs out".

**Scope:** creatures of level 1 to 24 (Taiar's band and Antura's). Later tiers bring worse things up to 100; the system is built so they are rows, not code (§9).

---

## 1. Lore

- **Not the Rift.** The Rift is a seam downward, where the light comes up. A tear is a seam *sideways*, into somewhere else. Nothing an invader says or carries names what lies under the Rift (CLAUDE.md §2 Talar). The light may draw them; that is as far as the text goes.
- **Not a Portal.** "Portal" is the Talar spell (`services/spells.ts`). Player-facing text says **tear**; code says `invasion`.
- **Every invasion comes from one realm.** A realm is a row: its name, a line of what is seen through the tear, its roster, and its drops. Realms come back; regulars learn their creatures, and the Bestiary fills over many invasions.
- **Two realms to start:** **the Bronze Shore** (Greek myth, without the gods) and **Annwn** (the Otherworld of the Welsh tales). Both are public domain. Twelve creatures between them, one every two levels from 2 to 24 (§7).
- **The Laranists have opinions.** Georome gets a few rare lines (`npc_rare_lines`) about tears: wrong about what they are, as Laranists are about everything, but in an interesting way.
- **Sources:** public-domain myth and literature, and worlds of Talaran's own. Never a renamed creature from a work under copyright, and no guest creatures from other games (Nathan, 2026-11-27).

---

## 2. What a player sees

1. **A warning** (if staff give one). A chat line some minutes before: *"The air over Verdale has begun to shimmer, like heat off a road in winter."* The Events panel shows it as coming, with a countdown and the realm's level range, never the realm. Staff choose the lead time, from none to a day ahead ("opens at eight tonight").
2. **The tear opens.** A second line names what came through: *"A tear has opened over Verdale. Bronze birds are coming out of it, and the hedges are full of their feathers."* The place gains a fighting spot for the length of the invasion (§3), shown in the location panel as the tear, with the horde's count: "The Tear over Verdale · 212 of 300 left · 1 h 04 min".
3. **Fighting it** is an ordinary fight: Fight, choose a creature, the same fight view, food, flee, death. Each kill takes one from the horde, and the result card says so: "88 of 300 driven back".
4. **Held.** The kill that takes the last one closes the tear. A chat line names the place, how many fought, and the three who killed most.
5. **Lost.** If the clock runs out first, the tear closes with the rest of the horde inside. One chat line; kills already made keep their XP and drops.
6. **The top three are paid** either way (§6), on a notice, the next time they look if they are away.
7. **Gatherers** at the place carry on exactly as before. The tear is a fighting spot beside them, nothing more.

---

## 3. How it is built on what exists

### The event

- **A new kind, `invasion`, in `world_events`.** It gets what the other kinds have: the countdown, the Events panel, the admin Events tab (extend, refill, end now), and history. `pool_total` / `pool_left` is the horde, counted in kills.
- **Staff send it; nothing else does.** The scheduler never picks `invasion` (as it never picks the merchant on its own). **Who may:** admins, and any moderator with a new permission, **`can_run_events`** (added to `STAFF_PERMISSIONS` in `lib/staffPermissions.ts`; Nathan, 2026-11-27, for an event moderator to come). It covers sending a tear and extending, refilling, or ending a live one; whether it later covers skill events and the merchant is Nathan's call. The admin Events tab gets a **Send a tear** card: realm, place, horde size, length, the XP bonus, the minimum kills to place in the top three, an optional warning lead time, and optionally a later opening time. The realm's own warning and opening lines fill in and can be rewritten before sending.
- **A tear sent for later** is a `world_events` row with `starts_at` in the future and a `warned_at`/`opened_at` pair, picked up by a database-driven sweep like the Crier's polls (`announced_open_at`), so a restart loses nothing. Never a bare `setTimeout` (CLAUDE.md §4 rule 15).
- **Where:** any place staff choose, except islets, roads, and the sea. **At most one live tear per island** (refused at send, like a second skill event for the same skill and place). The places with no fighting of their own make the best stage (Verdale, Lanaivale, Luxmere, Talador's square; Wendhaven, Farefield, Underway, Bidewater), but nothing forbids a tear at Eld Grove.
- **The realm's island fit is checked at send:** the card shows the roster's levels and warns (does not refuse) when they are far from the island's band.

### The fighting spot

- **Invaders are ordinary `creatures` rows** with a `realm_id` (nullable; null is native). So the Bestiary, `drop_table_entries` (`combat:<creature>`), `combat:derive`, the sim's `roster`, and Exploration's first-find records all work unchanged. `bestiary_all` **does not** count invaders (they come and go; a completionist could not finish without staff); they get feats of their own (§6).
- **When a tear opens, it creates a `fighting_spots` row** at its place (`kind: 'chosen'`, a new nullable `world_event_id`), with the creatures that fit the island and the realms sent (§7) in `fighting_spot_creatures`. **Chosen, not drawn**: a roster spans a band, and a combat 3 player must be able to pick the level 2 creature and leave the level 12 one to someone else. When the tear closes, the spot is set `is_active: false`, never deleted (a fight row points at it).
- **Starting a fight already refuses an inactive spot.** A fight *in progress* when the tear closes finishes the creature it is on, is paid, then ends, as a weapon break ends one. No half-paid kills.

### Taking from the horde

- **One unit per kill, inside the settle's own transaction**, by one conditional statement: `UPDATE world_events SET pool_left = pool_left - 1 WHERE id = ? AND pool_left > 0 AND ended_at IS NULL RETURNING pool_left`. A row back: the kill counts. None: the horde is gone, so the kill pays as an ordinary kill and the fight ends after it. A settle replays many swings at once, so this runs once per kill it settles, in order.
- **The kill that brings `pool_left` to 0 closes the event** in the same transaction (`ended_at`, `end_reason: 'held'`). The top-three reward, the announcement, and the Chronicle deed run after commit (`afterCommit`). Two fighters on the last kill at once: the conditional update orders them; exactly one closes it. **race:check `invasion`**: many players on the last few units; exactly `pool_total` kills counted, the top three paid once each, never twice; shown to fail against a read-then-write version first.
- **Each player's kills are counted in `world_event_shares`** (built for Kindle), in the same transaction. That decides the top three. `per_player_cap` stays null by default; staff may set one at send for a tear meant for newcomers.
- **Lock order** stays the fight's own (action, fight, player, equipment), with the event row last and touched only by that one statement.

### XP

- **A kill pays the creature's own `xp_per_kill`** through the normal split (`killXp`), like any creature. Invaders are profiled and derived like everyone else (§8).
- **Plus the tear's bonus**, `world_events.xp_multiplier` (default **+25%**, as skill events), applied once to the whole kill before the split. Not through `applyEventBonus` inside `awardXp`: a kill calls `awardXp` three times (Melee, Defense, Constitution) and would take three units. The settle passes the bonus in and calls `awardXp(…, { eventBonus: false })`. The result card shows it as `eventXp`.

---

## 4. Absence, bots, and death

- **Absence and bot checks are unchanged.** A disconnected fighter flees at `last_seen` unless they opted in to fighting offline; a bot check freezes between kills.
- **AFK against invaders** works as it does anywhere: well below your level. A strong player clearing a Taiar tear at idle is allowed; staff who want a tear kept for newcomers set a per-player cap when they send it.
- **Death is normal death** (CLAUDE.md §2 Combat): everything drops at the tear's place, private for the usual minutes, respawn in Talador.

---

## 5. Size (first guesses, **SIM**)

Defaults the Send card fills in; staff change any of them per tear.

| | On Taiar (levels 1 to 12) | On Antura (13 to 24) |
|---|---|---|
| Horde | 300 kills | 250 kills |
| Length | 2 hours | 2 hours |
| Closing reward from | 5 kills | 5 kills |
| XP bonus | +25% | +25% |

A level-matched kill on Taiar takes about 40 to 60 seconds plus the 10 second engage delay, so one fighter makes about 60 to 70 kills an hour. Six fighters hold a 300-kill tear in about 45 minutes; two cannot hold it in two hours. With thirty players, "a crowd" is six. Staff sending a tear to a quiet evening make it smaller.

---

## 6. Rewards

### Per kill

XP (§3) and the creature's drops, under every combat rule already locked (CLAUDE.md §2): **no meat**, no whole armour pieces.

**Invaders drop more, and better, than natives** (Nathan, 2026-11-27): tears are treats staff send now and then, not a place to farm, so a kill there should feel like it. Against a native of the same level:

| | Natives today | Invaders |
|---|---|---|
| Its main drop, a good another skill uses (ore, feathers, logs, bones, seeds) | about 1 kill in 4 to 20 | **1 in 2** |
| Second and third goods | some creatures | **every creature, 1 in 4 to 20** |
| Gems | the Knocker's quartz 1 in 40, the Hodag's garnet 1 in 250 | **every creature, 1 in 60 to 150** |
| Coin | some creatures, 1 in 4 | the people among them (Pwca, Spartos, the Huntsman), 1 in 2 or 3, more of it |
| Trophy | 1 in 750 | **1 in 150** |
| Rare gear (below) | rare weapons 1 in 750 to 1,000 | **1 in 150**, no bad luck protection |

The goods are chosen by each creature's character, so a tear helps the whole economy, not only fighters: the Afanc fells Lanai, the Myrmex digs Ambren Ore, the Stymphalian Bird sheds Feathers. The full tables and what they come to are §7. Feathers are the one place to be generous (arrows have always wanted them).

### The rare drop: gear for another skill, better than its tier

Nathan's rule (2026-11-27): **some invaders drop gear that beats its tier, mostly for skills other than combat.** Boots that walk faster than Leather Boots; a staff faster than the Lanai Staff; a hatchet, pick, or bench tool that works like the next tier's.

It is the rare weapons' rule (`docs/combat-spec.md` §10) carried into other skills:

- **As good as the next tier's made piece**, worn or used from the dropping creature's level in the skill it serves (a hatchet gates on Woodcutting, boots on Wayfaring; through `gateSkill` in `services/equipGates.ts`, which needs a branch for each new kind), and **far more durable** than the made one (`items.durability_*`).
- **Rare, but reachable in a tear:** 1 in 150, and **one rare drop per creature at most**. **No bad luck protection** (Nathan, 2026-11-27): a tear is a treat, and its rare drop is luck, not a counter worked off. A tear of 300 kills over six creatures is about 50 kills each, so a crowd sees one now and then, and nobody is owed one. They trade, which is how a non-fighter gets one: a gatherer buys boots off a fighter.
- **Never the only way.** Each is a better version of something a player can already make or buy, so the circularity rule holds (CLAUDE.md §2): nothing essential sits behind a tear that only staff open.
- **Each uses a speed hook that already exists, or names the one it needs:**

  | Kind | Hook today | What a drop needs |
  |---|---|---|
  | Walking staff, boots | `items.agility_reduction`, read by `services/travel.ts` (Lanai Staff 0.03, Leather Boots 0.05) | a number only |
  | Gathering tool (hatchet, pick) | the tool's `items.tier` against the node's `required_tool_tier` (`calculateTimer`, `services/woodcutting.ts`) | **a new column, `works_as_tier`**: `items.tier` is derived from where an item is first had (CLAUDE.md §8), so a level 10 creature's hatchet is tier 1 by rule and must not be changed by hand; `calculateTimer` reads `works_as_tier ?? tier` |
  | Bench tool (the smithy's hammer) | bench recipes already run 12% faster a tier the job's lowest tool is above the recipe (`tierMultiplier` in `services/workstations.ts`); smelting and sawing use no bench tool and never speed up (a player's report, 2026-11-27) | **waits on the tool-tier pass** (Nathan, 2026-11-27: every tool above its work's tier speeds it, bench tools included). The **Forgefire Hammer** (the smithing `hammer` slot, the Khalkotauros's) is built on whatever rule that pass settles, rather than a column of its own |
  | Foraging gloves | gloves today only open the prickly rows (`requiresGloves`, `services/foraging.ts`); they do not touch the timer | **a new column, `forage_speed_pct`**, read in `calculateForageTimer` after the knife; null on every made glove, so nothing else changes. The Gwiber-scale Gloves carry **0.02** (Nathan, 2026-11-27: gloves help speed "very slightly") and open the prickly rows like any gloves |
  | Hunting aids (the bow) | the bow's tier, as a gathering tool | `works_as_tier`, as above |

- **Numbers** (Nathan, 2026-11-27): where no made piece of the next tier exists yet, the drop is **about 1.5× the made piece of its own tier**, and the made next-tier piece is fitted around it later. **Pwca's Blackthorn 0.045** (the Lanai Staff is 0.03); **Teumessian Boots 0.08** (Leather Boots are 0.05). The **Myrmex Mandible Pick**, **Afanc-tooth Hatchet**, and **Huntsman's Bow** work as tier 2 (`works_as_tier: 2`): on tier 1 work that is calculateTimer's +10% for a tool a tier above (and the bow's +3% catch), on tier 2 work no penalty, worn from Mining 2, Woodcutting 12, and Hunting 24. The **Forgefire Hammer** 0.05 and the **Gwiber-scale Gloves** 0.02 are above.

### When the tear closes

**The three who killed most are paid in gold, by their kills** (Nathan, 2026-11-27; this replaces the first draft's Tear-glass):

- **Pay a kill:** that creature's XP a kill ÷ 5, the value rule's one kill's worth, so a kill of a harder creature pays more. **First place gets all of it, second 60%, third 30%.** A Taiar tear's top killer with 80 kills gets about 530 gold, second (60 kills) about 240, third (45) about 90; on Antura about 600, 270, and 100.
- **Held or lost, the same.** The top three fought either way; a lost tear is already its own cost, and the Chronicle tells it.
- **Only fighters with at least the tear's minimum kills** (default 5) can place, so a tiny tear does not pay a single kill. Ties go to whoever reached the count first (`world_event_shares` keeps when each row last changed).
- **Paid in one transaction after the close commits**, through `services/gold.ts` with a `gold_ledger` row (`invasion_reward`, ref the event), guarded by a conditional flip on the event (`rewards_paid_at IS NULL`) so it is paid once (race:check `invasion`).
- **The Chronicle:** deed kinds `invasion_held` and `invasion_lost` (`chronicle_deed_kinds` rows, `noteDeed`, ten verses each), naming the place, the realm, and the top killer.
- **Feats** (category Combat): *Held the Line* (help hold your first tear: at least the minimum kills in a held tear), *Hold Ten*, *Hold Fifty*; *Top of the Tally* (first place in a tear); *Between Worlds* (a kill of every invader).
- **Never Talers, never a Taler-bought advantage.** Paying and free players stand side by side at a tear.

---

## 7. The roster, levels 1 to 24

**Twelve creatures, one every two levels** (Nathan, 2026-11-27): six from each realm, alternating, three of each per island band. A tear on Taiar fields the six from 2 to 12; a tear on Antura the six from 14 to 24. Staff may send one realm alone (three creatures) or both through one tear (all six of the band). Across each band, every damage type is the weakness of two creatures.

None repeats a creature already in Talaran.

**The Bronze Shore** (Greek myth: Herodotus, Pausanias, Apollonius, Ovid, and Plutarch): labors and voyages, without the gods. Bronze, sun, salt, and the smell of a forge.
**Annwn** (the Welsh Otherworld: the Mabinogion and Welsh folklore): a hall where it is always evening, white hounds with red ears, lakes that are not the depth they look.

### Profiles, as simulated (2026-11-27)

`combatSim.ts roster`, run on a scratch copy fed these rows (the live command reads the database; it is rerun on the seeded rows before shipping). A level-matched one-hander with a shield, hitting the weakness. XP/hr is against the level's baseline grunt; the guardrail is ±15%. Profile columns are the `creatures` multipliers (blank is 1.0); swing is seconds (blank is the grunt's 3.0). XP a kill is `xpPerKillAt(level)`, what `pnpm combat:derive` writes.

| Lvl | Creature | Realm | Character | Weak / resists | acc | def | pow | hp | swing | Kill | XP/hr | HP lost/hr | Idle from | XP a kill |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | Myrmex | Bronze Shore | a dog-sized ant that digs for gold; tough shell, poor aim | crush / slash | 0.85 | 1.15 | 0.9 | | | 35 s | 95% | 1,487 | combat 10 | 27 |
| 4 | Pwca | Annwn | a shape-shifting goblin that walks travelers off the road at night | slash / pierce | 1.05 | 1.1 | 0.9 | 0.95 | 2.4 | 35 s | 99% | 2,041 | combat 15 | 29 |
| 6 | Spartos | Bronze Shore | a soldier grown from a sown dragon's tooth; no fear, no flesh | crush / pierce | 1.05 | 1.05 | 1.1 | | | 37 s | 98% | 1,834 | combat 23 | 32 |
| 8 | Gwyllgi | Annwn | the Dog of Darkness, a shadow mastiff with red eyes; quick, it harries | pierce / – | 1.15 | | 0.9 | | 2.4 | 37 s | 100% | 2,157 | combat 29 | 34 |
| 10 | Stymphalian Bird | Bronze Shore | bronze-beaked, it sheds its feathers like darts | pierce / slash | 1.15 | 1.1 | 0.9 | 0.95 | 2.4 | 40 s | 98% | 2,312 | combat 36 | 37 |
| 12 | Afanc | Annwn | a lake beast like a huge beaver; drags people under, gnaws trees | slash / crush | 0.9 | | 1.25 | 1.15 | 3.6 | 47 s | 90% | 2,190 | combat 40 | 40 |
| 14 | Khalkotauros | Bronze Shore | a bronze-hoofed bull that breathes a forge's heat; slow, heavy | pierce / crush | 0.85 | 1.05 | 1.3 | 1.1 | 3.6 | 49 s | 89% | 2,556 | combat 45 | 35 |
| 16 | Cŵn Annwn | Annwn | white hounds with red ears, hunting in a pack; accurate | slash / crush | 1.2 | | 0.95 | | 2.4 | 45 s | 101% | 3,689 | combat 58 | 38 |
| 18 | Teumessian Fox | Bronze Shore | the fox fated never to be caught; very hard to hit, light | crush / pierce | 1.1 | 1.3 | 0.85 | 0.75 | 2.4 | 47 s | 101% | 3,346 | combat 56 | 42 |
| 20 | Gwiber | Annwn | a winged serpent of the Welsh hills; quick, venomous | slash / pierce | 1.05 | | 1.05 | | 2.4 | 50 s | 100% | 4,862 | past 60 | 46 |
| 22 | Crommyonian Sow | Bronze Shore | a wild sow the size of a cart that laid waste to a country | pierce / crush | 0.9 | 0.95 | 1.3 | 1.25 | 3.6 | 63 s | 87% | 4,235 | past 60 | 51 |
| 24 | Huntsman of Annwn | Annwn | one of the Otherworld king's riders (the king never comes), horn at his belt; a person, so coin | crush / pierce | 1.1 | 1.1 | 1.15 | | | 62 s | 91% | 5,563 | past 60 | 55 |

**Against the natives** (the same run on the live profiles): every invader sits at 87 to 101% of its grunt's XP an hour, the natives' own range (86 to 113%). They cost a little more health than the natives beside them, which is the "slightly tougher" the spec asked for: the Myrmex 1,487 an hour against the Granary Rat's 1,324, the Gwyllgi 2,157 against the Grey Wolf's 2,095, the Gwiber 4,862 against the Snallygaster's 4,225 a level above, the Huntsman 5,563 against the Bolter's 5,024 at the same level. Two first drafts were refitted: the Khalkotauros was outside the guardrail at 84% (defence 1.15 to 1.05), and the Gwiber cost 5,626 health an hour, half again the Reaver's (power and accuracy 1.15 and 1.1 to 1.05, health 0.95 to 1.0). Five quick creatures were brought from 104 to 109% down to about 100% with a little more health.

### Drops

Rates set against Taiar's live drop tables (`content-snapshots`, 2026-11-23) and Antura's migrations. **Goods** are items with a main source of their own (ore, logs, feathers, seeds, gems), so their price never moves with a drop rate. **Trophies** and **rare gear** are combat's own and are priced by `values:derive` at the creature's XP a kill ÷ 5 per kill, the rule every combat-only item follows; the rare gear's price goes in `OVERRIDES` (its subtypes are not combat's).

| Creature | Goods (1 in N, how many) | Coin | Trophy, 1 in 150 | Rare gear, 1 in 150 |
|---|---|---|---|---|
| Myrmex | Ambren Ore 2 (1 to 3), Rough Quartz 60 | | Ant-gold Nugget | **Myrmex Mandible Pick** |
| Pwca | Feathers 4 (1 to 3), Turnip Seeds 8 (1 to 2), Linen Cloth 40 | 1 in 3, 3 to 12 | Pwca's Lantern | **Pwca's Blackthorn** |
| Spartos | Bones 2 (1 to 2), Ambren Ingot 10, Rough Quartz 80 | 1 in 3, 5 to 15 | Sown Dragon's Tooth | |
| Gwyllgi | Bones 2 (1 to 3), Flax Seeds 10 (1 to 2), Rough Garnet 150 | | Gwyllgi's Eye | |
| Stymphalian Bird | Feathers 2 (2 to 5), Amber 8, Rough Quartz 60 | | Bronze Feather | |
| Afanc | Fine Lanai Log 2 (1 to 3), Excellent Lanai Log 20, Rough Garnet 120 | | Afanc Skull | **Afanc-tooth Hatchet** |
| Khalkotauros | Serph Ore 2 (1 to 3), Charc 4 (1 to 3), Rough Garnet 120 | | Bronze Hoof | **Forgefire Hammer** |
| Cŵn Annwn | Bones 2 (1 to 2), Buckskin 5 (the hounds hunt stags in the tale), Rough Garnet 100 | | Red Ear of Annwn | |
| Teumessian Fox | Barley Seeds 4 (1 to 2), Cabbage Seeds 6 (1 to 2), Feathers 5 (1 to 3; stolen hens), Rough Garnet 100 | | Teumessian Brush | **Teumessian Boots** |
| Gwiber | Bones 2 (1 to 2), Rough Garnet 80, Rough Quartz 100, Rough Amethyst 600 | | Gwiber Fang | **Gwiber-scale Gloves** |
| Crommyonian Sow | Barley 2 (2 to 4; raided fields), Broad Beans 4 (1 to 3), Leek Seeds 8 (1 to 2), Rough Garnet 100 | | Sow's Tusk | |
| Huntsman of Annwn | Buckskin 4, Locked Rusty Chest 15, Linen Cloth 20, Lit Garnet 300 | 1 in 2, 10 to 40 | Horn of Annwn | **Huntsman's Bow** |

- **No new materials.** Every frequent drop is a good that already has a use, so nothing is added without one (CLAUDE.md §8). The new items are the twelve trophies (museum cases and the pawnbroker, as every trophy) and the seven pieces of rare gear.
- **Seeds and crops stay in their tier:** Taiar's invaders drop Taiar's seeds, Antura's drop Antura's, at levels at or above where they open, so no derived `items.tier` moves. No Truffle from the Sow for that reason (it is tier 3).
- **Gems** are where invaders are most generous beside the natives (the Hodag's garnet is 1 in 250 and the Bolter's 1 in 60). Rough Garnet is worth 1,120, so it decides a creature's worth more than anything else; the first draft had the Khalkotauros at 1 in 60 and the Gwiber at 1 in 40, which made them the two richest kills in the game, and both were thinned.
- **Rare gear durability** is the rare weapons': 6,250 sure uses, then 0.1% a use.
- **Items' island:** the Taiar six's trophies and gear are Taiar's museum's, the Antura six's Antura's (`items.island`).

### What a kill is worth

The drops' value a kill, in multiples of the creature's XP a kill ÷ 5 (a native with one combat-only drop line is 1×), worked from the tables above at the live values:

| | Value a kill | × (XP ÷ 5) | Per hour, level-matched | In 50 kills |
|---|---|---|---|---|
| Myrmex | 22 | 4.0 | 1,717 | 50 Ambren Ore |
| Pwca | 21 | 3.6 | 1,665 | 25 Feathers, 9 Turnip Seeds |
| Spartos | 17 | 2.7 | 1,298 | 38 Bones, 5 Ambren Ingots |
| Gwyllgi | 18 | 2.7 | 1,381 | 50 Bones, 8 Flax Seeds |
| Stymphalian Bird | 18 | 2.4 | 1,301 | 88 Feathers, 6 Amber |
| Afanc | 33 | 4.1 | 2,124 | 50 Fine Lanai Logs |
| Khalkotauros | 37 | 5.3 | 2,247 | 50 Serph Ore, 25 Charc |
| Cŵn Annwn | 26 | 3.4 | 1,680 | 38 Bones, 10 Buckskin |
| Teumessian Fox | 34 | 4.1 | 2,155 | 31 seeds, 20 Feathers |
| Gwiber | 42 | 4.5 | 2,497 | 38 Bones, a garnet or two |
| Crommyonian Sow | 35 | 3.4 | 1,710 | 75 Barley, 25 Broad Beans |
| Huntsman of Annwn | 54 | 4.9 | 2,698 | 12 Buckskin, 600 coin |

**Against Taiar's natives:** most are 1 to 3× (the Grey Wolf 2.0, the Wrecker 3.3, the rats under 1), and the Hodag alone is 6.4× (its Hodag Horn is priced at 12,000 in the 2026-11-23 snapshot, which is its old 1 in 1,500 odds; at today's 1 in 300, `values:derive` would make it 2,400). Invaders are 2.4 to 5.3×: better than the creatures beside them, as decided, and none past the richest native. These are item values, not gold in hand: goods sell to a merchant at 45% and trophies only to the pawnbroker at 35%.

**A tear's whole haul** (300 kills, about 50 of each of six): on Taiar about 50 Ambren Ore, 110 Feathers, 90 Bones, 50 Fine Lanai Logs, two or three gems, two trophies, and on average one or two pieces of rare gear (seven a tear would be a lucky night; none is possible). On Antura, 50 Serph Ore, 75 Barley, two or three garnets. A good evening's haul for a crowd, and no week's supply of anything.

**Held back for later tiers:** Talos the bronze giant, the Nemean Lion, and the Hydra; the Twrch Trwyth (a king turned boar, the first group boss once group fights exist); the Ellyll, the Harpy, the Empusa, and Gwrach y Rhibyn, kept as spares.

---

## 8. Balance

- **Every invader goes through `combatSim.ts roster`** against the ±15% XP-an-hour guardrail at its level (`docs/combat-spec.md` §8). `pnpm combat:derive` writes `xp_per_kill`. No hand-set XP.
- **Invaders are slightly tougher than natives of their level,** not easier: 90 to 100% of the grunt's XP an hour before the +25%.
- **Simulated** (2026-11-27): all twelve inside the guardrail, at 87 to 101% (§7).
- **XP budget:** a tear's extra XP is bounded by its horde: 300 kills × 25% of about 33 XP a kill is about 2,500 XP across a crowd on Taiar, a few minutes' work each.
- **Value:** 2.4 to 5.3× a kill's worth against the natives' 1 to 3× (§7), none past the Hodag. The top three's gold is bounded by the horde: one fighter taking every kill of a 300 horde gets about 2,000 on Taiar, and a crowd's top three share about 850 to 1,000.
- **values:derive:** rare drops with no made source need prices from the made piece they beat (`OVERRIDES`), or the pawnbroker and the museum cannot place them.

---

## 9. Later tiers

The same rows carry the system to 100. A realm has a roster per island band, so the Bronze Shore can come back at T5 with Talos. Leaders grow into **bosses** once group fights exist (`docs/combat-spec.md` §9, "Bosses, later": rejoinable, not ended by one disconnect). Near 100 is where stranger worlds belong: Talaran's own, and cosmic horror (Lovecraft's earlier stories are public domain in the UK and EU, and in the US only for works published before 1931; check each one). Parked realms from the first draft, for later: Carroll's Wabe, Baum's desert edge, and two of Talaran's own, the Glasswold and the Drowned Bell.

---

## 10. Open questions for Nathan

None. Everything in the first draft's list is decided (2026-11-27). New questions go here as building finds them.

---

## 11. Build order

1. **Schema:** `realms`, `creatures.realm_id`, `fighting_spots.world_event_id`, `world_events.starts_at`/`warned_at`/`opened_at`/`min_kills`/`rewards_paid_at`, `items.works_as_tier`, `items.forage_speed_pct`, the `can_run_events` permission. Fresh-database safe (`hasContent`).
2. **The kind:** Send a tear (admin), the sweep that warns and opens, the spot created and retired, held and lost, announcements, the Events panel.
3. **The fight hooks:** the pool take in settle, the tear's XP bonus, fights ending when it closes, `world_event_shares` counts. race:check `invasion`.
4. **Rewards:** the top-three gold and its notice, Chronicle deed kinds, feats.
5. **Gear hooks:** `works_as_tier` in `calculateTimer` and the hunting bow's check, `forage_speed_pct` in `calculateForageTimer`; the hammer on the tool-tier pass.
6. **Content:** the Bronze Shore and Annwn, each a migration: realm, creatures, drops, rare gear, items with `island`, warning and opening lines. combatSim, combat:derive, values:derive.
7. **Manual page** (how tears work, never what drops: that is the Bestiary's), patch notes.

Each step ships and is proven on its own.

---

## 12. Built

**Increment 1 (2026-11-27), server only.**
- Migrations `20261127120000_invasions` (schema) and `20261127130000_invasion_realms` (the two realms, the twelve creatures with the §7 profiles and XP, their goods, coin, and trophies; each island's trophies named on its Spoils of the Fight). Both run up, up again, down, up on a scratch database built from the baseline and the 2026-11-23 snapshot.
- `services/invasions.ts`: `sendTear` (one tear an island, sent or open; the roster is the realms' creatures whose level's tier is the island's), `invasionSweep` (warn, open, close on time, retry unpaid; from the world-events scheduler), `closeTear`, `closeHeldWithin`, `finishTear` (top three, gated on `invasion_rewards`), `takeFromHordeWithin` (one conditional statement a kill). A tear's spot is made when it is sent, inactive, with its roster, and switched on when it opens.
- `services/combatFights.ts`: a kill at a tear's spot takes from the horde in the settle, the tear's bonus raises the kill before the split (`eventBonus: false` on the three awards), the kill card says how much of the horde is driven back, and the fight ends after the kill that finds the tear closed (`ended: 'closed'`).
- Staff routes on `/api/admin/events`: `GET /tears`, `POST /tears/send`, `POST /tears/:id/end`, for admins and `can_run_events` moderators. The admin tab's End on a tear goes through `closeTear`.
- `listEvents` hides a tear until its warning or its opening; `endExpiredEvents` leaves tears to the sweep. `bestiary_all` counts Talaran's own creatures only. A tear's spot and its creatures are left out of content snapshots (`snapshotWhere` in `lib/contentTables.ts`).
- race:check `invasion` (two scenarios: five kills on a horde of two; five payments of one tear's top three), each shown to fail against a read-then-write take and an ungated payment.
- `combatSim.ts roster` on the seeded rows: every invader 87 to 101%, as §7. `values:derive` prices the trophies at 810 (Ant-gold Nugget) to 1,650 (Horn of Annwn).

**Still to build:** the Send a tear card and the tear on the location panel and Events panel (client), the `invasion_reward` notice, the moderator tick box, the Chronicle deed kinds and their verses, the feats, the seven pieces of rare gear and their hooks, the Manual page, and patch notes.


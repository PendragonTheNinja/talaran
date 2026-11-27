# Invasions: design

*Third draft, 2026-11-27; the roster and drop shape are approved. Nothing here is built. It extends the world-events system (`docs/WORLD-EVENTS-AND-MUSEUMS.md`, "Invasions, later") and the fight engine (`docs/combat-spec.md`). Where this conflicts with either, they win until Nathan decides otherwise. **OPEN** marks what waits on Nathan; **SIM** marks what `scripts/combatSim.ts` settles before any content is seeded.*

**Decided (Nathan, 2026-11-27):** they are called **tears**. **Staff send every invasion**; there is no automatic schedule. Gatherers at the place **are not affected**. The realms are **Greek myth and the Welsh Otherworld**, twelve creatures between them (§7, roster approved). Invaders drop more and better than natives, and their rare gear has **no bad luck protection** (§6). An invader's best drops are **gear for other skills, better than its tier** (§6).

---

## 0. What an invasion is

Staff open a tear somewhere on an island and things from another world come through. Everyone who fights there draws from one shared horde. Kill enough of them before the tear closes and the place is held: everyone who helped is paid, and the Chronicle remembers it. Run out the clock and the tear closes on its own, the horde goes back with it, and nobody gets the closing reward.

It is the combat version of a skill event. A skill event is "this place pays more for a while, until the pool runs dry". An invasion is "this place is under attack, until the horde runs out".

**Scope:** creatures of level 1 to 24 (Taiar's band and Antura's). Later tiers bring worse things up to 100; the system is built so they are rows, not code (§9).

---

## 1. Lore

- **Not the Rift.** The Rift is a seam downward, where the light comes up. A tear is a seam *sideways*, into somewhere else. Nothing an invader says or carries names what lies under the Rift (CLAUDE.md §2 Talar). The light may draw them; that is as far as the text goes.
- **Not a Portal.** "Portal" is the Talar spell (`services/spells.ts`). Player-facing text says **tear**; code says `invasion`.
- **Every invasion comes from one realm.** A realm is a row: its name, a line of what is seen through the tear, its roster, and its drops. Realms come back; regulars learn their creatures, and the Bestiary fills over many invasions.
- **Two realms to start:** **the Bronze Shore** (Greek myth, without the gods) and **Annwn** (the Otherworld of the Welsh tales). Both are public domain. Twelve creatures between them, one every two levels from 2 to 24 (§7).
- **The Laranists have opinions.** Georome gets a few rare lines (`npc_rare_lines`) about tears: wrong about what they are, as Laranists are about everything, but in an interesting way.
- **Sources:** public-domain myth and literature, and worlds of Talaran's own. Never a renamed creature from a work under copyright. A licensed guest creature, with written permission and credit, is the one exception (**OPEN**: Nathan to ask Syrnia's owner).

---

## 2. What a player sees

1. **A warning** (if staff give one). A chat line some minutes before: *"The air over Verdale has begun to shimmer, like heat off a road in winter."* The Events panel shows it as coming, with a countdown and the realm's level range, never the realm. Staff choose the lead time, from none to a day ahead ("opens at eight tonight").
2. **The tear opens.** A second line names what came through: *"A tear has opened over Verdale. Bronze birds are coming out of it, and the hedges are full of their feathers."* The place gains a fighting spot for the length of the invasion (§3), shown in the location panel as the tear, with the horde's count: "The Tear over Verdale · 212 of 300 left · 1 h 04 min".
3. **Fighting it** is an ordinary fight: Fight, choose a creature, the same fight view, food, flee, death. Each kill takes one from the horde, and the result card says so: "88 of 300 driven back".
4. **Held.** The kill that takes the last one closes the tear. A chat line names the place and how many fought. Everyone with at least the event's minimum kills (default 5) gets the closing reward (§6) on a notice, the next time they look if they are away.
5. **Lost.** If the clock runs out first, the tear closes with the rest of the horde inside. One chat line; no closing reward; kills already made keep their XP and drops.
6. **Gatherers** at the place carry on exactly as before. The tear is a fighting spot beside them, nothing more.

---

## 3. How it is built on what exists

### The event

- **A new kind, `invasion`, in `world_events`.** It gets what the other kinds have: the countdown, the Events panel, the admin Events tab (extend, refill, end now), and history. `pool_total` / `pool_left` is the horde, counted in kills.
- **Staff send it; nothing else does.** The scheduler never picks `invasion` (as it never picks the merchant on its own). **Who may:** admins, and any moderator with a new permission, **`can_run_events`** (added to `STAFF_PERMISSIONS` in `lib/staffPermissions.ts`; Nathan, 2026-11-27, for an event moderator to come). It covers sending a tear and extending, refilling, or ending a live one; whether it later covers skill events and the merchant is Nathan's call. The admin Events tab gets a **Send a tear** card: realm, place, horde size, length, the XP bonus, the minimum kills for the closing reward, an optional warning lead time, and optionally a later opening time. The realm's own warning and opening lines fill in and can be rewritten before sending.
- **A tear sent for later** is a `world_events` row with `starts_at` in the future and a `warned_at`/`opened_at` pair, picked up by a database-driven sweep like the Crier's polls (`announced_open_at`), so a restart loses nothing. Never a bare `setTimeout` (CLAUDE.md §4 rule 15).
- **Where:** any place staff choose, except islets, roads, and the sea. **At most one live tear per island** (refused at send, like a second skill event for the same skill and place). The places with no fighting of their own make the best stage (Verdale, Lanaivale, Luxmere, Talador's square; Wendhaven, Farefield, Underway, Bidewater), but nothing forbids a tear at Eld Grove.
- **The realm's island fit is checked at send:** the card shows the roster's levels and warns (does not refuse) when they are far from the island's band.

### The fighting spot

- **Invaders are ordinary `creatures` rows** with a `realm_id` (nullable; null is native). So the Bestiary, `drop_table_entries` (`combat:<creature>`), `combat:derive`, the sim's `roster`, and Exploration's first-find records all work unchanged. `bestiary_all` **does not** count invaders (they come and go; a completionist could not finish without staff); they get feats of their own (§6).
- **When a tear opens, it creates a `fighting_spots` row** at its place (`kind: 'chosen'`, a new nullable `world_event_id`), with the creatures that fit the island and the realms sent (§7) in `fighting_spot_creatures`. **Chosen, not drawn**: a roster spans a band, and a combat 3 player must be able to pick the level 2 creature and leave the level 12 one to someone else. When the tear closes, the spot is set `is_active: false`, never deleted (a fight row points at it).
- **Starting a fight already refuses an inactive spot.** A fight *in progress* when the tear closes finishes the creature it is on, is paid, then ends, as a weapon break ends one. No half-paid kills.

### Taking from the horde

- **One unit per kill, inside the settle's own transaction**, by one conditional statement: `UPDATE world_events SET pool_left = pool_left - 1 WHERE id = ? AND pool_left > 0 AND ended_at IS NULL RETURNING pool_left`. A row back: the kill counts. None: the horde is gone, so the kill pays as an ordinary kill and the fight ends after it. A settle replays many swings at once, so this runs once per kill it settles, in order.
- **The kill that brings `pool_left` to 0 closes the event** in the same transaction (`ended_at`, `end_reason: 'held'`). Announcement, closing rewards, and the Chronicle deed run after commit (`afterCommit`). Two fighters on the last kill at once: the conditional update orders them; exactly one closes it. **race:check `invasion`**: many players on the last few units; exactly `pool_total` kills counted, the closing reward paid once per eligible player, never twice; shown to fail against a read-then-write version first.
- **Each player's kills are counted in `world_event_shares`** (built for Kindle), in the same transaction. That decides who gets the closing reward. `per_player_cap` stays null by default; staff may set one at send for a tear meant for newcomers.
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
| Its own common drop | about 1 kill in 4 to 6 | **about 1 in 2** |
| A useful good for another skill (ore, feathers, logs, hides, seeds) | rarely, and only some creatures | **every creature, about 1 in 4**, by the creature's character |
| Coin | some creatures, 1 in 4 | every creature that carries any, 1 in 3, and more of it |
| Trophy | about 1 in 300 or rarer | about 1 in 150 |
| Rare gear (below) | rare weapons 1 in 750 to 1,000 | **1 in 150**, no bad luck protection |

The "useful good" is chosen by the creature's character, so a tear helps the whole economy, not only fighters: the Afanc fells Lanai, the Myrmex digs Ambren Ore, the Stymphalian Bird sheds Feathers. **SIM** the totals: a 300-kill horde should bring a crowd a good evening's haul, not a week's supply of anything. Feathers are the one place to be generous (arrows have always wanted them).

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
  | Bench tool (bellows, plane) | the station multiplier in `processingTimer` (`lib/actionTimers.ts`: "a better tool under 1") | a slot item with its multiplier, as better bench tools already carry |
  | Foraging gloves | gloves today only open the prickly rows (`requiresGloves`, `services/foraging.ts`); they do not touch the timer | **a new column, `forage_speed_pct`**, read in `calculateForageTimer` after the knife; null on every made glove, so nothing else changes. The Gwiber-scale Gloves carry **0.02** (Nathan, 2026-11-27: gloves help speed "very slightly") and open the prickly rows like any gloves |
  | Hunting aids (the bow) | the bow's tier, as a gathering tool | `works_as_tier`, as above |

- **Numbers** (Nathan, 2026-11-27): where no made piece of the next tier exists yet, the drop is **about 1.5× the made piece of its own tier**, and the made next-tier piece is fitted around it later. **Pwca's Blackthorn 0.045** (the Lanai Staff is 0.03); **Teumessian Boots 0.08** (Leather Boots are 0.05). The rest are **SIM**.

### On holding the place

To everyone with at least the tear's minimum kills:

- **Tear-glass:** one untradeable item, the shard a tear leaves behind. What it does is still **OPEN** (a museum case, a feat counter, a crafting input). Untradeable so alts cannot farm and sell it. Until it has a use, the closing reward is the Chronicle line and the feats.
- **No gold.** Gold enters through attention (CLAUDE.md §8), and the kills already find coin.
- **The Chronicle:** deed kinds `invasion_held` and `invasion_lost` (`chronicle_deed_kinds` rows, `noteDeed`, ten verses each), naming the place, the realm, and the player with the most kills.
- **Feats** (category Combat): *Held the Line* (your first held tear), *Hold Ten*, *Hold Fifty*; *Between Worlds* (a kill of every invader).
- **Never Talers, never a Taler-bought advantage.** Paying and free players stand side by side at a tear.

---

## 7. The roster, levels 1 to 24

**Twelve creatures, one every two levels** (Nathan, 2026-11-27): six from each realm, alternating, three of each per island band. A tear on Taiar fields the six from 2 to 12; a tear on Antura the six from 14 to 24. Staff may send one realm alone (three creatures) or both through one tear (all six of the band). Across each band, every damage type is the weakness of two creatures. Profiles are hints for `combatSim.ts`, in the existing rosters' words.

None repeats a creature already in Talaran.

**The Bronze Shore** (Greek myth: Herodotus, Pausanias, Apollonius, Ovid, and Plutarch): labors and voyages, without the gods. Bronze, sun, salt, and the smell of a forge.
**Annwn** (the Welsh Otherworld: the Mabinogion and Welsh folklore): a hall where it is always evening, white hounds with red ears, lakes that are not the depth they look.

### On Taiar (2 to 12)

| Lvl | Creature | Realm | Character | Weak / resists | Rare gear (§6) |
|---|---|---|---|---|---|
| 2 | Myrmex | Bronze Shore | a dog-sized ant that digs for gold; tough shell, poor aim | crush / slash | **Myrmex Mandible Pick**: works as a T2 pick |
| 4 | Pwca | Annwn | a shape-shifting goblin that walks travelers off the road at night | slash / pierce | **Pwca's Blackthorn**: a walking staff faster than the Lanai Staff |
| 6 | Spartos | Bronze Shore | a soldier grown from a sown dragon's tooth; no fear, no flesh | crush / pierce | none |
| 8 | Gwyllgi | Annwn | the Dog of Darkness, a shadow mastiff with red eyes; quick, it harries | pierce / – | none |
| 10 | Stymphalian Bird | Bronze Shore | bronze-beaked, it sheds its feathers like darts | pierce / slash | none (feathers are its gift) |
| 12 | Afanc | Annwn | a lake beast like a huge beaver; drags people under, gnaws trees | slash / crush | **Afanc-tooth Hatchet**: works as a T2 hatchet |

### On Antura (14 to 24)

| Lvl | Creature | Realm | Character | Weak / resists | Rare gear (§6) |
|---|---|---|---|---|---|
| 14 | Khalkotauros | Bronze Shore | a bronze-hoofed bull that breathes a forge's heat; slow, heavy | pierce / crush | **Bull's-breath Bellows**: a smithy bench tool, faster smelting |
| 16 | Cŵn Annwn | Annwn | white hounds with red ears, hunting in a pack; accurate | slash / crush | none |
| 18 | Teumessian Fox | Bronze Shore | the fox fated never to be caught; very hard to hit, light | crush / pierce | **Teumessian Boots**: walk faster than any made boots of the tier |
| 20 | Gwiber | Annwn | a winged serpent of the Welsh hills; quick, venomous | slash / pierce | **Gwiber-scale Gloves**: foraging gloves, 2% quicker foraging |
| 22 | Crommyonian Sow | Bronze Shore | a wild sow the size of a cart that laid waste to a country | pierce / crush | none |
| 24 | Huntsman of Annwn | Annwn | one of the Otherworld king's riders (the king never comes), horn at his belt; a person, so coin | crush / pierce | **Huntsman's Bow**: a hunting bow that works as the next tier's |

Seven of the twelve carry rare gear: three on Taiar, four on Antura.

### What each drops (§6 rates)

| Creature | Its own (frequent) | For another skill (generous) |
|---|---|---|
| Myrmex | gold dust (sells; a crafting curio) | Ambren Ore |
| Pwca | a lantern-wick | Feathers (owls it rode off on) |
| Spartos | a dragon's tooth | coin, Rough Quartz |
| Gwyllgi | a black pelt | Leather Strips |
| Stymphalian Bird | Bronze Feather | Feathers, plenty |
| Afanc | Afanc hide | Lanai Logs it felled |
| Khalkotauros | a bronze hoof | Serph Ore, Charc |
| Cŵn Annwn | a red ear-tuft, always warm | a buckskin |
| Teumessian Fox | a russet brush | wild seeds it buried |
| Gwiber | Gwiber scale | Rough Garnet now and then |
| Crommyonian Sow | sow bristles | truffles, roots |
| Huntsman of Annwn | his horn (trophy) | coin, arrows, a Lit Garnet very rarely |

First ideas; every item must already exist or have a use before it ships (CLAUDE.md §8: nothing added without a real use).

Held back for later tiers: Talos the bronze giant, the Nemean Lion, and the Hydra; the Twrch Trwyth (a king turned boar, the first group boss once group fights exist); the Ellyll, the Harpy, the Empusa, and Gwrach y Rhibyn, kept as spares.

---

## 8. Balance

- **Every invader goes through `combatSim.ts roster`** against the ±15% XP-an-hour guardrail at its level (`docs/combat-spec.md` §8). `pnpm combat:derive` writes `xp_per_kill`. No hand-set XP.
- **Invaders are slightly tougher than natives of their level,** not easier: 90 to 100% of the grunt's XP an hour before the +25%.
- **XP budget:** a tear's extra XP is bounded by its horde (300 kills × 25% of a kill). At Taiar's levels that is about 2,000 XP across a crowd. **SIM** before shipping.
- **values:derive:** invader drops are generous on purpose, so check their gold value per kill against a native's; a tear must not become the best gold an hour in the game by a wide margin.
- **values:derive:** rare drops with no made source need prices from the made piece they beat (`OVERRIDES`), or the pawnbroker and the museum cannot place them.

---

## 9. Later tiers

The same rows carry the system to 100. A realm has a roster per island band, so the Bronze Shore can come back at T5 with Talos. Leaders grow into **bosses** once group fights exist (`docs/combat-spec.md` §9, "Bosses, later": rejoinable, not ended by one disconnect). Near 100 is where stranger worlds belong: Talaran's own, and cosmic horror (Lovecraft's earlier stories are public domain in the UK and EU, and in the US only for works published before 1931; check each one). Parked realms from the first draft, for later: Carroll's Wabe, Baum's desert edge, and two of Talaran's own, the Glasswold and the Drowned Bell.

---

## 10. Open questions for Nathan

1. **Tear-glass:** what it does, or drop it and let the Chronicle and feats be the closing reward.
2. **Syrnia guest creature,** if permission comes.

---

## 11. Build order

1. **Schema:** `realms`, `creatures.realm_id`, `fighting_spots.world_event_id`, `world_events.starts_at`/`warned_at`/`opened_at`/`min_kills`, `items.works_as_tier`, `items.forage_speed_pct`, the `can_run_events` permission. Fresh-database safe (`hasContent`).
2. **The kind:** Send a tear (admin), the sweep that warns and opens, the spot created and retired, held and lost, announcements, the Events panel.
3. **The fight hooks:** the pool take in settle, the tear's XP bonus, fights ending when it closes, `world_event_shares` counts. race:check `invasion`.
4. **Rewards:** closing notice, Chronicle deed kinds, feats.
5. **Gear hooks:** `works_as_tier` in `calculateTimer` (and the hunting bow's check), `forage_speed_pct` in `calculateForageTimer`.
6. **Content:** the Bronze Shore and Annwn, each a migration: realm, creatures, drops, rare gear, items with `island`, warning and opening lines. combatSim, combat:derive, values:derive.
7. **Manual page** (how tears work, never what drops: that is the Bestiary's), patch notes.

Each step ships and is proven on its own.

# Talaran Fishing — Build Spec (Skill #12)

*Spec v1 — 2026-08-07. Designed with Nathan; hand to Opus for build. Read CLAUDE.md §0 before building anything. This spec is the design authority; where it conflicts with an assumption, ask Nathan, do not improvise.*

---

## 0. What Fishing is

A gathering skill with two waters, one pool per water. The player casts into the pool and gets a weighted pick from every fish they are *eligible* for. Three forces shape the odds: **bait** (player's lever), **time-of-day windows**, and **real-world seasons**. Every catch rolls a **weight** for personal-best records. There is no minigame, no sub-zones, no player-owned structures.

Design identity vs. other gathering skills: Mining has vein discovery, Foraging has habitats + ??? discovery, Hunting has active/passive. Fishing's identity is **player agency over the drop table, plus time**.

---

## 1. Locations

Both already exist in `locations` (see `apps/server/src/db/seeds/03_locations.ts`):

- **Luxmere** (type `lake`, map 4,7) — freshwater. 7 species. The steady, knowable water: fully fishable year-round except one seasonal exclusive.
- **Dawncrest** (type `coast`, map 8,8) — saltwater. 11 species. The moody water: more variety, more windows, the seasonal migrants, the monster weights.

Fishing is started from the location like other gathering skills. One pool per location. **No sub-zones** (explicit decision; do not add shore/shallows/deep).

---

## 2. Time: windows and seasons

### 2.1 Daily windows (real time, server-authoritative, Eastern — same timezone authority as the chat daily reset)

| Window | Hours (ET) |
|---|---|
| dawn | 05:00–09:00 |
| day | 09:00–17:00 |
| dusk | 17:00–21:00 |
| night | 21:00–05:00 |

### 2.2 Seasons (real calendar, Northern hemisphere, meteorological)

| Season | Months |
|---|---|
| spring | Mar–May |
| summer | Jun–Aug |
| autumn | Sep–Nov |
| winter | Dec–Feb |

Implement one shared helper (new, small, reusable by every future skill — Farming and Foraging will layer onto it later):

```
getTimeWindow(): 'dawn' | 'day' | 'dusk' | 'night'
getSeason(): 'spring' | 'summer' | 'autumn' | 'winter'
```

Pure functions of the server clock in ET. No state, no cron. Window/season boundaries live as **named constants in one config block** (not DB rows).

---

## 3. The roster (18 species — final, Nathan-approved)

Weight ranges are in **pounds, two decimal places**. Real-species ranges are drawn from real-world angling records; **Opus: verify the real-species maxima against sources during the build** and adjust modestly if my figures are off. Invented species (marked ✦) use invented ranges.

### Luxmere — freshwater

| Lv | Fish | Window | Season | Bait | Min lb | Max lb |
|---|---|---|---|---|---|---|
| 1 | Tiddle ✦ | any | any | none | 0.05 | 0.60 |
| 2 | Brook Dace | day ↑ | any | grain | 0.10 | 1.80 |
| 3 | Perch | any | spring ↑ | grain | 0.20 | 6.60 |
| 4 | Burbot | night ↑ | winter ↑ | meat | 0.50 | 25.00 |
| 5 | Chalkarp ✦ | dawn ↑ | any | cheese | 1.00 | 60.00 |
| 7 | Pike | dusk ↑ | any | spawn | 1.00 | 55.00 |
| 8 | Frostgill ✦ | any | **winter only** | egg | 0.50 | 12.00 |

### Dawncrest — saltwater

| Lv | Fish | Window | Season | Bait | Min lb | Max lb |
|---|---|---|---|---|---|---|
| 1 | Whiting | day ↑ | any | meat | 0.20 | 7.00 |
| 2 | Black Bream | any | summer ↑ | grain | 0.30 | 6.50 |
| 3 | Dawn Sprat | **dawn only** | any | none | 0.05 | 0.40 |
| 4 | Garfish | dawn ↑ | **spring + summer only** | meat | 0.20 | 3.50 |
| 5 | John Dory | day ↑ | any | spawn | 0.50 | 12.00 |
| 6 | Gurnard | day ↑ | any | meat | 0.30 | 12.00 |
| 6 | Conger Eel | **night only** | any | meat | 2.00 | 133.00 |
| 7 | Duskfin ✦ | **dusk only** | any | egg | 0.80 | 18.00 |
| 8 | Wolffish | any | **autumn + winter only** | spawn | 1.00 | 52.00 |
| 9 | Stormer ✦ | any | **autumn only** | spawn | 3.00 | 70.00 |
| 9 | Sabreling ✦ | night ↑ | any | egg | 1.00 | 28.00 |

Legend: **↑** = favored (weight multiplier when the condition holds, still catchable otherwise). **Bold** = hard exclusive (ineligible outside the condition). "Bait" is the category that boosts the species; **bait is never required** — baitless casting always works on every fish.

Island note: Taiar spans levels 1–9 for fish; levels 10–12 are a known content plateau (grind known fish) until Island 2 begins at 13. Acknowledged, matches other skills.

---

## 4. Catch resolution

On each completed cast:

1. **Eligibility filter** on the location's species: `player fishing level ≥ required_level` AND (no exclusive window OR current window matches) AND (no exclusive seasons OR current season in list).
2. **Weight computation** per eligible species: `w = base_weight × baitMult × windowMult × seasonMult` where:
   - `baitMult = 2.5` if active bait category matches the species' bait, else 1
   - `windowMult = 2.0` if favored window matches now, else 1
   - `seasonMult = 2.0` if favored season matches now, else 1
   - `base_weight` is a per-species row (start every species at 100; Nathan tunes rarity by row later)
3. **Weighted pick** — reuse the exact pattern from `weightedPick` in `apps/server/src/services/foraging.ts`.
4. **Line snap (flavor tease):** BEFORE the pick, if the location contains at least one species the player is NOT yet high enough level for, roll a flat **5%** chance the cast ends in a snap instead: consume 1 bait (if baited), award **zero XP**, produce nothing, and show a snap message on the result card ("Something enormous takes the line, and the line does not survive the argument."). Zero XP is an anti-exploit requirement (see §11).
5. Otherwise: grant the fish item, roll its weight (§7), pay XP, consume 1 bait if baited, record discovery + firsts (§8).

---

## 5. Bait economy

**Five categories, ever: `grain`, `cheese`, `egg`, `spawn`, `meat`.** No new bait items exist. Existing items break down into a per-player bait pouch.

### 5.1 Bait values (DB rows — `bait_values` style table, Nathan-tunable)

| Item (existing) | Category | Bait per unit |
|---|---|---|
| Grain | grain | 1 |
| Wild Grain | grain | 1 |
| Cheese | cheese | 3 |
| Egg | egg | 4 |
| Frogspawn | spawn | 10 |
| Rabbit Meat | meat | 3 |
| Chicken Meat | meat | 3 |
| Venison | meat | 4 |
| Pork | meat | 4 |
| Boar Meat | meat | 4 |
| Beef | meat | 5 |
| Sloth Meat | meat | 5 |
| *(each raw fish)* | meat | *= its own `bait_value` row; tier 1–2 fish → 2, tier 3–4 → 3, lv 5–6 → 4, lv 7+ → 5* |

Frogspawn is deliberately the premium: rare Foraging drop, funds a whole predator session. **Opus: verify Frogspawn's current Foraging drop weight actually supports this role** (it must be obtainable at a non-miserable rate); flag to Nathan if not.

### 5.2 The pouch

New table `player_bait` (`player_id`, `category`, `amount`). Bait persists across sessions and actions — this is required, not optional (break down one Frogspawn, catch three fish, log off: 7 bait must remain).

### 5.3 Flow

- Starting a rod-fishing action shows a **dropdown of accepted bait items currently in inventory** plus current pouch balances per category; the player picks a category (or none).
- Selection **persists across repeating casts**: draws from the pouch until empty, then the action **continues baitless with a notice** rather than stopping (tedium rule).
- Items convert to pouch bait when committed. One bait consumed per completed catch and per line snap. Baited casts get **timer −15%** in addition to the weight skew.

### 5.4 Cut Bait (active Fishing action)

- Any raw fish + **Ambren Butchering Knife** (existing item; equipped per the butchering convention — Opus verify how Hunting checks the knife) → the fish's bait value added to the **meat** pouch.
- Flat **20 seconds** per fish. **Zero XP** (anti-exploit: net → cut → refish must not print XP; see §11). **Edit from Nathan: Can you explain to me why cutting bait doesn't give exp? I have no problem with it giving exp, as long as it's a bit lower on average than actually fishing exp. Also it should give a little bit of crafting experience as well.**
- This is also the launch-day sink for fish (nothing else consumes them until Cooking; acknowledged debt, §13).

---

## 6. Actions, gear, and who gets the XP

### 6.1 XP-to-the-verb (Husbandry retro §3 — explicit, no guessing)

| Action | Skill trained |
|---|---|
| Rod fishing | **Fishing** |
| Net fishing | **Fishing** |
| Cut bait | Fishing action, **0 XP** | Debated above! ^
| Forge Ambren Hook | **Smithing** |
| Assemble Ambren Fishing Rod | **Carpentry** |
| Build Fishing Net | **Carpentry** | **Nathan Edit: Shouldn't this give Crafting exp? Or does Carpentry make more sense? Actually to the fishing rod as well. Let's talk about it.**
| Line snap | **0 XP** |

### 6.2 Gear recipes (zero new component items)

- **Ambren Hook** — Smithing, forged from Ambren Ingot (Nathan Edit: This makes sense to me to give 2 hooks per ingot, as hooks are small. More would be realistic, but I don't want it to be too crazy forgiving.).
- **Ambren Fishing Rod** — Carpentry bench: **Lanai Tool Rod + Ambren Hook + Linen Thread ×2**. Covers all Taiar fishing (levels 1–12). Naming convention is by hook metal (Serph Fishing Rod arrives with Island 2 at 13; not built now). Equipped in **mainhand** like hatchet/knife (Opus: confirm equip-slot pattern in `services/foraging.ts` `TOOL_SLOT_COLUMN` and follow it).
- **Fishing Net** — Carpentry bench: **Lanai Planks + Linen Thread ×6**. Equipped/mainhand as the alternative tool.
- Rods and nets are **unbreakable in M1**. Durability (hook as the wear part, re-hooked at the bench) is a designed-but-deferred layer for the game-wide durability pass (§13).
- Because only one rod tier exists per island band by design, **there is no rod-tier timer bonus mechanic in Fishing at all** — the matching rod always arrives with its island. Timer curve is level + bait only.

### 6.3 Timers (fishing is deliberately slow)

Follow the shape of `calculateForageTimer` (`apps/server/src/services/foraging.ts`): base eases down 0.1s per level above the species' unlock, to a floor.

- **Rod:** base **70s**, floor **20s**, then bait −10% if baited. Noticeably slower than Woodcutting on purpose; does not scale as hard as Hunting.
- **Net:** base **150s**, floor **40s**. No bait influence. Yields **4–6 fish per haul** (uniform roll), drawn ONLY from eligible species with `required_level ≤ 4` at that location, exclusives still respected. Nets never catch the pool's upper tiers.
- **Opus verification task from Nathan:** before wiring timers, check how tool-tier/level timer boosts are implemented in the other skills **and whether they are actually working correctly**; report findings. Nathan Edit: Ideally every 2 levels you would shave -1 off any fishing timer. 20s is the MAXIMUM floor for any skill action though. Never go lower than that.

---

## 7. Weights and personal bests

- Roll on catch: **mean of two uniform rolls** between the species' min and max (triangular distribution — middle-weighted, true extremes possible but very rare). Round to **2 decimal places**. Store lb as numeric(8,2).
- **Weight is a catch-time event, never item state.** All fish of a species stack normally. The rolled weight appears on the catch result card and updates records; it exists nowhere else. (This rule prevents Fishing's version of the milk problem. Do not attach weight to inventory rows.)
- New table `player_fishing_records`: `player_id`, `species`, `heaviest`, `lightest`, timestamps. **Track both heaviest and lightest from day one** (two columns, free). Display can be heaviest-only for now; a homestead **Trophy Wall** (Carpentry furniture rendering record catches) is deferred (§13). New personal bests get their own result-card callout.
- Weights also power future fishing contests ("heaviest X between timestamps" is one query) — nothing to build now.

---

## 8. Discovery and firsts

- **??? discovery:** per-player, per-water, same pattern as Foraging's discovery tooltips (undiscovered species show `???` in the water's species list until first caught). Reuse the Foraging approach; a `player_fishing_discoveries` table mirroring `foraging` discoveries is fine.
- **First catches feed the existing firsts ledger** (`player_item_firsts` per-player, `item_firsts` server-wide) automatically, like every other item source. Confirmed by Nathan.

---

## 9. Items to create

18 raw fish (type `food`, subtype `raw_fish`, tier by level band, `level_required: 1`, stackable like all items) + **Ambren Hook**, **Ambren Fishing Rod**, **Fishing Net**. Fish descriptions should carry personality (field-guide flavor; the invented species especially). **Raw fish are not edible** — no heal value until Cooking.

Cooking forward-compatibility note (do not build): each species will get ONE cooked variant (per-species cooked is where healing tiers and personality live); there will be a single shared burnt item game-wide, not per-species. Nothing in Fishing's data should assume otherwise. The burnt item will just be called Burnt Fish.

---

## 10. Georemy, the tutorial NPC (Luxmere)

Follows the Geonsen/Georgic pattern: teaches the skill, gives the starter gear, quest with objective backfill.

**Quest: "The Luxmere Investigation"** (name tunable):
1. Talk to Georemy at Luxmere → receives **Ambren Fishing Rod** (starter; solves the first-thirty-minutes problem of needing Smithing + Carpentry before the first cast).
2. Catch a **Tiddle**.
3. Return to Georemy → small Fishing XP reward priced like Geonsen's.

### Voice (important — Nathan specifically wants this)

Georemy speaks like a certain famous river-monster-hunting angler, transposed to a medieval world: a weathered itinerant investigator who treats every fish rumor as a **case**. Style rules for all his dialogue:

- Frames fishing as detective work: witnesses, evidence, suspects, "my investigation." The Tiddle quest is presented, completely deadpan, as the first step in a much larger inquiry.
- Gravelly understatement and dramatic pacing. Short sentences. He has seen things.
- Total reverence for the fish. The monster is never the villain; it is a magnificent animal that is misunderstood. He always returns the big ones to the water.
- Self-serious about absurd subjects (delivering a line about a half-pound tadpole-fish with the gravity of a man describing a leviathan).
- Medieval-appropriate vocabulary: no modern gear or science terms. "Thirty years I have followed the waters of this island," etc.
- Original lines only — the style, never quotations from any real person.
- **Em dashes NEVER appear in player-facing text** (hard CLAUDE.md convention; applies to all dialogue, item descriptions, and result-card messages in this patch).

Example register (usable or replaceable):
> "They tell me something lives in this lake. Something old. I have spent thirty years listening to stories like that, and here is what I know: the stories are almost never true. Almost."
> "We begin, as every investigation begins, with the smallest witness. The Tiddle. Catch three. Look it in the eye. Then we will talk."

---

## 11. XP tuning (per docs/xp-rebalance.md — fishing is gathering, policy ×1.0)

Per the rate ladder, an action unlocking at level `u` targets `2000 × 1.10 × (1.33^(1/12))^(u−1)` xp/hr at unlock. With the 40s unlock-timer, per-catch XP: (Nathan Edit: I changed this to 70s as base fishing rod timer on Taiar because 40 was way too fast. Just update the below numbers accordingly.)

| Unlock lv | Target xp/hr | XP per catch (40s) |
|---|---|---|
| 1 | 2,200 | 24 |
| 2 | 2,253 | 25 |
| 3 | 2,307 | 26 |
| 4 | 2,362 | 26 |
| 5 | 2,419 | 27 |
| 6 | 2,477 | 28 |
| 7 | 2,537 | 28 |
| 8 | 2,598 | 29 |
| 9 | 2,660 | 30 |

XP is per-species (rows). Notes:

- Baited play runs ~18% over band (timer −15%); this is intended and priced by bait cost, same logic as Mining ores ×1.3. Windows/seasons shift *which* fish, not the rate, since same-level fish share the band.
- **Net XP:** total XP per haul must land **15–20% below rod xp/hr** at the same level. With a 150s haul of 4–6 low-tier fish, that means roughly 12–15 XP per netted fish; Opus computes exactly and verifies against the fastest-loop test below.
- **Fastest-loop audit (Husbandry retro §4 — do this before shipping):** compute best-case xp/hr for (a) baited rod at each unlock, (b) net + cut-everything-back-to-bait loop, (c) snap farming. (b) must not beat (a); (c) must yield zero. Cut bait and snaps paying 0 XP are the designed guarantees; verify nothing else leaks.

---

## 12. Data model summary

New tables: `fish_species` (roster: name/item link, location, required_level, window + exclusive flag, seasons csv + exclusive flag, bait_category, base_weight, min/max lb, xp), `bait_values`, `player_bait`, `player_fishing_records`, `player_fishing_discoveries`. Anything Nathan may tune is a row: species weights, bait values, XP. Window/season boundaries and multipliers (2.5 / 2.0 / 2.0 / −15% / 5% snap) are named constants in one block.

Migration conventions per CLAUDE.md: real timestamped filename, hand Nathan the complete file for `apps/server/src/db/migrations/`, no `migrate:make` command, type-check with the temporary tsconfig method.

Patch note obligations (balance-adjacent changes to existing content): Frogspawn gains a major sink and real value; Grain, Cheese, Egg, and all raw meats gain a bait sink; Linen Thread gains two recipes; Ambren Butchering Knife gains a use; Lanai Tool Rod gains a use.

---

## 13. Explicit debts (acknowledged, not built now)

1. **Cooking consumes fish** (next skill; per-species cooked items, one shared burnt item).
2. **Hook durability** — hook is the wear part; snaps chew durability; re-hook at the bench (rod + fresh hook). Joins the game-wide durability pass.
3. **Trophy Wall** — homestead Carpentry furniture displaying record catches (heaviest, and lightest for comedy).
4. **Boats / open water** — future zone type training Sailing + Fishing.
5. **Fishing contests** — heaviest-catch events; records table already supports it.
6. **Island 2** — Serph Fishing Rod, fish levels 13+, second wood-body tier at 25.
7. **Nettle cordage** — possible alternative net recipe someday; nettle's real destiny is Cooking.

## 14. Retro checklist compliance (Husbandry retro, answered)

1–3 *Boundaries:* touches Carpentry, Smithing, Farming, Husbandry, Hunting, Foraging (all as faucets/components; all faucets exist). Fish consumed by: cut bait (now), Cooking (debt §13.1). 4–5 *Physicality:* no container needed — weight is not item state, fish stack (§7); bait lives in the pouch, everything travels. 6–8 *Actions:* §6.1 table; terminal-loop audit in §11; tedium answered by persistent bait selection + repeating casts. 9–10 *Reversal:* genuinely N/A — Fishing commits the player to nothing permanent. 11 *Level 1 unaided:* Tiddle and Whiting are baitless-catchable; starter rod from Georemy removes the gear prerequisite. 12 *Content stop:* levels 10–12 plateau, acknowledged. 13–14 *Data:* §12.

## 15. Opus verification tasks (before/while building)

1. Read CLAUDE.md §0 and the result-card conventions (three branches) before writing code.
2. Check how tool-tier/level timer boosts are implemented in existing skills and whether they work correctly; report.
3. Verify Frogspawn's Foraging drop weight supports its premium-bait role.
4. Verify real-species weight maxima against real-world records; adjust modestly if needed.
5. Confirm the mainhand equip pattern for rod/net and the knife-check pattern for cut bait.
6. Full-path file references (`services/fishing.ts` vs `routes/fishing.ts`) in all handoffs; duplicate-name handoff files disambiguate in the filename itself.
7. No em dashes anywhere in player-facing text.

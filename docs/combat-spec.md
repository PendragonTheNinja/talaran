# Talaran Combat — Build Spec (Melee, Defense, Constitution)

*Spec v4 — 2026-10-04. Supersedes v3 (2026-10-01) and v2 (2026-09-16, which incorporated Foozard's review of Draft 1). v4 replaces the four combat skills with three (§2). The simulator (`scripts/combatSim.ts`, §16) measured every number here. Read CLAUDE.md §0 before building anything. This spec is the design authority; where it conflicts with an assumption, ask Nathan, do not improvise.*

**Status: design decisions are settled except where marked SIM. Every SIM item is settled by `scripts/combatSim.ts` (§16), then written back here, before any content is seeded.**

---

## 0. What Combat is

Three skills, no menu to pick what you train. Every swing trains Melee; how the blows land on you decides between Defense and Constitution. One enemy ladder, one fight loop, two rolls per swing. Unattended fighting is possible well below your level and deliberately worse than paying attention.

Design identity vs. the gathering skills: combat is the only skill where the thing you are working on fights back, so the levers are **what you carry into the fight** and **when you eat**. Everything else is settled before you engage.

It is meant to be punishing and rewarding: done properly it pays, and mistakes cost the kit you were wearing.

---

## 1. Goals

1. All weapon forms stay worth using for the whole game.
2. Unattended fighting works at a level gap that is not embarrassing. Syrnia drops you to roughly a quarter of your combat level. Target is ~25% below.
3. Fighting at or near your level is where the loot is, and it costs attention.

The AFK band is a single constant and can move in a patch. It is **not** to be chased tighter than ~25% before real players have fought at parity. Thirty alpha testers will answer it better than more simulation.

**AFK band, defined:** how far below your combat level an enemy must be for you to survive, on average, a set stretch without eating (the acceptance tables use 20 minutes).

---

## 2. The skills and how they train

**Melee, Defense, Constitution** (decided 2026-10-04). No skill in Talaran is capped at 100, these included.

- **Melee** is how you fight. Every form trains it. It feeds aim and max hit, and it gates weapons.
- **Defense** and **Constitution** are your body. They feed defence and max HP, and Defense gates armour. They belong to no weapon: when Archery and Talar arrive as fighting skills of their own, Defense and Constitution carry across.

### Why three, not four

v2 and v3 had Attack and Strength, routed by weapon form. They never earned separate jobs: the level term had to read their combined XP (or the higher of the two) so no form was penalised, at which point the split changed nothing in a fight, and one-hand had to train both in full to reach its gates. Defense and Constitution do have separate jobs, and §2's ledger lets a player steer between them through gear. So: one fighting skill, two body skills. (Considered and set aside: a single Melee skill with HP hidden inside it, which hid where HP comes from; and gating gear on combat level with one shared XP pool, which kept XP to one skill's worth but left the individual skills as decoration.)

### What a kill pays

All of it **when the kill ends**; a fight you flee or die in pays nothing. The enemy's XP is a row value: the band at its level, over the time a level-matched kill takes.

- **Melee**: the enemy's XP, whatever the form.
- **The defensive side**: twice that (`DEFENSIVE_XP_MULTIPLE`), split by the ledger below.

### The ledger: Defense or Constitution

- **Defense** takes the share your armour *absorbed*. Each absorbed point counts twice (`ABSORBED_XP_WEIGHT`): absorption is always small beside the damage that lands, and unweighted a shield-bearer got only about a third.
- **Constitution** takes the share that *landed*.
- **Misses count for neither.** (Counting them gave Defense 60–90% at every level, because weak enemies miss a lot.) Nothing absorbed or landed: an even split.

Measured fighting an even foe: **about 50/50 with a shield, about one third Defense without**. The levers, none of them a menu:

- **Take the shield off**, or fight two-handed: two thirds goes to Constitution.
- **Fight something that hurts**: more lands, more Constitution.
- **Fight something weaker, or wear heavier armour**: more Defense.

### Pacing: each skill levels like a normal skill

`combatSim.ts pacing`; a gatherer on the band reaches 13 in 22h, 25 in 73h, 50 in 360h, 100 in 2,581h.

| Form | Melee | Defense | Constitution |
|---|---|---|---|
| One-hand + shield | 13 in 22h, 100 in 2,581h | same | same |
| Two-hand / dual | 13 in 22h, 100 in 2,700h | 13 in 32h, 100 in 3,438h | 13 in 17h, 100 in 2,216h |

A shield-bearer levels all three exactly like a gatherer, so armour and weapons arrive together. Without a shield, Defense trails and Constitution leads: new armour comes later, and more HP sooner. The fighter's own choice.

**Why this pays more than one skill's worth an hour.** A skill that gates gear at the clean rungs must level at a normal pace, or its gear arrives late. Melee gates weapons and Defense gates armour, so combat cannot pay less than about two skills' worth and keep 13 / 25 / 37…; Constitution rides along because it shares Defense's pool. Counting the cooking, gathering and smithing an hour of fighting consumes (§10, §13), combat earns about 1.5 skills' worth per hour of total effort, close to v2's ×1.5 intent.

**Total level.** Tally licences count **non-combat skills only** (`totalLevel` in `services/tally.ts` gets a `type <> 'combat'` filter when combat ships), so fighting is not a shortcut to tally boards. The `total_level` and `breadth` feats **do** count combat skills; their thresholds may rise as skills are added. **Highscores**: combat level, and each of Melee, Defense and Constitution.

### Combat level

**The average of your fighting skill, Defense and Constitution**, rounded. When Archery and Talar exist, the fighting skill is the best of Melee, Archery and Talar. It is the number creatures are matched against, and a highscore. `combatSim.ts levels`: every form reaches each combat level within a few percent of the same hours; a two-hander at combat 100 has Melee 100, Defense 93, Constitution 106.

### What the levels do

Weapon stats carry roughly twice what levels do (§4).

- **Melee**: the level term in aim and in max hit; gates weapons.
- **Defense**: the level term in defence; gates armour (§7).
- **Constitution**: max HP, `100 + 10 × (Constitution − 1)`.

History: v3 compared three ways for four skills to feed the level terms (Attack for aim and Strength for max hit; a combined offense level; each form's own skill). The first left a lifelong two-hander at 56% of a one-hander's kill rate at combat 100; the third left the balanced form 18–21% behind. Merging the two into Melee ends the question.

### Weapon gates: the clean rungs

| Tier | Every form |
|---|---|
| T1 Ambren | Melee 1 |
| T2 Serph | Melee 13 |
| T3 Azulyss | Melee 25 |
| … | the rung |
| T9 | Melee 100 |

All nine weapons of a tier share the gate. The trade between forms is only what it should be: safer with a shield, about 20% fewer kills per hour (§6).

---

## 3. Damage types

Orthogonal to form. **Pierce, slash, crush.** They drive enemy weakness only:

| Enemy stance | Multiplier |
|---|---|
| Weak | 1.25 |
| Neutral | 1.00 |
| Resistant | 0.75 |

Because XP routing no longer depends on type, no enemy ladder has to be duplicated per type. A player picks a type to suit the enemy in front of them, not to protect their XP rate.

---

## 4. Accuracy

```
aim      = weapon aim    + level term (variant A, B or C, §2)
defence  = total armour  + Defense level term
hit%     = 50 + (aim - defence) / 10        capped 1 and 99
```

One roll. A level-matched fight is a coin flip, and the divisor of 10 means ten points of gear buys one percentage point.

| | Tier 1 | Tier 9 |
|---|---|---|
| Weapon aim (slash) | 100 | 400 |
| Armour, late set with shield | 80 | 380 |
| Level term | 20 at level 1 | 20 + 1.9 × (level − 1) |
| Enemy aim and defence | 100 at level 1 | 600 at level 100 |

Formulas: weapon aim `type aim + 37.5 × (tier - 1)` (type aim 110 / 100 / 90, §6); armour `80 + 37.5 × (tier - 1)` for the late set (§7); level `20 + 1.9 × (level - 1)`; enemy `100 + 5.05 × (level - 1)`. v2's §4 table read 400 for tier 9 armour; that was a typo for the §7 pattern.

Gear carries roughly twice what levels do. A good weapon should be worth chasing.

**Known property.** Player defence grows about 4.6 points per level once tier progression is counted; enemy accuracy grows 5.05. The net differential is ~0.45 points per level of gap, so at a 15-level gap the advantage value is about 0.7. **Advantage is therefore near level-invariant**, and no transformation of it can carry level scaling. This killed the Draft 1 proposal to ramp the AFK band by scaling advantage. Whether player defence should grow faster is open question B (§12).

---

## 5. Damage

```
advantage = (aim - defence) / 10
low       = 25 + advantage         clamped 0 to 100
high      = 75 + advantage         clamped 0 to 100
damage    = rng(low, high)% of max hit
max hit   = weapon power + 0.5 × level term × swing seconds / 3.0
```

Second roll. Two per swing, total.

At parity that is rng(25,75)%, averaging half your max hit. At +25 advantage it becomes rng(50,100)%. At −35 it is rng(0,40)%, which is what lets weak enemies chip at you instead of whiffing dramatically.

**Max hit is the weapon's power plus a smaller level term**, read from the offense level (§2): for a trained player the level is about a third of max hit, the same weapon-first split aim has. The level term is **scaled by swing time**, so levels add the same damage per second to every form; a flat amount per swing put dual about 15% ahead of everything else.

Adding a level term made every fight shorter, so **enemy HP is refitted** to keep the §6 anchors (an even fight lasts about 40 seconds at combat 1 and 99 at combat 100): base **174**, growth **×1.3809 per tier** on the current model (v2: 140 and ×1.33). `combatSim.ts fit` checks it.

Aim moves hit chance and the damage band together, so it raises your average hit without touching your ceiling.

### Flat absorption

Armour also subtracts a flat amount from every hit that lands. The constant is **0.4**.

This is the single lever that sets the AFK band, and 0.4 is chosen rather than maximal on purpose:

| Constant | C50 AFK | C100 AFK | C100 parity survival | Food/hr at parity |
|---|---|---|---|---|
| 0.0 | 58% below | 40% below | 3.6 min | 37 |
| **0.4** | **26%** | **24%** | **5.7 min** | **23** |
| 0.6 | 12% | 15% | 7.9 min | 17 |
| 0.8 | 0% | 7% | 12.3 min | 11 |
| 1.0 | 0% | 0% | 21.8 min | 6 |

**The tradeoff this table shows is the important part: you cannot sharpen the AFK gap without dulling parity.** They are the same constant. At 0.6 the band closes nicely, but parity survival more than doubles and food burn halves, so fighting at your own level becomes safer and cheaper, which is backwards. At 1.0 you can idle at parity indefinitely.

**TREAT THIS TABLE AS THE ACCEPTANCE TEST.** The absorption term is applied to armour on a damage scale, not to raw armour points: tier 9 armour totals 380 against an enemy max hit of 52, so subtracting any large fraction of raw points would zero out all incoming damage. The likely form is `absorbed = 0.4 × armour / 10`, about 15 off a 52-point hit at tier 9.

**Fitted (2026-10-01, `combatSim.ts acceptance`): `absorbed = 0.4 × armour / 11`**, with 3.0s grunts. Measured against the 0.4 row: C50 AFK 26%, C100 AFK 20–22%, parity survival 5.7 min, food 23/hr.

**What the original sim actually used**, recovered by `combatSim.ts calibrate`, which reproduces every §11 cell: a one-hand Spear, weapon and late armour with shield at the player's combat tier, aim level 41 / 86, defence level 36 / 81, and **grunts swinging every 4.0 seconds**, not 3.0. At 4.0s the table reproduces at `armour / 15`. §8's 3.0s was written after the numbers were measured. **Decided: grunts stay at 3.0s**, with the divisor refitted to 11 so the 0.4 row still holds.

**Refitted on the current model (2026-10-04): `absorbed = 0.4 × armour / 15`.** Players now carry more Defense and Constitution than the v2 kit, so armour absorbs a little less to keep the targets. One-hand, `combatSim.ts forms`: combat 100 gives AFK 23% below, 5.8 min parity survival, 23 food/hr (targets 24%, 5.7, 23); combat 50 gives AFK 31% (target 26%). Absorption is rounded at random (0.4 absorbs one point 40% of the time), so early armour keeps its average instead of rounding to nothing.

---

## 6. Weapons

Nine per metal tier: three damage types across three forms. Nine metal tiers, so 81 weapons. **The first release ships tier 1 (Ambren) only** (§15).

Tier rungs, and the level bands they own (`docs/xp-rebalance.md` is the authority; 37, not 38):

| Tier | Rung | Band |
|---|---|---|
| 1 | 1 | 1–12 |
| 2 | 13 | 13–24 |
| 3 | 25 | 25–36 |
| 4 | 37 | 37–49 |
| 5 | 50 | 50–61 |
| 6 | 62 | 62–74 |
| 7 | 75 | 75–86 |
| 8 | 87 | 87–99 |
| 9 | 100 | 100 |

An item attainable at or between two rungs belongs to the lower tier specifically.

### The nine

| | Dual wield (2.4s) | One-hand and shield (3.0s) | Two-hand (3.6s) |
|---|---|---|---|
| **Pierce** (aim 110) | Daggers | Spear | Atgeir |
| **Slash** (aim 100) | Hand Axes | Scimitar | Greatsword |
| **Blunt** (aim 90) | War Hammers | Mace | Maul |

The dual-wield names are plural because the pair is **one inventory item**, not two. Nothing occupies the offhand slot separately. Gates are in §2.

### Weapon power: compensated, so the three types are equal at parity (DECIDED)

v2 left open whether to pay blunt for its worse aim. **Decided: compensate with power.** At parity, on equal power, pierce came out 8.3% ahead of blunt, because aim helps both the hit roll and the damage band.

**The shieldless forms carry 1.25× the v2 budget (DECIDED 2026-10-01).** At the v2 budget, two-hand and dual killed only ~7% faster than one-hand while taking 40–60% more damage, so the shield was simply the better deal. At 1.25× they earn about 21–25% more kills per hour for about 12% more food per kill and a worse AFK band: the active player's form. One-hand stays the safe one. Tier 1 power:

| Form | Pierce | Slash | Blunt |
|---|---|---|---|
| Dual (2.4s) | 41 | 43 | 44 |
| 1H + shield (3.0s) | 37 | 38 | 40 |
| Two-hand (3.6s) | 61 | 64 | 66 |

Scaling per tier: aim `+37.5`, power `× 1.221`.

Why this one: it gives each type a character beyond its stance. Accurate weapons hold up better fighting **up**, where hit chance is scarce; heavy weapons do better fighting **down**, where every swing lands anyway. Measured on the v2 formulas: at −25 advantage pierce out-damages blunt by about 8%; at +25 blunt is ahead by about 2.5%. Small enough that enemy stance (±25%) still dominates, real enough to be a reason to own two weapons. And the war hammer hits harder than the spear, which reads right.

**Where the slash numbers come from.** Draft 1's six weapons resolve to two clean power-per-second budgets: one-handers at 12.5, two-handers at 14.25. Two-handers get about 14% more for giving up the shield. 3.0s × 12.5 = 38, the Draft 1 mace; 3.6s × 14.25 = 51, the Draft 1 greatsword. Dual wield drops the shield, so it takes the 14.25 budget: 2.4s × 14.25 = 34.

**Speed is a property of the form, not the weapon.** Under absolute-difference accuracy, a 12-point aim spread moves hit chance by 1.2 points and cannot offset any damage spread, so accuracy could never balance against damage; speed can, because it multiplies into damage per second directly.

**Power growth is deliberately slower than enemy HP growth** (×1.221 against ×1.33 per tier). Level-matched fights lengthen from about 40 seconds at combat 1 to about 99 at combat 100, and that is the only thing making it pay to fight above your level. When weapons scale at the same rate as enemy HP, XP per hour comes out flat in enemy level no matter what the reward table says.

### Smithing recipes

Smithing makes every weapon and armour piece. Pattern: the Ambren Pickaxe (2 ingots, Lanai Tool Rod, Leather Strips).

| Weapon | Ingots | Also |
|---|---|---|
| Daggers | 2 | Leather Strips |
| Scimitar | 2 | Leather Strips |
| Greatsword | 4 | Leather Strips |
| Hand Axes | 2 | Lanai Tool Rod, Leather Strips |
| Mace | 2 | Lanai Tool Rod, Leather Strips |
| War Hammers | 3 | Lanai Tool Rod, Leather Strips |
| Maul | 4 | Lanai Tool Rod, Leather Strips |
| Spear | 1 | Lanai Tool Rod, Leather Strips |
| Atgeir | 2 | Lanai Tool Rod, Leather Strips |

Quantities of rods and strips, timers and XP are set at seeding by the finished-goods policy (CLAUDE.md §8). **Supply is checked before seeding**: the ingots and leather that breakage (§13) demands per hour of fighting must be something Mining, smelting and Husbandry can produce. SIM.

### The shield problem, noted not solved

Two of the three forms drop the shield, which leaves the offhand attached only to the balanced form. Worth watching once armour sets are in; not worth pre-solving.

---

## 7. Armour

Six slots, two sets per metal tier. **Defense gates armour, one new piece per Defense level** (decided 2026-10-04): within a tier, piece *k* in the ladder order below needs Defense = the tier's rung + *k*. Ambren runs Defense 1 to 12, Serph 13 to 24, tier 9 from 100. Tiers with a 13-level band have one spare level.

| Defense in the tier | +0 | +1 | +2 | +3 | +4 | +5 | +6 | +7 | +8 | +9 | +10 | +11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Piece | Bracers | Boots | Coif | Buckler | Chausses | Hauberk | Gauntlets | Sabatons | Helm | Kite shield | Greaves | Cuirass |

The early set completes at +5, the late set at +11. Shieldless fighters get nothing new at the two shield steps. `ARMOUR_LADDER` and `armourForDefense` in `lib/combatMath.ts` hold this; seeding reads the order from there.

| Slot | Early | Points | Ingots | Late | Points | Ingots |
|---|---|---|---|---|---|---|
| Head | Coif | 8 | 2 | Helm | 12 | 3 |
| Chest | Hauberk | 14 | 4 | Cuirass | 20 | 6 |
| Legs | Chausses | 10 | 3 | Greaves | 15 | 4 |
| Hands | Bracers | 6 | 1 | Gauntlets | 9 | 2 |
| Feet | Boots | 6 | 1 | Sabatons | 9 | 2 |
| Offhand | Buckler | 10 | 2 | Kite shield | 15 | 5 |
| **Total** | | **54** | **13** | | **80** | **22** |

Every piece scales with its tier the way the late set does: points × `(1 + 37.5 × (tier - 1) / 80)`, so the tier 9 late set totals 380. Dropping the shield costs about 19% of total armour.

**Leather:** metal armour eats leather, which has five tiers against metal's nine: leather 1 covers metals 1–2, leather 2 covers 3–4, and so on up. **No piece takes more than one Leather**, and only the biggest take one (Hauberk, Cuirass, Kite shield). Every other piece takes Leather Strips.

**Slots are shared with tools and travel gear, on purpose.** Leather Boots (travel speed) and combat boots share the feet slot; Foraging Gloves and gauntlets share hands; the saw, basket and pail share the offhand. You change into armour before a fight.

---

## 8. Enemies and health

```
max HP        = 100 + 10 × (Constitution - 1)
enemy aim     = enemy defence = 100 + 5.05 × (level - 1)
enemy max hit = 6 + 0.46 × level
enemy HP      = 174 at level 1, × 1.3809 per tier (refitted, §5)
enemy swing   = 3.0 seconds for grunts
```

This HP formula is current. `docs/cooking-outline.md` §4 anchored food on "about 250 at Constitution 24", which predates this spec; the formula above gives 330. Food heal values are checked against it in the simulator, not the other way round.

**Grunts swing at 3.0s, the same as the balanced player form** (confirmed 2026-10-01; §5 explains why the v2 tables were measured at 4.0s). **Bosses vary for flavour**, hand-set per boss.

### Enemies are rows, each with a character

Nouns are rows (CLAUDE.md §2). An enemy row holds **level**, a **stance per damage type**, its **location**, its loot on the existing `drop_table_entries`, and a **profile** (decided 2026-10-04): nullable multipliers on accuracy, defence, hitting power and HP around its level's baseline, and its own swing time. Null is the baseline grunt. `CreatureProfile` and `enemyStats` in `lib/combatMath.ts`.

**XP per kill comes from the creature's level** (decided 2026-10-04): the band at that level, over the time a level-matched kill against the baseline grunt takes, written at seeding by the simulator, never hand-set. A row may carry a small **XP multiplier** for its type. **XP per hour then follows from how fast the player kills it**: a creature you cut down quickly is better XP, a tough one is worse XP and perhaps a safer AFK or better loot. Loot is designed per creature, not derived from its stats.

**The guardrail: within a level, XP per hour stays within about ±15% of the grunt's.** `combatSim.ts creatures` measures every profile and flags any outside it; a flagged creature gets a gentler profile or a small XP multiplier. Example profiles (`combatSim.ts creatures 50`, one-hand + shield, level-matched):

| Level 50 creature | Kill | XP/hr | HP lost/hr | AFK band |
|---|---|---|---|---|
| Grunt (baseline) | 52s | 100% | 5,410 | 31% below |
| Hare: fragile, nervy | 39s | 127%, flagged | 5,840 | 32% below |
| Wolf: accurate, quick (2.4s), light | 47s | 109% | 6,220 | 34% below |
| Boar: heavy, clumsy | 57s | 92% | 6,620 | 40% below |
| Tortoise: hard to hurt, slow (3.6s) | 69s | 78%, flagged | 3,760 | 22% below |

Each island wants a mix: quick XP that is hard to leave (wolf), slow but safe to leave (tortoise), costly in food but rich in loot (boar).

Fights are **one player, one enemy**. Group boss fights are a later possibility; nothing in the enemy rows should prevent them.

### Fighting spots

A **fighting spot** is a place with a pool of enemies. **You do not choose your opponent.** A spot with one creature gives you that creature every time; a mixed spot draws each next enemy at random, weighted per row (Eld Grove might hold forest creatures of level 8 to 12). Mixed spots make AFK riskier, since the occasional high roll is what kills you, which is the point of them. Each island gets several spots so players have real options: the choice is the place, not the creature.

**Taiar hosts enemies of level 1–12**, matching Ambren (§15). **AFK on Taiar is deliberately thin** (`combatSim.ts afk 1 12`): with Ambren the only metal, a shield-bearer can leave level 3s at combat 12 and level 7s at combat 30, and a shieldless fighter cannot leave even a level 1 until about combat 18. That is the one-metal island, not the formulas: with Serph gear a combat 15 player leaves level 5s. A higher starting HP (200) would have fixed it, and was rejected (2026-10-01): a combat 1 player should not be able to idle level 1s. 

### Taiar's roster (decided with Nathan 2026-10-05)

Twelve creatures, six spots. Towns host no fighting except the docks at Talador; roads are for travel only; Verdale, Lanaivale, Luxmere and the Talar Rift have none (the Rift waits for the Talar update). No bosses yet: the Hodag is an ordinary creature. Profiles are first drafts, checked by `combatSim.ts roster` (one-hand + shield at the creature's level, hitting its weakness):

| Spot | Creature | Lvl | Character | Weak / resists | XP/hr | AFK from |
|---|---|---|---|---|---|---|
| Talador (the docks) | Dock Rat | 1 | scrappy baseline, off the ships | slash / – | 100% | combat 10 |
| Novita | Granary Rat | 2 | fat and slow: the first safe AFK | slash / pierce | 93% | combat 9 |
| Novita | Jackalope | 3 | quick, hard to land a heavy blow on | slash / crush | 109% | combat 12 |
| Novita | Feral Dog | 4 | quick, accurate, light; harries the flocks | pierce / – | 109% | combat 14 |
| Dawncrest | Shore Crab | 4 | shell: hard to hurt, slow, safe | crush / slash | 86% | combat 11 |
| Dawncrest | Wrecker | 6 | a person with a cudgel, no armour; lures ships onto the rocks | pierce / – | 100% | combat 22 |
| Origrund | Sidehill Gouger | 6 | heavy, clumsy, a thick hump | pierce / crush | 93% | combat 27 |
| Origrund, Grundagr | Jumper | 8 | claim-jumper in mail: hard to hurt, slow | crush / slash | 86% | combat 19 |
| Eld Grove | Grey Wolf | 8 | pack hunter: quick, accurate, thick fur | slash / crush | 108% | combat 24 |
| Grundagr | Knocker | 9 | mine spirit: small, stony, evasive | crush / pierce | 111% | combat 28 |
| Eld Grove | Agropelter | 10 | hurls branches from the canopy | pierce / – | 113% | combat 28 |
| Eld Grove | Hodag | 12 | horned, spined back, heavy | crush / slash | 86% | combat 40 |

Mixed spots draw at random: Novita (Granary Rat, Jackalope, Feral Dog), Dawncrest (Crab, Wrecker), Origrund (Gouger, Jumper), Grundagr (Jumper, Knocker), Eld Grove (Wolf, Agropelter, Hodag). The Jumper lives in two spots, so a spot holds a weighted pool of creatures rather than a creature holding a spot.

Each damage type is the weakness of four creatures (slash: both rats, Jackalope, Wolf; pierce: Dog, Wrecker, Gouger, Agropelter; crush: Crab, Jumper, Knocker, Hodag). The wrong weapon costs 5–30% of XP per hour. Jumpers drop coins and, now and then, a sack of stolen Ambren Ore. Loot for the rest is still to design. A combat tutor would need a new Geo- name: Geothro is Husbandry's stockman.

### Loot (in progress with Nathan, 2026-10-09)

Decided so far:

- **Every drop has a real use** (a recipe, farming, smithing, salvage, a quest), now or named for later. Trophies are keepsakes (trophy slot, museum) and do not count as a use.
- **No Bones, meat or hides from combat**: Bones stay Hunting's, and meat and hides are Hunting's and Husbandry's.
- **Rates:** commons about 1 in 5 to 1 in 10 by creature; trophies rarer than Hunting's 1 in 300; some creatures drop little or nothing (Dock Rat, Shore Crab).
- **People carry coins:** Wreckers and Jumpers drop coins on top of the normal gold-find, and combat's gold-find runs a little more often than other skills'.
- **Jumpers drop their own mine's ore:** a Sack of Ambren Ore at Origrund, a Sack of Burgh Ore at Grundagr, so drop tables are keyed by spot as well as creature.
- **Wreckers** rarely drop a Locked Rusty Chest or Amber (both from the sea).
- **Knockers reveal veins**, as in folklore: a Knocker kill at Grundagr, rarely (1 in 100 or rarer), opens a Burgh vein as a Granite find would, if none is open. Mining stays the main way to find veins.
- **One rare weapon per damage type per island, each in a different form, never of its dropper's weakness** (farm with one type, earn another). About 1 in 1,500 to 1 in 2,000. Taiar: **Hodag Horn** (pierce, two-hand; Hodag weak to crush), **Wrecker's Cutlass** (slash, one-hand; Wrecker weak to pierce), **Gouger's Legbone** (crush, two-hand club; Gouger weak to pierce). Strength against the smithed weapons: open (§12).
- **More useful drops (2026-10-09):** Jumpers drop **Charc** (raided from the smelters; Charc is smelting's bottleneck); Wreckers an **Ambren Tinderbox** now and then (they lit false fires); Knockers **Dense Burgh Ore**, about 1 in 100; Granary Rats **Wild Grain** as well as Grain.
- **Other skills' materials are allowed as random combat drops**, so long as combat never out-produces the main source per hour spent: feathers stay mainly Trapping's and the chickens', linen mainly Foraging's. Seeding checks each such drop's per-hour yield against its main source's.
- **Rare weapons are as strong as the next tier's smithed weapon of their form**, gated at the dropping creature's level, and far more durable. On Taiar that makes each the best of its type by about 26% more kills per hour; once Serph exists it is Serph's equal that rarely breaks, worth carrying to Melee 25 (`combatSim.ts`, 2026-10-09).
- **Spot weights favour the lower-level creature:** Novita Granary Rat 45 / Jackalope 35 / Feral Dog 20; Dawncrest Shore Crab 65 / Wrecker 35; Origrund Sidehill Gouger 60 / Jumper 40; Grundagr Jumper 70 / Knocker 30; Eld Grove Grey Wolf 50 / Agropelter 35 / Hodag 15. At Grundagr a 1-in-100 Knocker vein comes about once in 330 kills.
- **The Bestiary is its own panel, like Feats**, opened from the fight screen (the creature you are fighting), from a Bestiary page in the Manual, and from the mobile drawer; not the top bar, which already has twelve entries. It is per player, which the Manual is not. Unlocks by kills: **1** name, picture, description, level, where it lives (and a little Exploration XP); **10** weaknesses and resistances; **50** common and uncommon drops; **250** the full drop list, rare weapon included, never the exact chances; **1,000** a line of lore and a mastery mark.

---

## 9. The fight loop

**The player always swings first, at t=0.** The enemy's first swing lands at one full swing interval. If the target dies before then it never swings at all. Averaging damage per hour hides this completely, and it is most of the reason the unattended gap sits as close to parity as it does.

```
player inputs:   weapon aim, weapon power, form speed,
                 total armour, max HP,
                 Melee / Defense / Constitution levels
enemy inputs:    aim, defence, max hit, HP, swing speed, damage type stances

loop:
  t = min(next player swing, next enemy swing)
  attacker rolls hit% ; rolls the band (always, for the ledger),
  on a hit applies absorption and damage
  repeat until enemy HP <= 0 or player HP <= 0

per kill:  kill time, damage taken, damage prevented, number of enemy swings
per hour:  cycle = kill time + 10s engage delay
```

The **10 second engage delay** between kills stands in for finding and closing on the next one. Without it, killing weak things quickly pays better XP per hour than fighting at your level, and everyone farms rats.

### How a fight runs on the server

- A fight is a `player_actions` row (§5 of CLAUDE.md applies in full, including the new-action checklist). Kill follows kill until you stop, flee, die, run out of usable gear, or disconnect.
- **Swings are caught up on read.** The fight stores its state and the time it was last settled; anything that reads it (the tick, an eat, a flee) first resolves every swing due up to now, in order. Same principle as husbandry's clocks: no state lives only in a timer, so a restart loses nothing. The tick's job is to settle fights and push the swings to the client.
- **Eating heals immediately.** The fight is settled up to the moment of the request, then the food applies. If the killing blow came first, the eat is refused: you are already dead.
- The **fight log** shows the food you carry as icons at the top; a tap eats one.
- **Fleeing** is allowed at any time. The fight ends, you keep the HP you have, and the kill in progress pays nothing. It is how a player gets out of an accidental fight with something far above them. Travel already cancels any action, so travel is also a flee.
- **Bot checks fire between kills only**, never mid-swing.

### Disconnecting

Combat is the one skill that does **not** carry on while you are gone, by default. When your last connection drops, you flee at that moment (settled to the disconnect time): no XP for the kill in progress, HP kept. A lost connection must not cost a player their kit.

A setting, `combat_continue_offline` in `player_settings`, default off, lets a player opt in to fighting on through a disconnect, under the normal 30-minute absence rule.

**Bosses, later:** a long group fight against a boss will need to be rejoinable rather than ended by one player's disconnect. Not pre-solved; noted so the boss design starts from it.

---

## 10. Food and the one decision

Eating is free and instant. It costs no swing and takes no time.

**Food is the only way to heal.** There is no regeneration between kills or out of combat. Respawning after death restores full HP.

Two proposals to change eating were considered and **both rejected**: eating costing your next swing, and an eat time per dish measured in swings. Neither ships. Do not reintroduce either without asking.

### The known consequence, recorded so nobody rediscovers it

A fight has exactly one decision in it: **when to eat**. Everything else is settled before you engage, when you pick your form, your damage type and your target. With several minutes of slack at parity, even that decision is easy.

And because eating is free, composite dishes were expected to dominate: more heal per item, one slot instead of five. **Corrected 2026-10-04:** the pack has no slot limit and every item stacks, so a stack of fish is one slot too. Dishes compete on **HP per minute of cooking** (and the gathering behind them), and there direct cooking holds its own: Cooked Sabreling heals 30 in 30s (1.0 HP/s at Cooking 9), Morel Omelette 66 in 55s (1.2 HP/s at Cooking 12). A composite's real advantage is fewer taps mid-fight.

Both are accepted as-is. They are structural rather than broken.

### What fighting costs in food (measured 2026-10-04, `combatSim.ts gap`)

HP lost per hour on Taiar, Ambren gear:

| Combat | Even foe (shield / no shield) | ~25% below | Level 1 foe |
|---|---|---|---|
| 3 | 1,870 / 2,010 | 1,650 / 1,770 | 1,470 / 1,580 |
| 6 | 1,640 / 2,360 | 1,460 / 2,140 | 850 / 1,400 |
| 12 | 2,040 / 2,660 | 1,490 / 2,050 | 400 / 750 |

In cooking time, at the best dish for a cook of the same level: an hour of even fighting needs about **55 minutes of cooking at combat 3**, falling to **about 30 minutes at combat 12** (one-hand; shieldless forms about a third more), before the fishing and gathering behind the ingredients. Fighting below your level roughly halves it. This is the intended loop (fighting feeds Cooking), and the reason combat's extra XP is fair (§2 Pacing). The early levels are the expensive ones, and that is accepted (§12).

### No auto-eat, no auto-retreat, by design

Nobody idles a fight at their own level for long: at parity you have minutes. Fighting well below your level is where unattended play works, and that gap is the AFK band (§1).

---

## 11. What the numbers do

**These tables are from the v2 unabsorbed model and are superseded.** `combatSim.ts forms` and `afk` give the current model's numbers; §16 regenerates these tables once the open items in §12 are closed.

**Combat 50, tier 5 kit, 440 max HP, food heals about 198**

| Foe | Below | You hit | They hit | Kill time | Damage/kill | Unattended |
|---|---|---|---|---|---|---|
| 50 | 0% | 51% | 53% | 61.8s | 117 | 4 min |
| 45 | 10% | 54% | 50% | 49.4s | 78 | 6 min |
| 40 | 20% | 56% | 47% | 40.0s | 51 | 7 min |
| 35 | 30% | 59% | 45% | 32.3s | 33 | 10 min |
| 30 | 40% | 61% | 42% | 26.3s | 21 | 13 min |
| 25 | 50% | 64% | 40% | 21.6s | 13 | 18 min |
| 20 | 60% | 66% | 37% | 17.6s | 8 | 26 min |

**Combat 100, tier 9 kit, 790 max HP, food heals about 356**

| Foe | Below | You hit | They hit | Kill time | Damage/kill | Unattended |
|---|---|---|---|---|---|---|
| 100 | 0% | 49% | 55% | 99.2s | 385 | 4 min |
| 90 | 10% | 54% | 50% | 64.1s | 183 | 5 min |
| 80 | 20% | 59% | 45% | 42.0s | 85 | 8 min |
| 70 | 30% | 64% | 40% | 27.8s | 38 | 13 min |
| 60 | 40% | 69% | 35% | 18.6s | 16 | 23 min |
| 50 | 50% | 74% | 30% | 12.5s | 6 | 47 min |
| 40 | 60% | 79% | 25% | 8.6s | 2 | 112 min |

v2's XP paragraph (one skill's rate × 1.5, shared four ways) is superseded by §2 Pacing: each combat skill levels at a normal skill's pace.

---

## 12. Open questions

**SIM, settled by the simulator before seeding:**

1. ~~Reproduce the §5 absorption table; record the kit it assumed.~~ Done (§5).
2. ~~Variant A, B or C for the level terms (§2).~~ B.
3. ~~The level term's weights in aim and max hit.~~ §5.
4. ~~Armour gate levels.~~ One piece per Defense level (§7).
5. Food per hour at parity against the real heal values of Taiar's cooked food.
6. Durability numbers (§13) and the ingot and leather supply they demand.
7. Regenerated §11 tables.

**B. Should player defence grow faster than enemy accuracy?** Foozard's corollary. **Set aside 2026-10-04:** creatures carry their own accuracy and power (§8), so how hard a creature is to avoid is decided per creature, not by a global growth curve. Reopen only if playtesting shows fighting below your level feels too safe or too risky across the board.

### Deferred to playtesting, deliberately

- Whether fighting above your level should be rewarded beyond better loot.
- Tightening the AFK band below ~25%.

### Settled, recorded so it is not reopened

- **Speed by form**, three values, not nine.
- **Three skills: Melee, Defense, Constitution** (§2). Each levels at a normal skill's pace, so **weapon gates are the clean rungs** (Melee) and armour is **one piece per Defense level** (§7).
- **Combat level** is the average of the fighting skill, Defense and Constitution (§2).
- **Tally licences count non-combat skills only; feats and highscores count them** (§2).
- **Armour wears two random pieces per kill**; the weapon wears every kill (§13).
- **Weapon power compensated** across damage types, and **×1.25 for the shieldless forms** (§6).
- **Grunt swing 3.0s**, bosses hand-set.
- **Defense takes what armour absorbed, Constitution what landed, misses count for neither**; XP paid at the end of the kill, nothing for a fled or lost fight.
- **No skill caps**; combat level keeps counting.
- **Guaranteed use count** for durability, counted in **kills** (§13).
- **A third roll per swing**, if one ever earns its place, does *not* go in the advantage multiplier. §4 explains why that spot is dead.
- **Eating is free.** Food is the only heal. No auto-eat, no auto-retreat, no regen.
- **New fighters are not softened**: at combat 1 an even fight costs a meal every 3–4 minutes, and that is fine (2026-10-04).
- **Creatures have profiles; XP per kill comes from the level (plus a small per-type multiplier); XP per hour follows kill speed and stays within ±15% of the level's grunt** (§8).
- **Disconnect = flee** by default (§9).
- **Absorption at 0.4**, with the §5 table as the acceptance test; fitted as `0.4 × armour / 15` on the current model.
- **Grunt swing 3.0s**, kept after the sim showed the v2 tables used 4.0s.
- **The nine weapons and their names** (§6).

---

## 13. Breakage and durability

Every weapon, armour piece and tool in the game breaks eventually, including rare drops. Combat ships with breakage for weapons and armour; it is retrofitted to existing tools in a later patch (after every tool has a craft path that does not need itself, CLAUDE.md §2).

A flat per-use break chance means a brand new piece can shatter on first use. Instead, each item has a **guaranteed use count**, tracked **per player, per item name**. Items stack, so the counter cannot live on the item or on copies.

Hold ten Ambren Maces and have never fought: Ambren Mace, for your account, has a guaranteed count. At zero it stays at zero and the break roll starts applying. When one breaks, the counter resets to full and the next one is safe again for that many uses.

- **Counted in kills.** A fled or lost fight does not count.
- **The weapon wears every kill. Armour wears two pieces per kill, chosen at random** among the pieces you wear (`ARMOUR_PIECES_WORN_PER_KILL`, decided 2026-10-04). With six pieces on, each wears about one kill in three, so armour lasts about three times as long as a weapon. Only a piece that wears rolls to break.
- **When something breaks**, the fight log says so in a line of flavour text, the kill completes, and the fight **does not restart** until you equip a replacement.
- **Tunable without a deploy.** A per-tier row holds the guaranteed kills and the break chance after them; nullable per-item override columns let a single item differ. Editable from the admin panel, like the world event settings.
- **Smithed gear sits at the low end of its tier.** Drops you grind a creature for last longer. Starting point for smithed tier 1: about 200 kills (roughly three hours at parity), then 1% per kill. SIM, against supply.

**Supply, measured against live Mining (2026-10-04).** Live `resource_nodes`: Granite swings 15–20s, the vein roll is **out of 1,000** (`vein_discovery_chance` 10 = 1% a swing on Granite, 5 = 0.5% on the ore nodes), and a vein's size comes from **the node it was found on**: 50–100 ore from Granite, 8–20 from an ore node. One open vein per ore per location, shared by everyone. A solo miner finding one Ambren and one Burgh vein from Granite, mining both and smelting: about 3 hours for 150 ingots, **about 50 ingots an hour of work, 1.2 minutes each**, plus 2 Charc per smelt.

**That is best case.** It assumes the vein is there to be found and the finder mines it out. A vein already open at that location blocks a new find of the same ore, and an announced vein is mined by whoever turns up, so real supply depends on how many people mine and fight. No formula gives that; the market will.

Demand at the starting numbers (about 300 uses before a break, 65 kills an hour): a weapon wears every kill and lasts about 4.6 hours of fighting; armour wears two random pieces per kill and lasts about three times as long. **About 2 ingots per hour of fighting, under 3 minutes of mining and smelting**, plus a minute or two at the anvil. Weapons and tools are where breakage is felt; armour is the slow drain. Durability starts here and is tuned from the admin table once testers show how fast gear actually goes.

---

## 14. Death and rare drops

Death drops **everything carried and worn, including the mount**, where you fell. You keep your **gold** and your **trophy**. You respawn at **Talador** with full HP.

The pile is yours alone for **15 minutes**: you can pick it up as soon as you get back there, and nobody else can see it. After 15 minutes it is public. After a week it is swept like any other ground item (CLAUDE.md §4 rule 15). The death pile is a variant of the existing ground-item system, not a second system.

Open liquid containers have no inventory row and stay with the player (CLAUDE.md §2 Liquids).

**A between-realm** where the dead choose where to respawn is a fun idea, parked in `docs/IDEAS.md`.

### Rare drops

**A boss weak to one damage type drops a weapon of a different type.** Foozard's. Smith a weapon, kill the boss, farm the grunts with what it dropped.

**Drops should be distinct items, not another spear.** Enemies from different cultures drop their own weapons and armour: unique names, looks and stats, more durable than the smithed equivalent (§13).

---

## 15. Scope of the first release

**Ambren only.** Taiar has the first metal and nothing above it; the second island brings Serph. The first release is:

- Melee, Defense and Constitution (a migration turns the seeded Attack, Strength, Defense and Constitution rows into these three), combat level, the fight loop, death, durability;
- nine Ambren weapons and two Ambren armour sets (twelve pieces);
- Taiar enemies of level 1–12.

**Talar** (magic, the second bar beside HP) is out of scope; it follows combat.

### What combat unblocks

- **78 `heal_amount` values** on cooked food, stored and read by nothing.
- **The HP bar**, currently hardcoded at 100/100 in the equipment panel.
- **The four combat skills**, seeded but not implemented.

---

## 16. The simulator

`apps/server/src/lib/combatMath.ts` holds every combat formula as pure functions. `apps/server/src/scripts/combatSim.ts` runs fights on it. The game imports the same module, so the simulator and the live fight can never drift apart.

Done: reproduce the §5 table → compare variants A, B, C → level weights → pacing → three skills → Defense share and armour ladder → refit absorption and enemy HP → food against Taiar's dishes. Next: durability and supply (waiting on live mining numbers) → regenerate §11 → question B. `lib/tiers.ts` holds the rung ladder for both.

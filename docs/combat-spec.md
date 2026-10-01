# Talaran Combat — Build Spec (Skills #14–17)

*Spec v3 — 2026-10-01. Supersedes v2 (2026-09-16), which incorporated Foozard's review of Draft 1. v3 records the decisions from Nathan's 2026-10-01 pass and marks what the simulator must settle before anything is seeded. Read CLAUDE.md §0 before building anything. This spec is the design authority; where it conflicts with an assumption, ask Nathan, do not improvise.*

**Status: design decisions are settled except where marked SIM. Every SIM item is settled by `scripts/combatSim.ts` (§16), then written back here, before any content is seeded.**

---

## 0. What Combat is

Four skills, no menu to pick what you train. The weapon in your hand decides it. One enemy ladder, one fight loop, two rolls per swing. Unattended fighting is possible well below your level and deliberately worse than paying attention.

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

## 2. The four skills and how they train

**Attack, Strength, Defense, Constitution.** No skill in Talaran is capped at 100, these included.

### Offensive half: routed by weapon FORM

This replaces Draft 1's damage-type routing, which is dead. Type-based routing required an enemy favourable to each damage type, at every level, with matching XP and loot, forever, or specialising quietly cost you. Form-based routing needs **one enemy ladder instead of three**.

| Form | Speed | Trains |
|---|---|---|
| Dual wield | 2.4s | Attack |
| One-hand and shield | 3.0s | Attack and Strength, half each |
| Two-hand | 3.6s | Strength |

### Defensive half: routed by the damage ledger

The defensive half splits on what happened to incoming damage:

- **Defense** takes the share your armour *absorbed*.
- **Constitution** takes the share that *landed*.
- **Misses count for neither.** (Decided 2026-10-01 after `combatSim.ts ledger`: counting misses for Defense gave Defense 60–90% of the defensive half at every level, because weak enemies miss a lot, and left no way to train Constitution on purpose.)

Same XP either way, so the choice is distribution, paid for in food and risk. Measured split, shield kit fighting an even foe: about 50/50 at combat 12, 50 and 100. The levers, none of them a menu:

- **Take the shield off**, or fight two-handed: about two thirds goes to Constitution.
- **Fight something that hurts**: more lands, more Constitution.
- **Fight something weaker, or wear heavier armour**: more Defense.

The first few combat levels lean to Defense (about 76% at combat 3), because armour absorbs most of a level 1 creature's small hits. It evens out by about combat 10.

### Payment

A kill's XP is split **half offensive, half defensive**, and all of it is paid **when the kill ends**. A fight you flee or die in pays nothing.

### Combat level

Not an average. The **total XP of all four** run through the normal level curve, so it reads as the level you would be if combat were a single skill. Uncapped, like every skill: with all four at 100 it reads about 120. Four skills splitting one skill's worth of XP per hour means the individual numbers always look low next to a woodcutter's; combat level is the honest comparison.

### What the levels do (SIM: choose A, B or C)

Weapon stats carry roughly twice what levels do (§4). Levels are mainly about **which tier you can equip**. The open question is which level feeds the smaller, level-driven part of aim and max hit, because a one-form player never trains the other offensive skill:

| Variant | Aim reads | Max hit reads | Problem it has or solves |
|---|---|---|---|
| **A. As v2 wrote it** | Attack | Strength | Two-handers never train Attack, dual-wielders never train Strength. Under v2 weights a lifelong two-hander does 87% of the damage they should at combat 25 and 46% at combat 100. |
| **B. Offense level** | offense level | offense level | Offense level is a *derived number*, not a skill: Attack XP + Strength XP through the curve, exactly as combat level is built. Every form earns the same offense level per hour. Attack and Strength then matter for gates only. |
| **C. Own form's skill** | the skill(s) the held form trains | same | Most literal to "the weapon decides". Switching forms late starts the new form's skill from scratch. |

The simulator runs all three side by side (damage per hour, AFK band and food per hour, per form, at combat 12 / 25 / 50 / 100). Whichever wins, the skill descriptions in `skills` are rewritten by migration to say what the skill actually does.

### Weapon gates: by the curve, so every form opens a tier at the same combat level

v2 gated a form on the skill it trains at the tier's rung, and the balanced form on both at half. Because the curve is steep, half the level is far less than half the XP, so the one-hander reached each tier about a third of the way up the ladder sooner (T9 at combat 71 against 113) and held a weapon two tiers better than a two-hander of the same combat level. That made it both safer **and** faster. **Dead.**

The gate is now the skill level a one-form player **of that form** has when their combat level reaches the rung. All three damage types in a form share the gate.

| Tier | Combat | Two-hand (Strength) | Dual (Attack) | One-hand + shield (Attack and Strength) |
|---|---|---|---|---|
| T1 Ambren | 1 | 1 | 1 | 1 / 1 |
| T2 Serph | 13 | 8 | 8 | 5 / 5 |
| T3 Azulyss | 25 | 18 | 18 | 13 / 13 |
| T4 | 37 | 28 | 28 | 21 / 21 |
| T5 Midrath | 50 | 40 | 40 | 32 / 32 |
| T6 | 62 | 51 | 51 | 42 / 42 |
| T7 Ghaal | 75 | 63 | 63 | 53 / 53 |
| T8 Runafax | 87 | 74 | 74 | 63 / 63 |
| T9 | 100 | 86 | 86 | 74 / 74 |

Derived from the XP curve (half of combat XP into one skill; a quarter each into two), never hand-typed into content. The trade between the forms is then only what it should be: the one-hander is safer (shield) and kills slower (12.5 against 14.25 max hit per second).

**Armour gates** follow the same idea against **Defense** (§7). Defense's share of the defensive half varies with what you fight, so its gate levels come from the simulator's measured Defense share. SIM.

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
max hit   = weapon power + level term        (SIM: weights)
```

Second roll. Two per swing, total.

At parity that is rng(25,75)%, averaging half your max hit. At +25 advantage it becomes rng(50,100)%. At −35 it is rng(0,40)%, which is what lets weak enemies chip at you instead of whiffing dramatically.

**Max hit is the weapon's power plus a smaller level term**, the same roughly 2:1 split aim uses: the weapon is the stronger half, the level the weaker. Which level depends on the variant (§2). The weights are tuned in the simulator. SIM.

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

v2 left open whether to pay blunt for its worse aim. **Decided: compensate with power.** At parity, on equal power, pierce came out 8.3% ahead of blunt, because aim helps both the hit roll and the damage band. Tier 1 power:

| Form | Pierce | Slash | Blunt |
|---|---|---|---|
| Dual (2.4s) | 33 | 34 | 35 |
| 1H + shield (3.0s) | 37 | 38 | 40 |
| Two-hand (3.6s) | 49 | 51 | 53 |

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

Six slots, two sets per metal tier. The early set is reachable partway up the tier, the late set at the top. **Defense gates armour** (levels SIM, §2).

| Slot | Early | Points | Ingots | Late | Points | Ingots |
|---|---|---|---|---|---|---|
| Head | Coif | 8 | 2 | Helm | 12 | 3 |
| Chest | Hauberk | 14 | 4 | Cuirass | 20 | 6 |
| Legs | Chausses | 10 | 3 | Greaves | 15 | 4 |
| Hands | Bracers | 6 | 1 | Gauntlets | 9 | 2 |
| Feet | Boots | 6 | 1 | Sabatons | 9 | 2 |
| Offhand | Buckler | 10 | 2 | Kite shield | 15 | 5 |
| **Total** | | **54** | **13** | | **80** | **22** |

Late set scaling: `80 + 37.5 × (tier - 1)`, so tier 9 totals 380. Dropping the shield costs about 19% of total armour.

**Leather:** metal armour eats leather, which has five tiers against metal's nine: leather 1 covers metals 1–2, leather 2 covers 3–4, and so on up. **No piece takes more than one Leather**, and only the biggest take one (Hauberk, Cuirass, Kite shield). Every other piece takes Leather Strips.

**Slots are shared with tools and travel gear, on purpose.** Leather Boots (travel speed) and combat boots share the feet slot; Foraging Gloves and gauntlets share hands; the saw, basket and pail share the offhand. You change into armour before a fight.

---

## 8. Enemies and health

```
max HP        = 100 + 10 × (Constitution - 1)
enemy aim     = enemy defence = 100 + 5.05 × (level - 1)
enemy max hit = 6 + 0.46 × level
enemy HP      = 140 at level 1, × 1.33 per tier
enemy swing   = 3.0 seconds for grunts
```

This HP formula is current. `docs/cooking-outline.md` §4 anchored food on "about 250 at Constitution 24", which predates this spec; the formula above gives 330. Food heal values are checked against it in the simulator, not the other way round.

**Grunts swing at 3.0s, the same as the balanced player form** (confirmed 2026-10-01; §5 explains why the v2 tables were measured at 4.0s). **Bosses vary for flavour**, hand-set per boss.

### Enemies are rows

Nouns are rows (CLAUDE.md §2). An enemy row holds **level**, a **stance per damage type**, its **location**, and its loot on the existing `drop_table_entries`. Aim, defence, max hit and HP are **computed in code from level** by the formulas above; nullable override columns let a boss be hand-set (swing speed, HP, max hit). Combat kills find gold like any active skill (`GOLD_FIND_ACTIONS`).

Fights are **one player, one enemy**. Group boss fights are a later possibility; nothing in the enemy rows should prevent them.

### Fighting spots

A **fighting spot** is a place with a pool of enemies. **You do not choose your opponent.** A spot with one creature gives you that creature every time; a mixed spot draws each next enemy at random, weighted per row (Eld Grove might hold forest creatures of level 8 to 12). Mixed spots make AFK riskier, since the occasional high roll is what kills you, which is the point of them. Each island gets several spots so players have real options: the choice is the place, not the creature.

**Taiar hosts enemies of level 1–12**, matching Ambren (§15). The creature roster is still to be designed; the simulator uses generic grunts by level until then.

---

## 9. The fight loop

**The player always swings first, at t=0.** The enemy's first swing lands at one full swing interval. If the target dies before then it never swings at all. Averaging damage per hour hides this completely, and it is most of the reason the unattended gap sits as close to parity as it does.

```
player inputs:   weapon aim, weapon power, form speed,
                 total armour, max HP,
                 Attack / Strength / Defense / Constitution levels
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

And because eating is free, **composite dishes dominate outright**: more heal per item, one inventory slot instead of five, and no downside.

Both are accepted as-is. They are structural rather than broken.

### No auto-eat, no auto-retreat, by design

Nobody idles a fight at their own level for long: at parity you have minutes. Fighting well below your level is where unattended play works, and that gap is the AFK band (§1).

---

## 11. What the numbers do

**These tables are from the v2 unabsorbed model and are superseded by the simulator's output.** They are kept as the shape of the curve until §16 regenerates them under absorption 0.4 and the chosen variant.

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

XP per kill is set so a level-matched fight pays a normal skill's rate × 1.5. Combat 1 to 100 works out near 2,000 hours (the law's ~2,920 for one skill, ÷ 1.5); one skill to 100 as a one-form specialist near 4,000.

---

## 12. Open questions

**SIM, settled by the simulator before seeding:**

1. ~~Reproduce the §5 absorption table; record the kit it assumed.~~ Done (§5).
2. Variant A, B or C for the level terms (§2).
3. The level term's weights in aim and max hit (gear ≈ 2× level).
4. Armour gate levels from Defense's share (§2, §7). The share is measured (§2): about half at parity with a shield.
5. Food per hour at parity against the real heal values of Taiar's cooked food.
6. Durability numbers (§13) and the ingot and leather supply they demand.
7. Regenerated §11 tables.

**B. Should player defence grow faster than enemy accuracy?** Foozard's corollary. Advantage is near level-invariant (§4), which is why the Draft 1 AFK ramp did nothing. Widening the growth gap would make players progressively harder to hit as they level. Tested in the simulator as one more variable, after items 1–3; not decided.

### Deferred to playtesting, deliberately

- Whether fighting above your level should be rewarded beyond better loot.
- Tightening the AFK band below ~25%.

### Settled, recorded so it is not reopened

- **XP routing by form, not damage type.**
- **Speed by form**, three values, not nine.
- **Weapon gates by the curve**, so every form opens a tier at the same combat level (§2).
- **Weapon power compensated** across damage types (§6).
- **Grunt swing 3.0s**, bosses hand-set.
- **Defense takes what armour absorbed, Constitution what landed, misses count for neither**; XP paid at the end of the kill, nothing for a fled or lost fight.
- **No skill caps**; combat level keeps counting.
- **Guaranteed use count** for durability, counted in **kills** (§13).
- **A third roll per swing**, if one ever earns its place, does *not* go in the advantage multiplier. §4 explains why that spot is dead.
- **Eating is free.** Food is the only heal. No auto-eat, no auto-retreat, no regen.
- **Disconnect = flee** by default (§9).
- **Absorption at 0.4**, with the §5 table as the acceptance test; fitted as `0.4 × armour / 11`.
- **Grunt swing 3.0s**, kept after the sim showed the v2 tables used 4.0s.
- **The nine weapons and their names** (§6).

---

## 13. Breakage and durability

Every weapon, armour piece and tool in the game breaks eventually, including rare drops. Combat ships with breakage for weapons and armour; it is retrofitted to existing tools in a later patch (after every tool has a craft path that does not need itself, CLAUDE.md §2).

A flat per-use break chance means a brand new piece can shatter on first use. Instead, each item has a **guaranteed use count**, tracked **per player, per item name**. Items stack, so the counter cannot live on the item or on copies.

Hold ten Ambren Maces and have never fought: Ambren Mace, for your account, has a guaranteed count. Every kill ticks down the counter of everything you are wielding and wearing. At zero it stays at zero and the per-kill break roll starts applying. When one breaks, the counter resets to full and the next one is safe again for that many kills.

- **Counted in kills.** A fled or lost fight does not count.
- **When something breaks**, the fight log says so in a line of flavour text, the kill completes, and the fight **does not restart** until you equip a replacement.
- **Tunable without a deploy.** A per-tier row holds the guaranteed kills and the break chance after them; nullable per-item override columns let a single item differ. Editable from the admin panel, like the world event settings.
- **Smithed gear sits at the low end of its tier.** Drops you grind a creature for last longer. Starting point for smithed tier 1: about 200 kills (roughly three hours at parity), then 1% per kill. SIM, against supply.

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

- the four skills, combat level, the fight loop, death, durability;
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

Order of work: reproduce the §5 table → compare variants A, B, C → tune the level weights → Defense share and armour gates → food, durability, supply → regenerate §11 → question B.

# Talaran Combat — Build Spec (Skills #14–17)

*Spec v2 — 2026-09-16. Supersedes "Talaran Combat Review Draft 1". Incorporates Foozard's review and the follow-up exchange. Read CLAUDE.md §0 before building anything. This spec is the design authority; where it conflicts with an assumption, ask Nathan, do not improvise.*

**Status: two items open (§12), one of them a balance question rather than a blocker. Everything else is settled and buildable.**

---

## 0. What Combat is

Four skills, no menu to pick what you train. The weapon in your hand decides it. One enemy ladder, one fight loop, two rolls per swing. Unattended fighting is possible well below your level and deliberately worse than paying attention.

Design identity vs. the gathering skills: combat is the only skill where the thing you are working on fights back, so the levers are **what you carry into the fight** and **when you eat**. Everything else is settled before you engage.

---

## 1. Goals

1. All weapon forms stay worth using for the whole game.
2. Unattended fighting works at a level gap that is not embarrassing. Syrnia drops you to roughly a quarter of your combat level. Target is ~25% below.
3. Fighting at or near your level is where the loot is, and it costs attention.

The AFK band is a single constant and can move in a patch. It is **not** to be chased tighter than ~25% before real players have fought at parity. Thirty alpha testers will answer it better than more simulation.

---

## 2. The four skills and how they train

**Attack, Strength, Defense, Constitution.**

### Offensive half: routed by weapon FORM

This replaces Draft 1's damage-type routing, which is dead. Type-based routing required an enemy favourable to each damage type, at every level, with matching XP and loot, forever, or specialising quietly cost you. Form-based routing needs **one enemy ladder instead of three**.

| Form | Speed | Trains |
|---|---|---|
| Dual wield | 2.4s | Attack |
| One-hand and shield | 3.0s | Attack and Strength, half each |
| Two-hand | 3.6s | Strength |

Weapons are gated on the skill they train, at the level of the tier's rung, so you can always wield the tier you trained toward. The balanced form is gated on both at half the requirement.

### Defensive half: routed by the damage ledger

The defensive half splits on what happened to incoming damage:

- **Defense** takes the share that was *prevented* — missed or absorbed.
- **Constitution** takes the share that *landed*.

Fight something that barely touches you and you train Defense. Fight something that hurts and you train Constitution. Same XP either way, so the choice is distribution, paid for in food and risk.

### Combat level

Not an average. The **total XP of all four** run through the normal level curve, so it reads as the level you would be if combat were a single skill. Four skills splitting one skill's worth of XP per hour means the individual numbers always look low next to a woodcutter's; combat level is the honest comparison.

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
aim      = weapon accuracy + attack level contribution
defence  = total armour     + defense level contribution
hit%     = 50 + (aim - defence) / 10        capped 1 and 99
```

One roll. A level-matched fight is a coin flip, and the divisor of 10 means ten points of gear buys one percentage point.

| | Tier 1 | Tier 9 |
|---|---|---|
| Weapon aim, or armour defence | 100 | 400 |
| Level contribution | 20 at level 1 | 180 at level 86 |
| Enemy aim and defence | 100 at level 1 | 600 at level 100 |

Formulas: gear `100 + 37.5 × (tier - 1)`, level `20 + 1.9 × (level - 1)`, enemy `100 + 5.05 × (level - 1)`.

Gear carries roughly twice what levels do. A good weapon should be worth chasing.

**Known property, and the root of the open Q4 (§12).** Player defence grows about 4.6 points per level once tier progression is counted; enemy accuracy grows 5.05. The net differential is ~0.45 points per level of gap, so at a 15-level gap the advantage value is about 0.7. **Advantage is therefore near level-invariant**, and no transformation of it can carry level scaling. This killed the Draft 1 proposal to ramp the AFK band by scaling advantage: an aggressive ramp moved the band from 40% to 28% below and that was its entire effect.

---

## 5. Damage

```
advantage = (aim - defence) / 10
low       = 25 + advantage         clamped 0 to 100
high      = 75 + advantage         clamped 0 to 100
damage    = rng(low, high)% of max hit
```

Second roll. Two per swing, total.

At parity that is rng(25,75)%, averaging half your max hit. At +25 advantage it becomes rng(50,100)%. At −35 it is rng(0,40)%, which is what lets weak enemies chip at you instead of whiffing dramatically.

**Strength sets max hit. Attack sets aim**, which moves hit chance and the damage band together, so it raises your average hit without touching your ceiling.

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

**TREAT THIS TABLE AS THE ACCEPTANCE TEST.** The absorption term is applied to armour on a damage scale, not to raw armour points: tier 9 armour totals 380 against an enemy max hit of 52, so subtracting any large fraction of raw points would zero out all incoming damage. The model's standard `/10` divisor is the likely form, giving roughly `absorbed = 0.4 × armour / 10`, which is about 15 off a 52-point hit at tier 9.

Do not take that formula on trust. Build the simulator, then **tune the term until it reproduces all five rows above**. The rows are measured output from the original sim and are authoritative; the formula written here is reconstructed and is not.

---

## 6. Weapons

Nine per metal tier: three damage types across three forms. Nine metal tiers, so 81 weapons.

Tier rungs, and the level bands they own:

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

The dual-wield names are plural because the pair is **one inventory item**, not two. Nothing occupies the offhand slot separately.

### Tier 1 numbers

| Weapon | Type | Form | Speed | Aim | Max hit |
|---|---|---|---|---|---|
| Daggers | Pierce | Dual | 2.4s | 110 | 34 |
| Hand Axes | Slash | Dual | 2.4s | 100 | 34 |
| War Hammers | Blunt | Dual | 2.4s | 90 | 34 |
| Spear | Pierce | 1H + shield | 3.0s | 110 | 38 |
| Scimitar | Slash | 1H + shield | 3.0s | 100 | 38 |
| Mace | Blunt | 1H + shield | 3.0s | 90 | 38 |
| Atgeir | Pierce | Two-hand | 3.6s | 110 | 51 |
| Greatsword | Slash | Two-hand | 3.6s | 100 | 51 |
| Maul | Blunt | Two-hand | 3.6s | 90 | 51 |

Scaling per tier: aim `+37.5`, max hit `× 1.221`.

**Where these max hits come from.** Draft 1's six weapons resolve to two clean max-hit-per-second budgets: one-handers at 12.5, two-handers at 14.25. Two-handers get about 14% more for giving up the shield. Applying those budgets to the three form speeds reproduces Draft 1's own numbers exactly — 3.0s × 12.5 = 38, the Draft 1 mace; 3.6s × 14.25 = 51, the Draft 1 greatsword. Dual wield drops the shield, so it takes the 14.25 budget: 2.4s × 14.25 = 34.

So **max hit is a property of form**, like speed, and **aim is a property of damage type**. Two numbers, two axes, nothing per-weapon to memorise.

### One consequence worth a decision

Tying speed to form means that **within a form, damage type is the only difference**, and aim helps both the hit roll and the damage band. At parity, on identical max hit:

| Type | Aim | Expected damage per swing |
|---|---|---|
| Pierce | 110 | 9.88 |
| Slash | 100 | 9.50 |
| Blunt | 90 | 9.12 |

**Pierce comes out 8.3% ahead of blunt.** In Draft 1 this was masked because the three types also had different speeds; now they do not, so pierce is simply the better pick whenever the enemy is not resistant to it.

Two ways to go, and this is a decision, not a recommendation:

**Leave it.** The 1.25 / 1.0 / 0.75 weakness multipliers are ±25%, which dwarfs 8%, so enemy stance still dominates the choice. Draft 1 knowingly accepted a 7% spread for the same reason.

**Compensate with max hit**, giving blunt a heavier swing to pay for its worse aim. This makes all three types exactly equal at parity:

| Form | Pierce | Slash | Blunt |
|---|---|---|---|
| Dual (2.4s) | 33 | 34 | 35 |
| 1H + shield (3.0s) | 37 | 38 | 40 |
| Two-hand (3.6s) | 49 | 51 | 53 |

This also reads better in the fiction: the war hammer hits harder than the spear. The cost is nine per-weapon max hits instead of three per-form ones.

**Speed is a property of the form, not the weapon.** This resolves Draft 1's uncertainty. Under absolute-difference accuracy, a 12-point aim spread moves hit chance by 1.2 points and cannot offset any damage spread, so accuracy could never balance against damage — speed can, because it multiplies into damage per second directly. Tying it to form rather than to individual weapons means players learn three numbers instead of nine.

**Max hit growth is deliberately slower than enemy HP growth** (×1.221 against ×1.33 per tier). Level-matched fights lengthen from about 40 seconds at combat 1 to about 99 at combat 100, and that is the only thing making it pay to fight above your level. When weapons scale at the same rate as enemy HP, XP per hour comes out flat in enemy level no matter what the reward table says.

### The shield problem, noted not solved

Two of the three forms drop the shield, which leaves the offhand attached only to the balanced form. That is a narrower offhand slot than Draft 1 had. Worth watching once armour sets are in; not worth pre-solving.

---

## 7. Armour

Six slots, two sets per metal tier. The early set is reachable partway up the tier, the late set at the top.

| Slot | Early | Points | Late | Points |
|---|---|---|---|---|
| Head | Coif | 8 | Helm | 12 |
| Chest | Hauberk | 14 | Cuirass | 20 |
| Legs | Chausses | 10 | Greaves | 15 |
| Hands | Bracers | 6 | Gauntlets | 9 |
| Feet | Boots | 6 | Sabatons | 9 |
| Offhand | Buckler | 10 | Kite shield | 15 |
| **Total** | | **54** | | **80** |

Late set scaling: `80 + 37.5 × (tier - 1)`, so tier 9 totals 380. Dropping the shield costs about 19% of total armour.

Metal armour also eats leather, which has five tiers against metal's nine: leather 1 covers metals 1–2, leather 2 covers 3–4, and so on up.

---

## 8. Enemies and health

```
max HP        = 100 + 10 × (Constitution - 1)
enemy aim     = enemy defence = 100 + 5.05 × (level - 1)
enemy max hit = 6 + 0.46 × level
enemy HP      = 140 at level 1, × 1.33 per tier
enemy swing   = 3.0 seconds for grunts
```

Constitution lands around 70% of combat level in practice, so max HP runs 100 at the start to about 790 at combat 100.

**Grunts swing at 3.0s, the same as the balanced player form. Bosses vary for flavour.** This resolves Draft 1's Q3: there was no principled rule for setting enemy speeds, and "the standard is the middle form, bosses are hand-set" is better than any rule. It means enemy speed is a design choice per boss rather than a number needing a formula.

---

## 9. The fight loop

**The player always swings first, at t=0.** The enemy's first swing lands at one full swing interval. If the target dies before then it never swings at all. Averaging damage per hour hides this completely, and it is most of the reason the unattended gap sits as close to parity as it does.

```
player inputs:   weapon aim, weapon max hit, form speed,
                 total armour, max HP,
                 Attack / Strength / Defense / Constitution levels
enemy inputs:    aim, defence, max hit, HP, swing speed, damage type resistances

loop:
  t = min(next player swing, next enemy swing)
  attacker rolls hit% ; on a hit, rolls the band, applies absorption, applies damage
  repeat until enemy HP <= 0 or player HP <= 0

per kill:  kill time, damage taken, number of enemy swings that happened
per hour:  cycle = kill time + 10s engage delay
           damage/hr = damage per kill × 3600 / cycle
```

The **10 second engage delay** between kills stands in for finding and closing on the next one. It is there for balance as much as flavour: without it, killing weak things quickly pays better XP per hour than fighting at your level, and everyone farms rats.

Simulation figures in §11 come from 2,500 fights per row.

---

## 10. Food and the one decision

Eating is free and instant. It costs no swing and takes no time.

Two proposals to change that were considered and **both rejected**: eating costing your next swing, and an eat time per dish measured in swings. Neither ships. Do not reintroduce either without asking.

### The known consequence, recorded so nobody rediscovers it

A fight has exactly one decision in it: **when to eat**. Everything else is settled before you engage, when you pick your form, your damage type and your target. With several minutes of slack at parity, even that decision is easy — you eat well before it matters.

And because eating is free, **composite dishes dominate outright**: more heal per item, one inventory slot instead of five, and no downside. A player carrying Game Pie has no reason to carry cooked fish.

Both of those are accepted as-is. They are structural rather than broken, and the answer, if one is wanted later, comes from watching thirty alpha testers fight rather than from more simulation.

---

## 11. What the numbers do

Each row is a level-matched kit fighting down by a percentage of combat level. **These figures predate the 0.4 absorption constant** and describe the unabsorbed model; they are kept as the shape of the curve, and the AFK column moves outward once absorption is in.

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

**With absorption at 0.4**: parity survival ~5.7 minutes, food burn ~23/hr, and a twenty minute unattended stretch lands near 25% below combat level.

XP per kill is set so a level-matched fight pays a normal skill's rate × 1.5. Combat 1 to 100 works out near 2,000 hours; a single skill to 100 as a pure specialist near 4,000.

---

## 12. Open questions

Everything not listed here is settled and buildable.

**A. Damage type parity within a form.** §6 lays out the 8.3% pierce advantage and the two options. Leave it, or compensate with max hit. Needs a decision before weapons are seeded, because it changes nine numbers.

**B. Should player defence grow faster than enemy accuracy?**
Foozard's corollary, and the most interesting open thread. Advantage is currently near level-invariant (§4), which is why the Draft 1 AFK ramp did nothing. Widening the growth gap would make that ramp behave as intended, and would make players progressively harder to hit as they level. **Not simulated, and not decided.** This is a question to work through, not a plan to build.

### Deferred to playtesting, deliberately

- Whether fighting above your level should be rewarded beyond better loot. Both Nathan and Foozard agreed this is answered by players, not by simulation.
- Tightening the AFK band below ~25%.

### Settled, recorded so it is not reopened

- **XP routing by form, not damage type.** Taken.
- **Speed by form**, three values, not nine.
- **Grunt swing 3.0s**, bosses hand-set.
- **Guaranteed use count** for durability (§13). Settled.
- **A third roll per swing**, if one ever earns its place, does *not* go in the advantage multiplier. §4 explains why that spot is dead.
- **Eating is free.** Two attempts to give it a cost were rejected (§10).
- **Absorption at 0.4**, with the §5 table as the acceptance test.
- **The nine weapons and their names** (§6).

---

## 13. Breakage and durability

Every weapon and tool in the game breaks eventually, including rare drops. Rares just last longer. Combat ships with breakage, and it is retrofitted to existing tools in a later patch.

A flat per-use break chance means a brand new pickaxe can shatter on swing one. That feels awful and it is not how anything works. Instead, each tool type has a **guaranteed use count**, tracked **per player, per item type**.

Tools stack in the inventory, so the counter cannot live on the item, and it cannot live on individual copies either or the stack shatters into unstackable singletons and the inventory becomes unusable.

Hold ten Ambren Pickaxes and have never mined: Ambren Pickaxe, for your account, has a guaranteed use count. Every mining action ticks it down regardless of which copy you notionally swung, since they are identical. At zero it stays at zero and the per-use break roll starts applying. When one finally breaks, the counter resets to full and the next pickaxe is safe again for that many uses.

This matters more in Talaran than in Syrnia because ore is genuinely scarce from the start. You mine rocks to find veins, and veins are finite.

Still to set: the guaranteed count per tier, the break chance after it, and whether combat weapons count swings, hits landed, or kills.

---

## 14. Death and rare drops

Death drops everything carried and worn, keeps gold, and the pile stays private to you for 10 minutes before it goes public.

**A boss weak to one damage type drops a weapon of a different type.** This is Foozard's and it is going in. It answers the question Draft 1 had no clean answer for: why anyone would fight the grunts after they have the boss weapon. Smith a weapon, kill the boss, farm the grunts with what it dropped.

---

## 15. What combat unblocks

Already built and waiting on this spec:

- **78 `heal_amount` values** on cooked food, stored and read by nothing.
- **The HP bar**, currently hardcoded at 100/100 in the equipment panel.
- **The four combat skills**, seeded but not implemented.
- **Weapons and armour for metal tiers 1 and 2**, which have no items at all.
- **The Talar resource**, designed and unbuilt.

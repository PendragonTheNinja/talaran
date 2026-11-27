# Pets: design

*First draft, 2026-11-27, from Nathan's brief. Nothing is built. **OPEN** marks what waits on Nathan.*

## What Nathan asked for

- **One pet per skill**, an extremely rare drop, **found once** (a player can have each skill's pet at most once).
- **Never guaranteed.** No bad luck protection, no pity counter. Some players will never find some pets.
- **Tied to actions**, with the odds set per skill, because skills do very different numbers of actions an hour.
- **Bragging rights only.** No speed, XP, drops, or anything else.
- A found pet: walks beside your name on your **profile** and in **Players Here**; gives a **badge** with its picture; gives a **chat emote**. It moves a little: a few frames of animation.
- **Supporter pets** come with the supporter badge steps, not sold on their own. **Holiday pets** may be sold in their season.

## How a pet is found

- **One roll per action that pays the skill**, after the action resolves, in the tick (beside `wearToolsAfter`): `Math.random() * pet.chance_one_in < 1`, skipped at once if the player already has that pet. Nothing is counted or carried between rolls.
- **Which actions count** is the skill's own work, the same list the skill's XP comes from: a chop, a swing at a rock or vein, a cast, a pick, a hunt or a trap emptied, a craft at a bench, a smelt, a saw, a harvested field, an animal collected from or slaughtered, a fill at the Rift, a journey walked or ridden or sailed, and a kill.
- **Combat** has three skills and one action: **three pets**, each rolled on every kill, one for each skill's theme (Nathan, 2026-11-27): Melee is the attack, Defense the guard, Constitution the endurance.
- **Rows, not code** (CLAUDE.md §2): a `pets` table (key, name, skill, chance_one_in, kind: `skill`/`supporter`/`holiday`, description, is_active) and `player_pets` (player, pet, found_at, the action that found it). The first-found insert is the gate (`ON CONFLICT DO NOTHING`), so two actions finishing together cannot find one pet twice.

## The odds

Set so that, at a skill's usual pace, the **average** wait is about **2,920 hours of that skill**, the optimal time from level 1 to 100 (`docs/xp-rebalance.md`; Nathan, 2026-11-27, knowing that many players will reach 100 without a skill's pet; one figure for every skill). The chance per action is then `1 in (actions an hour × 2,920)`, rounded.

| Skill | What rolls | Usual actions an hour | 1 in |
|---|---|---|---|
| Woodcutting | a chop | ~70 | 205,000 |
| Mining | a swing | ~120 | 350,000 |
| Fishing | a cast | ~50 | 146,000 |
| Foraging | a pick | ~60 | 175,000 |
| Hunting | a hunt, or a trap emptied | ~50 | 146,000 |
| Carpentry | a saw or a bench craft | ~90 | 263,000 |
| Smithing | a smelt or an anvil craft | ~70 | 205,000 |
| Cooking | a dish | ~100 | 292,000 |
| Crafting | a craft | ~60 | 175,000 |
| Farming | a field harvested | ~12 | 35,000 |
| Husbandry | a collection or a slaughter, per animal | ~25 | 73,000 |
| Talar | a fill at the Rift | ~60 | 175,000 |
| Wayfaring | a journey | ~15 | 44,000 |
| Melee, Defense, Constitution | a kill | ~60 | 175,000 each |

*Actions an hour are first guesses from each skill's timers at its own level; the build measures them from live `player_actions` before the rows are seeded (**SIM**).*

What that means for a player, since nothing is guaranteed: the chance of having a skill's pet after H hours of that skill is `1 − e^(−H/2,920)`.

| Hours in the skill | Chance of having its pet |
|---|---|
| 100 | 3% |
| 500 | 16% |
| 1,000 | 29% |
| 2,920 (to level 100) | 63% |
| 5,840 | 86% |

So about a third of those who take a skill to 100 still have no pet for it. Chosen: pets are never a guarantee and give no power.

## When a pet is found

- A line in chat for everyone, like a world first: *"Pendragon has found a little stoat living in the woodpile, and it has decided to stay."* (each pet its own line, as content).
- A Chronicle deed (`pet_found`, ten verses), and a notice to the player.
- The badge and the emote are theirs at once.

## Showing a pet

- **One pet worn at a time**, chosen like a badge or title (Settings or the Feats panel's picker). Worn pets show beside the name in **Players Here** and on the **profile**; the profile also lists every pet found, with when.
- **Animation:** a short loop of 2 to 4 frames, played by CSS (`steps()`), so it costs nothing. Players who prefer still images (`prefers-reduced-motion`) see the first frame.
- **Small:** drawn at 16 to 20 pixels beside a name, 64 on the profile.

## Supporter and holiday pets

- **Supporter pets:** each supporter badge step ($5, $20, $50, $100, $1,000) also gives a pet, granted and taken back with the badge (`services/supporter.ts`). Never sold by itself.
- **Holiday pets:** sold in the store in their season, like Yuletide; kept for good once bought. Never tradeable. A holiday pet may be gifted.

## Still to decide

1. The pets themselves: which animal for which skill. A first list to react to: a stoat (Woodcutting), a rock-wren (Mining), an otter pup (Fishing), a hedgehog (Foraging), a fox kit (Hunting), a sawdust mouse (Carpentry), an ember sprite (Smithing), a kitchen cat (Cooking), a magpie (Crafting), a field hare (Farming), a lamb (Husbandry), a will-o'-the-wisp (Talar), a road dog (Wayfaring), and for combat a war hound pup (Melee), a tortoise (Defense), and an ox calf (Constitution).

## Build order

1. Tables and seeded pets; the roll after each action (tick and the fight settle); first-found gate; chat line, notice, Chronicle deed kind. race:check: two actions finishing together never find one pet twice.
2. Wearing a pet; Players Here and profile display; the animation.
3. Badges and emotes (with the emote system).
4. Supporter pets, then holiday pets in the store.

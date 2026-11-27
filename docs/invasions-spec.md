# Invasions: design

*First draft, 2026-11-27. Nothing here is built. It extends the world-events system (`docs/WORLD-EVENTS-AND-MUSEUMS.md`, "Invasions, later") and the fight engine (`docs/combat-spec.md`). Where this conflicts with either, they win until Nathan decides otherwise. Items marked **OPEN** wait on Nathan; items marked **SIM** are settled by `scripts/combatSim.ts` before any content is seeded.*

---

## 0. What an invasion is

A tear opens somewhere on an island and things from another world come through. Everyone who fights there draws from one shared horde. Kill enough of them before the tear closes and the place is held: everyone who helped is paid, and the Chronicle remembers it. Run out the clock and the tear closes on its own, the horde goes back with it, and nobody gets the closing reward.

It is the combat version of a skill event. A skill event is "this place pays more for a while, until the pool runs dry". An invasion is "this place is under attack, until the horde runs out".

**Scope of this draft:** creatures of level 1 to 24 (Taiar's band and Antura's). Later tiers bring stranger worlds and worse things; the system is built so they are rows, not code (§9).

---

## 1. Lore

- **Not the Rift.** The Rift is a seam downward, where the light comes up. A tear is a seam *sideways*, into somewhere else. Nothing an invader says or carries names what lies under the Rift (CLAUDE.md §2 Talar). The light may draw them; that is as far as the text goes.
- **Not a Portal.** "Portal" is already the Talar spell (`services/spells.ts`). Player-facing text calls these **tears** (working name; **OPEN**: tear, breach, rent, or a word of Nathan's). Code says `invasion`.
- **Every invasion comes from one world**, a **realm**. A realm is a row: its name, a line of what it looks like through the tear, its roster, and its drops. The same realm can come back; regulars learn its creatures, and the Bestiary fills over many invasions.
- **The Laranists have opinions.** Georome gets a few rare lines (`npc_rare_lines`) about tears: they are wrong about what they are, as Laranists are about everything, but in an interesting way.
- **Where the realms come from:** public-domain myth and literature, plus worlds of Talaran's own (§7). Never a renamed creature from a work under copyright (Middle-earth, the Wheel of Time, a living game). A licensed guest creature, with written permission and credit, is the one exception (**OPEN**: Nathan to ask Syrnia's owner).

---

## 2. What a player sees

1. **A warning.** Fifteen minutes before (`invasion_warning_minutes`), one chat line: *"The air over Verdale has begun to shimmer, like heat off a road in winter."* The Events panel shows it as coming, with a countdown and the realm's level range. That gives the island time to walk over. Nothing is told about the realm until it opens, beyond its levels.
2. **The tear opens.** A second line names what came through: *"A tear has opened over Verdale. Small striped things are pouring out of it, and they are eating the hedges."* The place gains a fighting spot for the length of the invasion (§3), shown in the location panel as the tear, with the horde's count: "The Tear over Verdale · 212 of 300 left · 1 h 04 min".
3. **Fighting it** is an ordinary fight: Fight, choose a creature, the same fight view, food, flee, death. Each kill takes one from the horde. The fight log and the result card say so: "+1 to the horde driven back (88 of 300)".
4. **Held.** The kill that takes the last one closes the tear. A chat line names the place and how many fought. Everyone who made at least `invasion_min_kills` kills (default 5) gets the closing reward (§6) on a notice, the next time they look if they are away.
5. **Lost.** If the clock runs out first, the tear closes with the rest of the horde still inside. One chat line; no closing reward; kills already made keep their XP and drops.
6. **Gatherers** at the place carry on unbothered (**OPEN**, §10 Q3).

---

## 3. How it is built on what exists

### The event

- **A new kind, `invasion`, in `world_events`.** It gets everything the other kinds have: the countdown, the Events panel, the admin Events tab (start, extend, refill, end now), history, and the scheduler. `pool_total` / `pool_left` is the horde, counted in kills.
- **`world_event_types` rows of kind `invasion`**, one per realm-and-island pairing (or per realm, with the island chosen at random: **OPEN**, minor). Weight, length range, pool range, and announcement lines are the columns that already exist. New: `realm_id`, `warning_line`.
- **Where:** a type lists the places it may open (the column already exists). By default, the places on its island with **no fighting of their own**: on Taiar, Verdale, Lanaivale, Luxmere, Novita's fields, and Talador's square; on Antura, Wendhaven, Farefield, Underway, and Bidewater. An invasion where nobody normally fights is the point. Never on an islet, a road, or at sea.
- **The scheduler** treats invasions as a separate stream with their own rate (`invasion_every_hours`, default **one per island every 36 hours** on average; **OPEN**) and **at most one live invasion per island**. They never take a skill event's slot, as the merchant never does. An invasion and a skill event may share a place.

### The fighting spot

- **The realm's creatures are ordinary `creatures` rows** with a `realm_id` (nullable; null is "native to Talaran"). So the Bestiary, `drop_table_entries` (`combat:<creature>`), `combat:derive`, the sim's `roster`, feats such as `bestiary_all`, and Exploration's first-find records all work unchanged. **OPEN**: whether `bestiary_all` counts invaders (they come and go, so a completionist would have to wait for them; recommend: it does not, and invaders get a feat of their own, §6).
- **When an invasion opens, it creates a `fighting_spots` row** at its place (`kind: 'chosen'`, a new nullable `world_event_id`), with the realm's roster in `fighting_spot_creatures`. **Chosen, not drawn**, because an invasion's roster spans a whole band: a combat 3 player must be able to pick the level 2 scout and leave the level 11 leader to someone else. When it ends, the spot is set `is_active: false`, never deleted (a fight row points at it).
- **Every entry point already refuses an inactive spot** to *start* a fight (`combatFights.ts`, start). A fight *in progress* when the tear closes finishes the creature it is on, is paid, and then ends, as a weapon break ends one (`settle` already stops after a kill when told to). No half-paid kills.

### Taking from the horde

- **One unit per kill, inside the settle's own transaction**, by one conditional statement: `UPDATE world_events SET pool_left = pool_left - 1 WHERE id = ? AND pool_left > 0 AND ended_at IS NULL RETURNING pool_left`. One row back: the kill counts. None back: the horde is already gone, so the kill still pays as an ordinary kill and the fight ends after it. The settle replays many swings at once, so this runs once per kill it settles, in order.
- **The kill that brings `pool_left` to 0 closes the event** in the same transaction (`ended_at`, `end_reason: 'held'`). Announcement, closing rewards, and the Chronicle deed run after commit (`afterCommit`). Two fighters settling their last kills at once: the conditional update orders them; exactly one closes it. **race:check `invasion`**: many players on the last few units; exactly `pool_total` kills are counted, the closing reward is paid once per eligible player, never twice.
- **Each player's kills are counted in `world_event_shares`** (built for Kindle, one row per player per event), written in the same statement's transaction. That is what decides who gets the closing reward. `per_player_cap` stays null for invasions: a strong player clearing the horde alone is fine; they still only get one closing reward.
- **Lock order** stays the fight's own: action, fight, player, equipment, and the event row last. The event row is only ever touched by that one conditional update, so it is never held while waiting on anything else.

### XP

- **A kill pays the creature's own `xp_per_kill`** through the normal kill split (`killXp`), exactly like any other creature. Invaders are profiled and derived like everyone else (§8).
- **Plus the invasion's bonus**, `world_events.xp_multiplier` (default **+25%**, the skill events' default), applied once to the whole kill before the split. It must not go through `applyEventBonus` inside `awardXp`: a kill calls `awardXp` three times (Melee, Defense, Constitution) and would take three units from the pool. The settle passes the bonus in and calls `awardXp(…, { eventBonus: false })`. The result card shows it as `eventXp`, as skill events do.

---

## 4. Absence, bots, and death

- **Absence and bot checks are unchanged.** A disconnected fighter flees at `last_seen` unless they opted in to fighting on offline; a bot check freezes between kills. An invasion is not a reason to loosen either.
- **AFK against invaders** is possible the same way it is anywhere: well below your level. That is fine. An invasion that a high-level player clears at idle is a held place, which is good for everyone there. If it proves to empty Taiar's hordes before newcomers get a turn, the fix is a `per_player_cap`, already a column (**SIM** after alpha, not before).
- **Death is normal death** (CLAUDE.md §2 Combat): everything drops at the tear's place, private for the usual minutes, respawn in Talador. Invasions in towns put the pile somewhere easy to reach, which is a mercy for new players, deliberately.

---

## 5. Size and pacing (first guesses, **SIM**)

| | Taiar (levels 1 to 12) | Antura (13 to 24) |
|---|---|---|
| Horde | 250 to 400 kills | 200 to 300 kills |
| Length | 90 to 150 minutes | 90 to 150 minutes |
| Warning | 15 minutes | 15 minutes |
| Rate | one per 36 hours per island | same |
| Closing reward from | 5 kills | 5 kills |

A level-matched kill on Taiar takes about 40 to 60 seconds plus the 10 second engage delay, so one fighter makes about 60 to 70 kills an hour. Six fighters hold a 300-kill tear in about 45 minutes; two cannot hold it in the time. That is the intended shape: it needs a crowd, and with thirty alpha players, "a crowd" is six. Every number is a row the admin tab can change without a deploy.

---

## 6. Rewards

**Per kill:** XP (§3) and the creature's own drops. Invader drops follow every combat rule already locked (CLAUDE.md §2): **no meat**, one common drop of the creature's own (a shell, a pelt, a scrap of strange metal, coin from a person), a rare trophy, no whole armour pieces. Invader drops are **other-worldly materials**, which is what makes them worth the trip:

- **Each realm has one signature material** that only its creatures drop (a Tove's corkscrew tooth, a Wheeler's iron tire, a Stymphalian bronze feather). They are the realm's only way into the economy, so they are rare in the market by nature.
- **What they are FOR is the first thing to settle** (**OPEN**, Q1). Options, in order of preference:
  1. **Crafting inputs** for a small set of finished goods that cannot be had otherwise: a ring or amulet setting, a cosmetic trophy-slot piece, a dye. Fits "nouns are rows", gives crafters a reason to buy from fighters, and is a sink.
  2. **Museum cases**: a "From Elsewhere" exhibit in each island's museum, one case per invader drop. Rare and episodic is exactly what a museum is for. Needs a decision on `items.island` (invader items belong to the island they first came through) or `museum_exempt` for the rarest.
  3. A **trade-in** with an NPC (a Laranist who collects tear-glass). Simplest, least interesting.
- **Rare weapons:** none in the first realms. Each island's rare weapons are already placed (`docs/combat-spec.md` §10, `docs/antura-plan.md` §10), and an episodic source of a strong weapon would undercut them.

**On holding the place,** to everyone with at least `invasion_min_kills`:

- **A Tear-glass** (working name; **OPEN**): one item, untradeable, the shard the tear leaves behind. Its use is the same question as the signature materials (Q1). Untradeable so the reward cannot be farmed by alts and sold.
- **Gold:** a flat share from nowhere (a reward from the town). Recommend **none**: gold enters the game through attention (CLAUDE.md §8), and the kills already found coin. **OPEN**.
- **The Chronicle:** a deed kind `invasion_held` (`chronicle_deed_kinds` row, `noteDeed`, ten verses), naming the place, the realm, and the player with the most kills. A lost invasion is a deed too (`invasion_lost`), written kindly.
- **Feats** (category Combat): *Held the Line* (help hold your first tear), *Hold Ten*, *Hold Fifty*; *Well Traveled* (see a creature from N realms). Feat criteria are a kind each in `services/feats.ts`.

**Never Talers, never a Taler-bought advantage.** Invasions are where paying players and free players stand side by side; nothing bought should make one of them hold a tear faster.

---

## 7. Creature ideas, levels 1 to 24

Six realms to choose from, four from public-domain myth and literature and two of Talaran's own. Each roster is four creatures over a band: scouts at the bottom, a leader at the top, and each damage type the weakness of at least one, so whatever a player carries is useful against something. Profiles are hints for `combatSim.ts`, in the words the existing rosters use.

None of these repeats a creature already in Talaran (rats, crabs, the Gouger, the Hodag, the Agropelter, the Draugr, the Trow, the Siren, the Kelpie, the Shellycoat, the Each-uisge, the Nuckelavee, the Blue Man, the Snallygaster, the Bolter, and the rest).

### Taiar realms (1 to 12)

**A. The Wabe** (Lewis Carroll, *Through the Looking-Glass* 1871 and *The Hunting of the Snark* 1876; public domain everywhere). A world where the grass is too green and the sundial runs backwards. The realm that best fits Talaran's own sense of humor (the Squonk, the Jackalope). Describe from Carroll's words and Tenniel's plates, never a film's design.

| Creature | Lvl | Character | Weak / resists | Drop idea |
|---|---|---|---|---|
| Mome Rath | 1 | a small green pig that whistles and sneezes; lost, mostly | slash / – | a curly tail-tuft |
| Slithy Tove | 3 | part badger, part lizard, part corkscrew; nests under sundials | crush / pierce | **Tove Tooth** (signature: a corkscrew of bone) |
| Borogove | 5 | a thin shabby bird like a live mop; frail, hard to catch | pierce / crush | Borogove quills (feathers, a little) |
| Bandersnatch | 9 | quick, snapping, a neck it stretches as far as it likes | slash / crush | Bandersnatch jaw (trophy) |
| Jubjub Bird | 11 | screaming, desperate, always in a passion; accurate, light | pierce / slash | a Jubjub plume |

Hold the Jabberwock back for a later tier: Carroll made it the thing you need a special blade for, which is a T3+ leader, not a level 12 one. The **Boojum** (a Snark that makes whoever finds it softly and suddenly vanish) is a perfect later rare encounter, using the hesitate mechanic in reverse.

**B. The Deadly Desert's edge** (L. Frank Baum, *The Wonderful Wizard of Oz* 1900 and *Ozma of Oz* 1907; public domain in the US and UK). The country itself is never named in game: "Oz" names are trademarks in some uses, and the 1939 film's look (ruby slippers, green-faced witch) is still under copyright. Baum's text and W. W. Denslow's and John R. Neill's plates are free.

| Creature | Lvl | Character | Weak / resists | Drop idea |
|---|---|---|---|---|
| Wheeler | 2 | a gaudy shrieking person with wheels for hands and feet; all noise | crush / – | **Wheeler's Tire** (signature: a little iron tire), coin |
| Hammer-Head | 6 | squat and armless; shoots its head out on a stretching neck | slash / crush | a flat skull-cap of bone |
| Fighting Tree | 8 | branches that grab and fling; rooted, hard to hurt, slow | slash / pierce | Fighting Tree bough (a wood, not a log; see Q1) |
| Kalidah | 11 | body of a bear, head of a tiger, claws to tear a lion in two | pierce / slash | Kalidah claw (trophy) |

**C. The Bronze Shore** (Greek myth: Herodotus, Pausanias, and Apollonius; public domain). Labors and voyages, without gods. Everything is bronze, sun, and salt.

| Creature | Lvl | Character | Weak / resists | Drop idea |
|---|---|---|---|---|
| Myrmex | 3 | a dog-sized ant that digs for gold; tough shell, poor aim | crush / slash | gold dust, now and then coin |
| Spartos | 7 | a soldier grown from a sown dragon's tooth; no fear, no flesh | crush / pierce | a dragon's tooth (trophy) |
| Stymphalian Bird | 10 | bronze-beaked, bronze-feathered, it sheds its feathers like darts | crush / slash | **Bronze Feather** (signature); also feathers, which arrows always want (CLAUDE.md §2) |
| Khalkotauros | 12 | a bronze-hoofed bull that breathes the heat of a forge; slow, heavy | pierce / crush | a bronze hoof (trophy) |

(Talos, the bronze giant, is a T3+ leader. The Hydra is later still.)

### Antura realms (13 to 24)

**D. Annwn** (Welsh myth and folklore, the Mabinogion first; public domain). The Otherworld of the Welsh tales: a hall where it is always evening, white hounds with red ears, lakes that are not the depth they look.

| Creature | Lvl | Character | Weak / resists | Drop idea |
|---|---|---|---|---|
| Gwyllgi | 14 | the Dog of Darkness, a mastiff of a shape with red eyes; quick, it harries | pierce / – | a black pelt |
| Cŵn Annwn | 17 | white hounds with red ears, hunting in a pack; accurate | slash / crush | **Red Ear** (signature: a tuft that is always warm) |
| Afanc | 21 | a lake beast like a huge beaver or crocodile; drags people under | crush / slash | Afanc hide (a leather input, if Q1 allows) |
| Huntsman of Annwn | 24 | one of the Otherworld king's riders (the king himself never comes), in gray hunting clothes, horn at his belt; a person, so he carries coin | crush / pierce | his horn (trophy), coin |

(The Twrch Trwyth, a king turned boar with a comb and shears between its ears, is a famous group hunt: an ideal first group boss when group fights exist, at a later tier.)

**E. The Glasswold** (Talaran's own). A world of cold, sharp light where everything alive is partly glass. Ours, so its creatures can do whatever the game needs, and so it can return at every tier up to 100 with stranger things each time.

| Creature | Lvl | Character | Weak / resists | Drop idea |
|---|---|---|---|---|
| Shardmite | 13 | a beetle with a glass back; light, many, fragile | crush / pierce | **Tear-glass** chips (signature) |
| Prism Hare | 16 | a hare you see three of; only one is there | pierce / slash | a splitting lens (trophy) |
| Glasswing | 19 | a kite-sized dragonfly with glass wings that cut | crush / slash | a wing pane |
| Lamplighter | 23 | a tall thin figure carrying a lantern of the realm's light; slow, every blow sears | slash / crush | its lantern (trophy) |

**F. The Drowned Bell** (Talaran's own). A sunken town in another world, where the bell still rings under the water. Sea-folk, salt, and the sense that something went wrong a long time ago. Sits well beside Antura's theme of setting out.

| Creature | Lvl | Character | Weak / resists | Drop idea |
|---|---|---|---|---|
| Bellwether Crab | 15 | a crab wearing a church bell; it rings when hit | pierce / crush | bell-metal scrap (signature) |
| Drowned Parishioner | 18 | a soaked figure in Sunday clothes, still on the way to service; a person, so coin | slash / – | coin, a hymn-book page |
| Tidewife | 20 | sings the hour before she strikes (`hesitate_text`, like the Siren) | crush / pierce | a comb of green shell |
| The Sexton | 24 | the bell-ringer, huge, barnacled, rope still in his hands | pierce / crush | the bell-rope (trophy) |

### Recommendation

Ship **two realms per island** for 1.0: the **Wabe** and the **Bronze Shore** on Taiar, **Annwn** and the **Glasswold** on Antura. That is sixteen creatures, sixteen pictures, two signature materials per island. Carroll and the Greeks are instantly recognizable to players who know them, Annwn suits Antura's Celtic waters, and the Glasswold is ours to grow up the tiers. Oz and the Drowned Bell wait for a later patch.

---

## 8. Balance

- **Every invader goes through `combatSim.ts roster`** against the ±15% XP-an-hour guardrail at its level, like every native creature (`docs/combat-spec.md` §8). `pnpm combat:derive` writes `xp_per_kill`. No hand-set XP.
- **Invaders should be slightly tougher than natives of their level**, not easier: they are what you go *to*, so their reward is the event bonus and the drops, not an easy kill. Aim for 90 to 100% of the grunt's XP an hour before the +25%.
- **XP budget:** an invasion's extra XP is bounded by its horde (300 kills × 25% of a level-matched kill's XP). At Taiar's levels that is about 2,000 XP spread across a crowd, a few minutes' work each. Generous enough to come for, small enough not to matter to the curve. **SIM** before shipping.
- **Drops:** signature materials at about one kill in five to eight, as natives' common drops are. Trophies at the rates the rosters already use. Check supply against whatever Q1 decides they make: a horde of 300 every 36 hours is about 40 to 60 of a realm's signature material a visit, server-wide.

---

## 9. Later tiers

The same rows carry the system to 100. A realm can have rosters on several islands (a `realm_creatures` view by island is enough), so the Glasswold can come back at T5 with worse glass. Leaders grow into **bosses** once group fights exist (`docs/combat-spec.md` §9, "Bosses, later": rejoinable, not ended by one disconnect). Near 100 is where the stranger worlds belong: cosmic horror (Lovecraft's earlier stories are public domain in the UK and EU, and in the US only for works published before 1931; check each one) and the things that are not quite gods. Not in this draft, on purpose.

---

## 10. Open questions for Nathan

1. **What are realm materials for?** Crafting inputs for a few unique goods, museum cases, an NPC trade-in, or some mix. This decides whether invasions matter beyond XP. Recommend crafting plus museum.
2. **The word.** Tear, breach, rent, or yours.
3. **Do gatherers at the place feel it?** Options: nothing (recommended for 1.0); a scene line only; or the place's gathering runs ×1.1 slower until the tear is held, which gives non-fighters a reason to cheer the fighters on but punishes people for being somewhere.
4. **Rate and size.** One per island every 36 hours, a 300-kill horde, 90 to 150 minutes. With thirty players, is that too often or too rare?
5. **Does the Bestiary's all-creatures feat count invaders?** Recommend no, with feats of their own.
6. **Gold on holding?** Recommend none.
7. **Syrnia guest creature.** If permission comes, one creature, credited, in its own realm.
8. **Which realms for 1.0.** The recommendation is §7's last paragraph.

---

## 11. Build order

1. **Schema:** `realms`, `creatures.realm_id`, `fighting_spots.world_event_id`, `world_event_types.realm_id` and `warning_line`, settings (`invasion_every_hours`, `invasion_warning_minutes`, `invasion_min_kills`). Fresh-database safe (`hasContent`).
2. **The kind:** scheduler stream, warning, open (spot created), close (held or lost, spot deactivated), announcements, the Events panel showing it.
3. **The fight hooks:** the pool take in settle, the event's XP bonus, fights ending when the tear closes, `world_event_shares` counts. race:check `invasion`, shown to fail against a read-then-write version first.
4. **Rewards:** closing reward after commit, the notice, the Chronicle deed kinds, the feats.
5. **Admin:** the Events tab starts an invasion like any type; the live card shows the horde and the top fighters.
6. **Content:** the first realms (§7), each a migration: realm, creatures, drops, items with `island`, `action_presentation` rows, announcement and warning lines. combatSim, combat:derive, values:derive.
7. **Manual page** (Invasions, how they work, never what drops: that is the Bestiary's), patch notes.

Each step ships and is proven on its own.

# Sea travel: the ferry, boats, and exploring

*Second draft, 2026-11-15, written with Nathan. It replaces the draft of 2026-11-05, several of whose decisions he has since changed (long voyages, moored vessels, the Cutter, one long build). Status: design, not built. Anything dated is Nathan's decision; anything marked "proposed" is waiting on him. §11 lists what is open. The islets have their own plan: `docs/islets-plan.md`.*

---

## 1. No Sailing skill (Nathan, 2026-11-05; players polled 22 to 2 in favour)

Sailing is not a skill. **Every journey, over land or sea, pays Wayfaring.** Sea travel is a part of Wayfaring the way riding is.

Why: a skill whose XP comes from waiting on a boat is the thin skill this game has already merged away once (Agility and Equitation became Wayfaring, `20261016130000`). What is interesting about sailing is owning the boat, where it takes you, and what you find there, and all of that fits around the skill players already train by travelling.

- The unused `Sailing` row in `skills` (`is_implemented` false) is retired in the first step's migration. Nothing has ever paid it XP.
- Wayfaring already gates the better horses and shortens every journey. Boats add to that; shortcuts on foot may come later (Nathan).

## 2. The shape of it

**A boat does two things:**

1. **Crossing:** port to port, island to island.
2. **Exploring:** putting to sea with no destination, landing on one of the island's islets by chance, and coming home (§6).

**Three ways across** (Nathan, 2026-11-15):

| | Cost | Speed | Wayfaring XP |
|---|---|---|---|
| Ferry | A fare | Slowest | None |
| Skiff | Free | A little faster | Yes |
| Cog | Free | Fastest | Yes |

Every boat of a player's own beats the ferry, the Skiff included, if only by a little. A slower Skiff would be built only by players who wanted the islets, since a small fare would buy the quicker crossing. The ferry is for players with no boat yet, and it reaches every inhabited island's port, so no island is ever locked behind a level.

## 3. What exists today

| Piece | What exists | What sea travel uses it for |
|---|---|---|
| `location_connections` | `from`/`to`, `base_travel_time` in seconds, `travel_type` (default `'walking'`), `required_skill`/`required_level`, `is_bidirectional` | A sea route is a connection with `travel_type: 'sea'`. No new table. |
| `computeTravelTime` (`services/travel.ts`) | Foot and mount curves: `fraction = floor + (start - floor) * rate^level` | A boat has a start and a floor, as a mount does. |
| Travel XP | `FOOT_XP_RATE` 0.7 and `MOUNT_XP_RATE` 0.45 a second of base time, always on base, never the shortened time | Sailing pays near the mount's rate (§5). |
| `TRAVEL_EVENTS` (`services/travelEvents.ts`) | Finds by region, rolled on each journey | Sea finds, keyed by mode as well as region (§8). |
| `travel_log` | Every journey and its finds | Sea journeys log there too. |
| `locations.region` | The island | An islet belongs to its island's region. |
| `services/guildHall.ts` | A build raised a material at a time by a repeating 20-second action that pays Carpentry | The pattern for building a boat (§5), made general and shared. |
| Portal, the Daily Step, death | A player can change islands with no boat | Why a boat is never moored in one place (§5). |

Taiar's roads run 36 to 162 seconds on foot at level 1, 82 on average. That is the scale a crossing is set against.

## 4. The ferry

- **A sea route with a fare.** `location_connections` gains `ferry_fare` (whole gold, null where no ferry runs). Talador to Wendhaven is the first.
- **Starting:** the travel route takes a mode on a sea connection, `'ferry'` or the player's boat. The fare is taken in the same transaction as the travel insert, with the player row locked and a `gold_ledger` row (reason `ferry_fare`), as every gold write is (CLAUDE.md §4 rules 1, 3, and 7). Not enough gold is a refusal before anything is written.
- **Time:** about 8 minutes (Nathan, 2026-11-15). Fixed: Wayfaring, mounts, staffs, and provisions do not speed a ship a player is only a passenger on.
- **XP: none** (Nathan, 2026-11-06). A passenger is not sailing.
- **The fare is 50 gold each way** (Nathan, 2026-11-15): never nothing and never steep, since the ferry is also the slowest way across and pays no XP. For scale, an hour of gathering turns up about 27 gold in coins at level 13 (CLAUDE.md §8: gold from gathering is 1% of XP an hour). It is a number on the route's row, so it is tuned without code. The fare leaves the economy; check `reconcileGold()` after.
- **Your mount comes with you.** It stays worn; you ride it again on landing.
- No special absence rule. The first draft exempted sea journeys from the 30-minute away rule (`lib/presence.ts`) because they outlasted it. At 8 minutes they do not.

## 5. Boats

### What a boat is

- A row, never an item (`player_vessels`: owner, vessel type). A boat in a backpack is the ingots-in-a-barrel problem again.
- **Once built, it is at whichever port its owner stands in** (Nathan, 2026-11-15): the deckhands bring it round. It is never moored in one place, because a player can change islands without it and would be stranded from their own boat. This settles the first draft's "moored, or carried?": neither.
- Vessel types are rows (`vessel_types`: name, tier, Wayfaring level to sail, Carpentry level to build, speed start and floor like a mount's, the pieces it is built from), so a new boat is content, not code.

### The ladder (Nathan, 2026-11-15)

**One boat a tier, and each does both jobs.**

| Boat | Tier | Sail at Wayfaring | Build at Carpentry | Explores | Crossing |
|---|---|---|---|---|---|
| Skiff | 1 | 1 | 10 | Taiar's islets | About 7 minutes at Wayfaring 1 |
| Cog | 2 | 13 | 19 | Antura's islets (and Taiar's, faster) | About 5 minutes at Wayfaring 13 |

- Two gates, as with a horse: Carpentry to build, Wayfaring to sail. The Carpentry levels are provisional, set by Carpentry's own ladder.
- "Cog", not "Cutter", which is an 18th-century word. Later boats could run Hulk, Caravel, Carrack.
- Later tiers take each tier's wood (Hatch from tier 3) and metal.

### Sailing one

- **Speed:** a boat's start and floor, closed by Wayfaring level as a mount's are. A better boat is faster; Wayfaring decides how much of that the sailor gets. **A better boat or a higher level changes speed only**, never what is found (Nathan, 2026-11-15).
- **Voyages are short** (Nathan, 2026-11-15, replacing "voyages are long"). Players will not wait an hour between islands. A crossing is the longest single journey in the game and is still minutes. An islet voyage is 2 to 4 minutes each way.
- **XP: close to a horse's** (Nathan, 2026-11-15). For the time spent, sailing pays Wayfaring at about what riding does, and **walking stays the best Wayfaring XP for the time spent**. Sim it at every Wayfaring level before it ships: travel XP is paid on base time while a boat's real time falls with level.
- A level that opens a boat says so (`services/unlocks.ts` needs a branch, or the level-up says nothing: CLAUDE.md §9).

### Building one (Nathan, 2026-11-15)

- **On a slip in a port, in steps, a piece at a time**, as a guild hall is raised. **Talador and Wendhaven each have a slip** (Nathan, 2026-11-15). The hull stands on the slip between sessions. Building pays Carpentry and reports `skillName: 'Carpentry'`; mallet and saw as for any build (`services/construction.ts`, never a copy). The guild hall's build code is made general and shared, never copied.
- **Each build action places 1 to 5 of the materials wanted** (Nathan, 2026-11-16), and a higher Carpentry level rolls the higher counts more often; the roll, its numbers, and the XP rule are in `docs/antura-plan.md` §6a. A Skiff is then about 1 to 2 hours of building and the Cog 2.5 to 5, where one item an action would have made them 4.3 and 10.4.
- **Rope is Nettle Cordage**, a new item twisted from Stinging Nettle (Bramble Thicket, Foraging 10, gloves), which until now went into one recipe. No cordage item existed. Proposed 2 nettles a cord. Nettle is about a fifth of the thicket's finds, roughly 24 an hour at base speed, so the Skiff's rope is about two and a half hours of foraging, near what its planks cost in chopping. Nathan: that is fine for rope.
- **Only the Cog has a sail**, of Linen Cloth, which gives the loom a real customer. The Skiff is rowed.
- **Materials** (agreed as decent starting amounts) and proposed pieces:

| Skiff | Lanai Planks | Ambren Nails | Other |
|---|---|---|---|
| Keel and ribs | 80 | 160 | |
| Planking | 140 | 300 | |
| Thwarts and oars | 30 | 40 | |
| Lines | | | 30 Nettle Cordage |
| **Total** | **250** | **500** | |

| Cog | Lanai Planks | Serph Nails | Other |
|---|---|---|---|
| Keel and ribs | 150 | 300 | |
| Planking | 300 | 650 | |
| Deck | 110 | 200 | |
| Mast and yard | 40 | 50 | |
| Rigging | | | 60 Nettle Cordage |
| Sail | | | 20 Linen Cloth |
| **Total** | **600** | **1,200** | |

For scale: a shop is 350 planks, 350 blocks, and 700 nails; a farmstead 500, 500, and 1,000. The Cog needs planks from Taiar and nails from Antura, so half of it comes over on the ferry whichever port it is built in. Check the linen: each cloth is three threads and each thread two lots of fibre, all from flax.

## 6. Exploring

The full plan is `docs/islets-plan.md`. What is settled (Nathan, 2026-11-15):

- **Each island has its own map of islets**, and each islet its own zoomed picture, which is where the player lands. Islets are fixed places.
- **Which islet is reached is pure chance.** No choosing one, and no near or far waters.
- **Some islets are reached more rarely and hold better things on average.**
- **What is on an islet is rolled each landing, for each player alone.** Players on one islet see each other and may find different things.
- **What is found is worked with the skill that owns it**, at that skill's normal XP, so a find is never a second supply of another trade's goods and never the way to train a skill. The reward is a boost to what the work can turn up besides.
- **Even a barren islet turns up something.**
- **In the first build:** something to work (trees, a vein, fish, plants and seeds, game), buried chests, creatures guarding loot, young animals of tier 1 and 2, flowers, a rare artefact for the museum, Quank, and nothing. Young may come from more places than Hunting and Trapping.
- **Later:** combination chests (an ordinary, regular find once built), a large source of Talar, a shipwreck that costs time and never the boat.
- **Dropped:** salvage lumber, and a unique resource for every skill.
- **Falling in a fight on an islet:** what is dropped is carried to the port the player sailed from.
- **Quank is found once on each island's islets and never there again.**
- **Antura's islets carry a quest series of Nathan's own.** Taiar's carry none.

## 7. The ship's log (wanted, Nathan 2026-11-06)

Every voyage writes its own record, so there is something to read at the end of it.

- A voyage is split into **watches**, one every minute or so. Each rolls once and writes a line: the wind and weather, a sighting, a find hauled aboard.
- **The log belongs to the sailor, not the boat** (Nathan, 2026-11-15), and is read in its own tab beside the travel log.
- Lines are content rows, written from inside the world (CLAUDE.md §2 and §10), several for each thing so a sailor does not read the same line twice in an evening.
- Settled on read, like a fight: the watches due are written when the voyage is next looked at or ends, never by a sweep ticking every boat.

## 8. What a crossing turns up (Nathan, 2026-11-15: mostly flavour text)

A crossing is for getting there. The islets are where things are found. So a crossing's watches are words in the log, not loot.

Agreed (Nathan, 2026-11-15), to fit how the land already works: a walker finds things on the road and a rider does not, and a sailor is paid as a rider is, so a crossing gives no ordinary finds. One exception keeps a long crossing from being nothing but waiting:

- **A rare sighting:** something vast under the hull, kept as a trophy, at a rate scaled to how often crossings happen (CLAUDE.md §8 trophy rates). A trophy already has a use: it is worn, and it sells to the pawnbroker.

Held back until something needs them: a message in a bottle (the natural carrier for a spell's writ, when a spell wants one found at sea), sea glass, ambergris. None ships without a real use.

## 9. Later, not now

- **The ship's hold:** a boat with storage, which moves goods between islands without trading them. It touches every storage rule and needs its own pass.
- **Fair winds:** a world event that shortens voyages from one port for an hour.
- **Weather that costs time:** only ever a delay that is told to the player. Nothing sinks.
- **Guildmates helping to build a boat.**

## 10. Build plan

Each step ends with Nathan testing. The first two need nothing from Antura, so sailing can be tried on Taiar in the alpha before the second island exists.

1. **Boats, and the Skiff.** `vessel_types` and `player_vessels`; the guild hall's build made general, and a slip at Talador built on it; the Nettle Cordage item and its recipe; the Skiff's rows; the `unlocks.ts` branch. Building moves items, so a race:check scenario, shown to fail first.
   **Built 2026-11-17** (migration `20261117140000_boats`): `vessel_types`, `player_vessels`, `vessel_builds` and `vessel_build_progress`, `locations.has_slip` (Talador); `services/boats.ts` (lay the keel, then pieces in order by the `vessel_build` action) on `services/builds.ts`, the turn the guild hall now shares; Nettle Cordage (Crafting 5, 30 s, 2 nettles; level and time proposed); the Skiff; the Carpentry branch in `unlocks.ts`; `SlipPanel.tsx` from Talador's location panel; race:check `boat`. Not yet: building for hire (`docs/antura-plan.md` §6b), retiring the unused `Sailing` skill row, and the boat's speed numbers, which come with step 2.
2. **Exploring Taiar.** Islets as places in Taiar's region; putting to sea and the chance of each islet; the landing, the strandline, and the finds that are work (stand, vein, shoal, patch, trail) with their boosts; the islet map filling in; the rule for falling on an islet; the boat's speed and XP, sim-checked against walking and riding.
   **First part built 2026-11-17** (migration `20261117150000_islets`, `services/voyages.ts`): the eight mock islets as places with no roads (`locations.islet_kind`, `islet_weight`; not `is_accessible`, so no minimap, merchant, event, or rumour picks them); putting to sea from a port in a boat the player owns, sailing on (up to three landings a voyage), and sailing home, each leg an ordinary `traveling` action marked `sea`; the strandline (`strandline_finds`, with words for one and many); islets found (`player_islets_found`); the voyage's words (`voyage_lines`, 43 lines to edit); a player away on an islet brought home on their next join. The Skiff's legs are 178 s at Wayfaring 1, 130 s at 50, and 122 s at 100 (speed 1.0 to 0.667 of a 180 s base). Wayfaring XP an hour at sea, against walking the same time: 1,638 against 2,554 at level 1, 2,243 against 4,807 at 50, 2,390 against 8,400 at 100, so walking stays the best for the time, and sailing sits near riding. **Finds, 2026-11-17** (migration `20261117160000_islet_finds`, `services/isletFinds.ts`): each landing rolls one find from what the islet holds (`islet_finds` by weight, `islet_find_kinds` for the amount and the boost, 3 for now); a work find is the best of its kind on the island that the player has the level for, theirs alone, lost on leaving. **The stand of trees is wired** (`services/woodcutting.ts`): 40 chops of that node, poor logs a third as likely and excellent three times, extras three times likelier (`rollSecondaryDrops` takes a boost), shown in the location panel with what is left; race:check `islet`. **The exposed vein is wired** (`services/mining.ts`): a real `ore_veins` row on the islet, private to its finder and never announced, 25 to 40 of the best ore on the island the player can mine, mined with the same ore's mainland node for timers and XP; dense ore from the first level at 5% before the boost (15%), and gems three times likelier; removed if the player sails off without finishing it. **The shoal is wired** (`services/fishing.ts` `waterFor`): 40 rod casts into the island's best water for the player's level, the better half of its fish three times as ready to bite, the heavier of two weights, salvage three times likelier, bait counted as used without being spent; nets refused. **The wild patch is wired** (`services/foraging.ts`): 40 searches of the island's best habitat for the player's level, notable finds three times likelier. **The game trail is wired** (`services/hunting.ts`): 15 hunts of the island's best quarry for the player's level, a miss a third as likely (93% hits on a Boar trail in testing, against 62% on the mainland), trophies three times likelier. Each takes its use off the find first in one conditional statement (`spendIsletFind`, proven by race:check `islet`), and each finds-first-discovery insert is now a no-op on a race. Still to build in step 2: the death rule (it matters only once islets hold fights, in step 3).
3. **The other finds.** Chests, guarded caches, young, flowers, artefacts and their museum exhibit, Quank.
4. **The ferry.** Needs Wendhaven to exist. `travel_type: 'sea'` and `ferry_fare`; the fare in the travel transaction; the Skiff's crossing; the `Sailing` row retired; a race:check scenario for paying the fare five times at once; the Manual's Travel page gains the sea.
5. **The Cog.** Needs Serph nails. Its rows, a slip at Wendhaven, Antura's islets.
6. **The ship's log**, in its own tab beside the travel log.
7. §9, as wanted.

## 11. Open

1. **The Carpentry levels** to build (10 and 19) are provisional.
2. **The boats' speed numbers:** each one's start and floor, to land on about 7 and 5 minutes and stay behind walking for XP.
3. **The islets:** how many, and the questions in `docs/islets-plan.md`.
4. **The ferry's master and any names** on the water. Nathan's.

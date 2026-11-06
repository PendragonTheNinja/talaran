# Sea travel: ferries, vessels and Wayfaring at sea

*Drafted 2026-11-05 with Nathan, answers added 2026-11-06. Status: design, not built. Decisions marked **(locked)** were made with Nathan; everything else is a proposal to react to. Section 11 lists what is still open.*

The second island needs a way across the water. This is how players get there, what owning a boat adds, and why none of it is a skill of its own.

---

## 1. The decision: no Sailing skill **(locked)**

Sailing is not a skill. **Every journey, over land or sea, pays Wayfaring.** Sea travel is a sub-system of Wayfaring the way riding is.

Why: a skill whose XP comes from waiting on a boat is the thin skill this game has already merged away once (Agility and Equitation became Wayfaring, `20261016130000`). Click-and-wait at sea would be the same thing a third time. The interesting parts of sailing are owning the boat, where it can take you and what you find on the way, and those all fit around the skill players already train by travelling.

Consequences:

- The unused `Sailing` row in `skills` (seed `01_skills.ts`, `type: 'utility'`, never implemented) is retired in step 1's migration. Nothing has ever paid it XP, so no player loses anything.
- CLAUDE.md's "Sailing will be its own skill" (§2 Husbandry, Mounts) is replaced by a pointer here.
- `services/travelEvents.ts` says "Wayfaring now; Sailing later": finds gain a travel mode instead (§6).

## 2. The shape of it **(locked)**

1. **The ferry: anyone can cross.** Paid passage from a port to a port. No boat, no level. Slower than sailing your own.
2. **Vessels work like mounts.** Carpentry builds them; Wayfaring level decides which you may captain. This is the mount pattern exactly: raised by one skill, used through another (`services/equipGates.ts`).
3. **Your own vessel is free to sail and faster**, and the better vessels reach places the ferry does not.

## 3. Where the world stands today

| Piece | What exists | What sea travel uses it for |
|---|---|---|
| `location_connections` | `from`/`to`, `base_travel_time`, `travel_type` (default `'walking'`), `required_skill`/`required_level` (road gates, already Wayfaring), `is_bidirectional` | A sea route is a connection with `travel_type: 'sea'`. No new table. |
| `computeTravelTime` (`services/travel.ts`) | Foot and mount curves: `fraction = floor + (start - floor) * rate^level` | A vessel has a start and a floor, as a mount does (§5). |
| Travel XP | `FOOT_XP_RATE` 0.7, `MOUNT_XP_RATE` 0.45 per second of base time, always on base, never on the shortened time | A third rate for sailing your own vessel, and one for the ferry (§4, §5). |
| `TRAVEL_EVENTS` (`services/travelEvents.ts`) | Region-keyed finds rolled per journey segment (daisies, Taiaria, Writ of Sending) | Sea finds, keyed by mode as well as region (§6). |
| `travel_log` | Every journey and its finds, with `skill_name` | Unchanged; sea journeys log with `Wayfaring` and the mode. |
| `locations.region` | The island | A new island is a new region; museums, guild halls and the Manual's island column already read it. |
| Talador | The first port city; ships "from distant lands dock here" in its own description | The Taiar end of the first ferry. |
| The Taiar map | Several small islets north-west, south-west and south-east that nothing uses | Boat-only places (§7). |

## 4. The ferry (step 1)

- **A sea route with a fare.** `location_connections` gains `ferry_fare` (whole gold, null where no ferry runs). Talador to the second island's port is the first.
- **Starting:** the travel route takes a mode, `'ferry'` or `'vessel'`, on a sea connection. The fare is taken in the same transaction as the travel insert, with the player row locked and a `gold_ledger` row (reason `ferry_fare`), as every gold write is (CLAUDE.md §4 rules 1, 3, 7). Not enough gold is a refusal before anything is written.
- **Time:** the ferry runs at a fixed share of the route's base time (`FERRY_FRACTION`, proposed 1.0: the base time is the ferry's time). Wayfaring, mounts, staffs and provisions do not speed a ship you are a passenger on.
- **Voyages are long** **(locked, Nathan 2026-11-06)**. Proposed: the ferry about 60 minutes from Talador to the second island; the Cutter about 45 at Wayfaring 13, falling towards 25 as Wayfaring rises.
- **XP: none** **(locked, Nathan 2026-11-06)**. A passenger is not sailing.
- **Gold sink:** the fare leaves the economy. **Not a ton, but never negligible** **(locked, Nathan 2026-11-06)**: set against `docs/economy-spec.md`, and checked with `reconcileGold()` after.
- **The ferry is slower than the Cutter** **(locked)**, so a vessel of your own beats it on both time and gold.
- **You cannot step off a boat.** Today an action is cancelled once its player has been away 30 minutes (`lib/presence.ts`), and a cancelled journey leaves you where you started. A sea journey is exempt: it completes, and you arrive. Otherwise an absent player loses the fare and the crossing both.
- **Your mount comes with you.** It stays worn (it is an item); you ride it again on landing.

## 5. Vessels (step 3)

### What a vessel is

Proposed: **a vessel is moored, not carried.** It is a row (`player_vessels`: owner, vessel type, where it is moored) at a port, never a stack in your pack. A rowing boat in a backpack is the ingots-in-a-barrel problem again. It sails with you and stays moored where you land. Walk or take the ferry back without it, and it waits where you left it; the harbour lists it.

Vessel types are rows (`vessel_types`: name, tier, `wayfaring_level`, `travel_speed_modifier` and `travel_floor` like a mount's, which sea routes it may take, build inputs), so a new boat is content, not code.

### Building one

- **Carpentry builds vessels, at a shipwright's slip in a port** (a workstation type, `'shipwright'`). Building pays Carpentry and reports `skillName: 'Carpentry'` (CLAUDE.md §2 Property). The mallet and saw check is `services/construction.ts`'s, never a copy.
- **Inputs cross the trades:** planks of the vessel's tier (Woodcutting, Carpentry), nails (Smithing), rope from plant-fibre cordage (Foraging), and sailcloth woven from linen at the spinning wheel and loom (Foraging's flax, the textile station). A boat is a thing a guild builds together, which is the point of guilds (Manual, Guilds).
- Proposed: a vessel is one long build, a timed action like establishing a farmstead, with the inputs taken at start through `takeItemsWithin`.

### Captaining one

- **Wayfaring gates the vessel** (`vessel_types.wayfaring_level`), as it gates mounts. A level-up that opens a vessel says so (`services/unlocks.ts` needs a branch, or it says nothing: CLAUDE.md §9).
- **Speed:** a vessel's start and floor, closed by Wayfaring level on `MOUNT_RATE`, exactly as a mount's are. Better vessels end up faster; Wayfaring decides how fast you get there.
- **XP: priced as passive work.** A voyage is long and finishes while you are away (§4), so it is one click for an hour of sailing. Price the attention, never the clock (CLAUDE.md §8): proposed the passive policy (about 0.3 of walking's rate per base second) or a flat amount per voyage, sim-checked against `docs/xp-rebalance.md` before it ships. Walking's 0.7 at sea would be about 2,500 XP for one click an hour.

### A first ladder (proposal)

| Vessel | Wayfaring | Built from | Reaches |
|---|---|---|---|
| Skiff | 1 | Lanai planks, cordage | Coastal routes and the near islets of Taiar |
| Cutter | 13 | Hatch planks, nails, cordage, sailcloth | The second island, and its islets |
| Later tiers | 25, 37, ... | Each tier's planks and better cloth | Each further island |

The ferry always reaches every inhabited island's port, so no island is ever locked behind a level. What a vessel adds is speed, no fare, and the places the ferry does not go.

## 6. The ship's log **(wanted, Nathan 2026-11-06)**

Every voyage writes its own record, so coming back to a finished voyage has something to read.

- A voyage is split into **watches** (proposed every 10 minutes of the voyage's time). Each watch rolls once and writes a line: the wind and weather, a sighting, a find hauled aboard (§7), now and then a squall that costs time and says so.
- Proposed: **the log belongs to the vessel** (`vessel_log`: vessel, voyage, watch, line, any find), so it is the ship's own history, whoever was captain. Ferry passengers get their voyage, finds and all, in their ordinary travel log (`travel_log`).
- Watch lines are content rows (`voyage_lines`, by kind and region), written from inside the world, never hard-coded (CLAUDE.md §2, §10).
- Settled on read, like a fight: the watches due are written when the voyage is next looked at or completes, never by a sweep ticking every boat.

## 7. Sea finds (step 2)

- `TRAVEL_EVENTS` entries gain a `mode` (`'land'` or `'sea'`, default `'land'`); the roll picks only finds for the journey's mode and region. A ferry rolls sea finds too, at a lower rate than captaining your own vessel, as a rider finds less than a walker.
- **Sea finds must not be a second supply of another trade's goods.** Fishing owns salvage (`fish_species` kind `salvage`); driftwood would undercut Woodcutting. Sea finds are their own things. Proposals:
  - **Message in a bottle:** a curio; some carry a writ, as the Writ of Sending is found on the road (a spell-learning route that sends players to sea).
  - **Sea glass:** a rough piece the lapidary can polish, a small new input for jewelry, never a substitute for a mined gem.
  - **Ambergris:** rare, sells only to the pawnbroker.
  - **A sighting:** something vast under the hull. A trophy at ~0.3% per crossing, scaled to how often crossings happen (CLAUDE.md §8 trophy rates).
- Every find's flavour lines are written from inside the world (CLAUDE.md §10). No em dashes.

## 8. Boat-only places (step 4)

The small islets on the Taiar map are unused. The skiff exists only if they are worth reaching (Nathan, 2026-11-06), so each one gets one reason to go, chosen from:

- **Offshore fishing grounds:** species only found in deep water.
- **A shore habitat for Foraging:** rock pools, samphire for Cooking. No feathers (CLAUDE.md §2 Materials).
- **A hermit or a lighthouse keeper** with a quest.
- **A creature found nowhere else**, with its own Bestiary entry.
- **A sea cliff** with a rare mining node, at tier 1 or 2 (Taiar hosts nothing above T2).

How each is reached:

- A sea route to an islet with no ferry (`ferry_fare` null), gated by vessel.
- Each islet is a small location with one reason to go: a deep-water fishing spot (a Fishing tier tie-in), a rare forage, a creature that lives nowhere else, a ruin with a quest giver (quests are found by exploring, CLAUDE.md §9).
- Islets belong to their island's region, so their museum and Manual pages are the island's own.

## 9. Later, not now

- **The ship's hold.** A vessel with storage: a `player_properties` row whose location is wherever the vessel is moored. It moves goods between islands without trading them, which makes hauling a thing to do. Big enough to need its own pass, and it touches every storage rule (CLAUDE.md §2 Property, §4).
- **Fair winds.** A world event of a new kind that shortens sea journeys from one port for an hour, through the existing scheduler (`services/worldEvents.ts`, admin Events tab).
- **Weather that costs time.** Only ever as a delay that is told to the player, never a loss (nothing dies, nothing sinks).

## 10. Build plan

Each step ends with Nathan testing.

1. **Sea routes and the ferry.** `travel_type: 'sea'` and `ferry_fare` on the Talador route; the ferry mode in the travel route and tick (fare in the travel transaction, fixed time, `FERRY_XP_RATE`, exempt from the absence cancel); the second island's port as a location in its own region with its map; the `Sailing` skill row retired; a race:check scenario for paying the fare five times at once; Manual page (Travel and Mounts gains a sea section). **This alone opens the second island.**
2. **Sea finds.** `mode` on travel events; the first finds for the crossing; their items and museum places.
3. **Vessels.** `vessel_types` and `player_vessels`; the shipwright's slip and its build action; captaining gated by Wayfaring; the vessel curve and `VESSEL_XP_RATE`, sim-checked; the harbour listing what is moored there; `unlocks.ts` branch.
4. **Boat-only places.** The first islets as locations, their routes, and one reason to visit each.
5. **The rest of section 8,** as wanted.

## 11. Open questions for Nathan

1. **Moored, or carried?** Section 5 proposes vessels moored at a port. Nathan is polling the players (2026-11-06).
2. ~~Does the ferry pay Wayfaring?~~ No (locked).
3. **The fare:** not a ton, never negligible (locked); the exact figure at build time.
4. **Voyage lengths:** proposed in §4; and voyage XP priced as passive (§5).
5. **The islets:** which reasons from §8, on which islets. The skiff stands or falls on these.
6. **Names:** the second island, its port, the ferry and its master. To come from Nathan.

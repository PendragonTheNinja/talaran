# World Events and Island Museums: design

**Status:** step 1 of the build order is built (2026-09-30): the events core, the roster, the XP bonus, the Events panel and nav button. Steps 2 to 5 are not. The one remaining choice is marked **Q**.

**One refinement made while building step 1:** the bonus is applied inside `awardXp`, the game's one XP writer, not at each action's XP call (there are 37 of them, most without their location). The place is where the player stands when the XP lands. A bulk action (Harvest All, Feed All, Tend, Muck All, Collect All, Slaughter All) takes one unit per thing it did (plots, pens, animals); when fewer are left, only that share of its XP is raised. A juvenile's growing-up XP is never raised and takes nothing: it pays for time passing, not for an action.

Both systems are built on what Talaran already has rather than beside it: islands are `locations.region`, announcements go through the existing server channel (`services/records.ts`, the same path as the firsts feed), rewards come from feats, and every item move goes through the locked helpers in `services/inventory.ts`.

---

## Part 1: World Events

### What a player sees

- **The Events button** (top navigation, currently dead) opens an Events panel: what is happening now, when the Travelling Merchant is next due, and what ended in the last day.
- **Each live event** shows where it is, what it favours, a countdown, and how much is left ("Bountiful Shoal at Luxmere · +25% Fishing XP · 1 h 12 min · 212 of 400 catches left").
- **When an event starts**, one line in the server channel, like a world first: *"A bountiful shoal has come into Luxmere. Fishing there earns a quarter more experience while it lasts."* No banner, no sound.
- **At the event's location**, the location panel shows it, and every boosted action says so in its result line, beside the normal XP: "+40 Cooking experience (+10 event), 43,952 total."

### How events happen

- **On their own, at random.** A scheduler checks once a minute. There is no timetable: an event is something you come across, or hear about in chat and travel to.
- **Frequency is one setting,** adjustable in the admin panel. Default: **one new event every three hours on average**, across all types.
- **Rarity** sets how often each type is picked, and rarer events last longer:

  | Rarity | Weight | Length | Pool |
  |---|---|---|---|
  | Common | 6 | 1 to 2 hours | 300 to 500 actions |
  | Uncommon | 3 | 1½ to 2½ hours | 200 to 300 actions |
  | Rare | 1 | 2 to 3 hours | 100 to 200 actions |

  Every number here is a default, stored per type and editable in the admin panel.
- **Limited twice over.** A time window **and** a pool of actions shared by everyone there; the event ends at whichever runs out first. The more people come, the sooner it is gone: that is what makes it worth hurrying for, and it keeps the reward bounded.
- **Spacing:** at most a few events at once (a setting, default 3), never two for the same skill or the same location, and a cooldown per type so one does not repeat back to back. Events started from the admin panel ignore all of this.

### What an event does

- **Skill events:** that skill's actions, completed at that location while the event is live, earn **+25% XP** in that skill (the multiplier is per type, editable). Only that skill's XP: not the Exploration XP some actions also give, and items and gold are unchanged.
- **Each boosted action uses one from the pool** (a bulk action, one per plot, pen or animal). Decided when the action completes: an action started just before an event, finishing during it, counts; idle repeats count. When the pool is empty the bonus stops for everyone at once.
- **Food buffs** speed actions up, raise rare odds or double output; none touches XP, so nothing stacks awkwardly. A faster buff simply spends the pool faster.

### The roster (first version)

Every skill whose actions happen at a shared place. Each event happens at a real location that already has that skill's work, picked at random from the eligible ones.

| Event | Skill | Rarity | Where |
|---|---|---|---|
| Bountiful Shoal | Fishing | Common | a lake or coast spot |
| Windthrow | Woodcutting | Common | a forest |
| Rich Seam | Mining (rocks and veins) | Common | a mine |
| Wild Bloom | Foraging | Common | a foraging spot |
| The Herd Passes | Hunting (hunting and trapping) | Uncommon | a hunting ground |
| Fair Growing Weather | Farming | Uncommon | Novita |
| Good Grazing | Husbandry | Uncommon | Novita |
| Master Smith Visiting | Smithing (smelting, smithing, kiln) | Rare | a town with a forge |
| Joiners' Fair | Carpentry (sawing, woodworking) | Rare | a workshop location |
| Craftsfolk Gathering | Crafting | Rare | where crafting stations are |
| Feast Day | Cooking | Rare | where cooking is done |

- **Processing events are rare on purpose.** Processing can be stockpiled for: a player holding a thousand bars will spend a whole pool alone. Rare and place-bound keeps them special.
- **Travel skills later.** Exploration, Equitation and Agility are earned on journeys, not at a spot, so they would be a different kind of event ("fair winds on the roads out of Talador"). The system is built to take new kinds; this one comes after.

### The Travelling Merchant

- **Once a week, a random location.** He arrives unannounced at a random place for a day (length adjustable), and a line goes out in chat.
- **He sells what that place yields,** drawn at random from the resources found there (its trees, rocks, ores, fish, forage, game), so his stock needs no upkeep and changes with where he lands.
- **Plus an extras list** you edit in the admin panel: anything added there can turn up in his stock wherever he is. That is where unique items go, once there are some.
- **Limited for the whole server:** "12 Oak Logs, 3 Dense Burgh Ore", then gone. Sold at the usual merchant markup (`buyPrice`). Buying is a locked decrement, so two players never both buy the last one.
- **Summon him** from the admin panel at any time, to any place.

### Admin: an Events section

Everything above is adjustable from the panel, without a deploy:

- **Live events:** see every running event, then extend or shorten it, refill or change its pool, change its bonus, rewrite its announcement, or end it now.
- **Start an event:** any type, anywhere, with any length, pool and bonus, on top of whatever is running; or a **one-off** with its own name, skill, place, bonus and announcement lines.
- **The roster:** every type's name, skill, rarity weight, length and pool ranges, bonus, allowed places and announcement lines; switch any type on or off; add new types.
- **The scheduler:** on or off, the average gap between events, how many at once, the cooldown per type.
- **The merchant:** when he is next due, summon now, how long he stays, how much he carries, and the extras list.
- **History:** every past event, how it ended (time, pool, admin), and how many actions it paid out.

### Invasions, later

A future `invasion` kind in the same system and panel. Each kind brings its own effect; nothing here needs changing for it.

### How it is built

- **The event types are data, not code,** so the panel can edit them: a `world_event_types` table (seeded with the roster above, snapshotted like other content). What each *kind* does (skill boost, merchant, later invasion) is code in `services/worldEvents.ts`.
- **Tables:** `world_event_types` (the roster), `world_event_settings` (one row: frequency, limits, merchant schedule), `world_events` (each event: type, kind, place, skill, bonus, pool total and left, start, end, how it ended, who started it, its announcement), `world_event_stock` (the merchant's limited stock per visit), `merchant_extra_goods` (the extras list).
- **One call, inside `awardXp`:** `applyEventBonus` takes `units` from the pool in one locked statement (fewer if fewer are left) and returns the XP with that share raised, or untouched when there is no event or the pool is empty. `awardXp(…, { units })` passes the count from bulk actions; `{ eventBonus: false }` opts an award out. The bonus is noted once the award commits, and the tick's one emit point adds it to the result as `eventXp` for the result line.
- **Routes:** `GET /api/events` (live, recent, merchant due), merchant buy, and the admin set.
- **Client:** an `EventsPanel` like the other panels, the nav button wired to it, the location marker, and the admin Events section. A socket `world_events_changed` keeps them current.
- **Tested** like everything else: `race:check` scenarios for the shared pool (many players on the last few actions: exactly the pool's size is paid) and the merchant's last item.

---

## Part 2: Island Museums

### The shape: personal collections, a shared record

- **Everyone fills their own collection**, for as long as they play. Someone who joins in a year has the same goal as the first players.
- **Every case names who got there first.** The first person to donate an item has their name on that case's plaque for good, and it goes out through the firsts feed: *"Pendragon is the first to give a Dense Ambren Ore to the Taiar Museum."*
- **The museum shows the island's progress:** how many islanders have completed each exhibit.

### What a player sees

- **The Taiar Museum, in Talador** (see Q below). Talador is where every new character starts and where the trading post is, so it is already the island's gathering place.
- **Exhibits** group the island's items by kind ("Ores of Taiar", "Fish of the Coast", "Hedgerow and Herb", "The Smith's Work"). Each exhibit is a wall of **cases**, one item each.
- **Every case starts as a silhouette:** the item's own shape, in black. It fills in with the real image once you have given yours. The first donor's name and date sit beneath it. No new images are needed: all 276 item icons have transparent backgrounds, so one CSS filter draws each silhouette from the icon itself, and every future item works automatically.
- **Donating** gives one of that item from your pack. You give each item once. Donated items are gone: the museum is a sink, and a reason to keep, or go and find, the things nobody bothers with (the despawn tally will show which).
- **The reward is the whole museum:** completing every case earns **Curator of Taiar**, a title and a badge. Exhibits have no reward of their own (some are small and quick), but show their completion, and the island's.

### Which items go where

- **Every item found on Taiar, or first found there, belongs to the Taiar Museum.** Today that is every obtainable item, so the museum starts with all of them, grouped into exhibits by kind.
- **New items place themselves.** When an item is found for the first time anywhere (the moment the firsts feed already announces), it is added to the museum of the island it was found on. A second island's items land in its own museum without anyone listing them.
- **You can move or remove any case** in the admin panel: the placement is content, like the rest.
- **Not displayed:** inactive items, gold, and quest-only items.

### How it is built

- **Content tables** (snapshotted, editable in the admin panel): `museums` (island, name, town), `museum_exhibits` (museum, name, order), `museum_cases` (exhibit, item, order; an item is in at most one museum).
- **State table:** `museum_donations` (player, case, when), one per player per case.
- **Donating** is one transaction: take the item (`takeItemsWithin`) and record the donation, with the case row locked so exactly one donor is ever first. Announced after it commits.
- **Curator of Taiar** is a feat with a new criterion kind, `museum_complete`: every case in that museum donated. Titles and badges then work exactly as today.
- **Tested:** a `race:check` scenario for two donations of the same item at once (one taken, one refused, one first donor).

---

## Build order

1. **Events core:** tables and the seeded roster, the scheduler, the bonus in `awardXp`, the Events panel and nav button.
2. **Admin Events section:** live events, starting and one-off events, the roster, the scheduler.
3. **Travelling Merchant:** weekly visits, stock from the location plus extras, buying, admin controls.
4. **Museum:** tables seeded with every current item, donating, silhouettes and plaques, island progress, new items placing themselves.
5. **Curator of Taiar:** the feat.

Each step ships on its own and is proven like the rest.

## Still open

- **Q: the museum's town.** Talador is the proposal (where everyone starts, and the trading post). Say if another town suits it better.

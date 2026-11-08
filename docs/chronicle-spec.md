# The Chronicle: spec

*Drafted 2026-11-03 with Nathan. Status: design, not built. Decisions marked **(locked)** were made with Nathan; everything else is a proposal to react to.*

Talaran writes its own history. A bard in a Talador tavern keeps the island's tidings: every game day, the most remarkable things real players did are set down in her voice as one page, frozen at midnight and kept forever. The book of pages can be read from the first day onward, in game and on the public site.

---

## 1. Locked decisions

- **The bard is Wenna Halloway** **(locked)**, keeper of the tidings, in a tavern in **Talador** **(locked)**.
- **Updates are "Word from the Maker"** **(locked)**: the creator is *the Maker* in her mouth.
- **A day is a game day** **(locked)**: the Eastern day of `lib/gameTime.ts` (`gameDayKey`, `startOfGameDay`, `nextGameMidnight`), the same day the clock, chat reset and merchant allowances use. Pages are headed with the Eastern date ("the 4th of November").
- **There is a public page** **(locked)**: `talaran.net/chronicle`, no account needed.
- **Feat for being named; a title for ten different days** **(locked)**.
- **Guild ballads** **(locked)**.
- **Rumours only when true** **(locked)**: never forced; no secret left means no rumour.
- **Built to hold up at hundreds of players** **(locked)**: see §10.
- **She should never repeat a verse** **(locked as the goal)**: see §8.

---

## 2. What a player sees

### The tavern
A new place-action in Talador, listed like the Tally Board: **The Salty Sloth →** **(locked)**. It opens the **Tavern panel**, one modal with tabs (CLAUDE.md §7):

| Tab | What it holds |
|---|---|
| **Wenna** | Her greeting, then **today's tidings so far**: the three or four best deeds of the day up to now, in her voice, changing through the day, **with no names** **(locked)**: "Somebody brought a Squonk's tears out of the Lanaivale mire this morning. You'll hear who tomorrow." Names are kept for the page, so reading it the next day is where you see it all. Below, yesterday's headline as a teaser for the book. |
| **The Chronicle** | The book (below). |
| **Ballads** | Commission a guild ballad (§9), and the ballads your guild has had. |

Wenna also stands among Talador's people, with ordinary dialogue rows; one option opens the panel.

### The book
- Opens on the newest finished page. Arrows step day by day; a date picker jumps anywhere.
- **"Days I was named"**, and the same for any player or guild by name: a list of dates, each opening that page with the line highlighted.
- Every name on a page links to that player's profile (in game) or nothing (public page).
- The first page ever written is a real page too: "The first day the tidings were kept."

### Elsewhere
- **World chat, at each game midnight:** one server line, "Wenna has set down the tidings for the 4th of November." Clicking it opens the book on that page.
- **Named players** get a small notice ("Wenna sang of you in yesterday's tidings") and, if they choose it, a push notification (new type `chronicle`, off by default).
- **Public `/chronicle`:** the same book, read-only, linkable per day (`/chronicle/2026-11-04`). It must use plain `fetch`, never `apiFetch` (CLAUDE.md §7: `apiFetch` answers a 401 by sending the browser home).

---

## 3. A page

Pages are built from sections, in this order. Every section is optional except the heading and the sign-off.

| Section | Size | What goes in |
|---|---|---|
| **Heading** | 1 line | "Tidings for the 4th of November, as told at the Salty Sloth." From a template, so it varies. |
| **The headline** | 1 or 2 lines | The day's rarest deeds, if any clear the headline threshold. |
| **Around the island** | up to 8 lines | The next best deeds, **at most one line per player per page** (headline included). |
| **From the guilds** | up to 3 lines | Halls raised, event wins, ballads. |
| **Of the fallen** | up to 2 lines | Deaths worth telling (§6, deaths). |
| **Word from the Maker** | 0 or more | One line per news post published that game day (§7). |
| **The long roll** | up to 40 names | Everyone else who did something notable that day, briefly: "Also seen at their work: Ellis, Corwin_the_Long, Wren and 12 others." |
| **A rumour** | 0 or 1 | §8, only when true. |
| **Sign-off** | 1 line | From a template. |

A quiet day (fewer than four scoring deeds) gets a short page in her voice rather than inflated small news.

**Why the long roll:** at 300 players the eight lines above it are a small share of the island, which is what keeps the headline special. The roll is where most people are named on any given day. Being *in the lines* is the feat; being *in the roll* is still being in the book.

---

## 4. The deed journal

Each place in the code where something worth singing about happens calls one helper:

```ts
// services/chronicle.ts
noteDeed(x, {
    kind: 'drop_rare',           // a chronicle_deed_kinds key
    playerId,                    // or null for world deeds
    guildId?,                    // when the deed is a guild's
    subject?: 'Squonk Tears',    // what it is about: item, creature, skill, place
    data?: { place: 'Lanaivale', chance: 0.5 },   // the numbers the verse needs
})
```

Rules (CLAUDE.md §4):
- **After commit, never inside the action's transaction.** Given a `trx` it uses `afterCommit(trx, …)`; given `db` it writes at once. A rolled-back action leaves no deed.
- **Never throws.** A failure is logged and dropped; no action ever fails because the Chronicle could not write.
- **One cheap insert.** No reads, no scoring. Scoring happens once, at composition.
- **Stamped with `day_key`** (`gameDayKey()` at the moment of the deed), so the day a deed belongs to never depends on when the page is written.
- **Opt-out respected at write time:** a player with `player_settings.chronicle_opt_out` writes no deeds (§11). Guests write none except the newcomer count. **And again at composition:** guild deeds name the member in `data.byPlayerId` rather than `player_id` (so a guild's deed is not lost when that member opted out), and anyone opted out by then is left unnamed on the page.
- **Built (step 1, 2026-11-03):** `services/chronicle.ts` (`noteDeed`, `noteFinds`, `noteEventWinners`), hooks in the tick's completion (rare finds, trophies, world firsts), `awardXp` (milestones, mastery, total level), `claimSkillMilestone`, fishing records, the fight settle (first kills, strong kills, bestiary marks, deaths), museum gifts, events ending, the travelling merchant, guild founding and hall tiers, new characters, guest claims, mounts, the twentieth field and trap collection. Admin panel > Chronicle shows the journal by day and exports CSV.

---

## 5. Deed catalogue

`chronicle_deed_kinds` holds one row per kind: `key`, `section`, `base_weight`, `enabled`, `max_per_page`, `label` (for the admin panel). Weights are knobs, tuned from the admin panel without a deploy.

"Source" is where `noteDeed` is called. **Has data** = the game already records this event somewhere, so the hook is a one-line addition next to existing code.

### Finds and craft
| Kind | Source | Has data | Base | Notes |
|---|---|---|---|---|
| `drop_rare` | `rollSecondaryDrops` in `services/drops.ts`, when `notable` | yes | 10 | Rarity from the entry's real chance (§6). |
| `cryptid` | needs a data flag first (no row marks a cryptid today, and CLAUDE.md §2 forbids inferring it) | no | 60 | Until then Squonk Tears arrives as a `trophy` (its item subtype) and its rarity lifts it at scoring. |
| `world_first_item` | `recordItemFirst` in `services/inventory.ts` (`firstInWorld`) on a secondary drop | yes | 80 | Already announced in chat by `announceWorldFirstDrop`; the Chronicle tells it properly. |
| `trophy` | trophy drops (hunting, trapping) | yes | 25 | |
| `record_fish` | `recordCatch` in `services/fishing.ts` (`newHeaviest`) | yes | 15 | Server-wide heaviest only; a personal best is not news. |
| `gem_best_grade` | `resolveRecipe` graded output, best grade | yes | 12 | |
| `first_craft_tier` | `craftItems`/`resolveRecipe`, first time anyone on the server makes a T3+ item | partly | 40 | Needs a "first made" check; `item_firsts` covers drops, not crafts. |

### Progress
| Kind | Source | Has data | Base | Notes |
|---|---|---|---|---|
| `server_first_level` | `claimSkillMilestone` in `services/records.ts` | yes | 70 | First on the server to 25/50/75/100 in a skill. |
| `level_milestone` | `awardXp` in `services/xp.ts` (`leveledUp`), at 50, 75, 90 | yes | 6 | Level 100 is its own kind. |
| `level_max` | same, level 100 | yes | 90 | Always headline. |
| `total_level_mark` | same, crossing each 250 of total level | yes | 15 | |
| `feat_rare` | `evaluateFeats` in `services/feats.ts` (returns new feats), hidden feats and the hardest tiers only | yes | 20 | A `feats.chronicle` flag picks which. |
| `quest_first` | quest completion in `routes/quests.ts`, first on the server to finish that quest | partly | 25 | |
| `newcomers` | `setUpNewPlayerWithin` in `services/newPlayer.ts` | yes | 3 | Rolled up into one line: "Seven strangers came ashore." No names. |
| `guest_claimed` | `POST /upgrade` in `routes/auth.ts` | yes | 4 | Rolled up like newcomers, or named if few. |

### Fighting
| Kind | Source | Has data | Base | Notes |
|---|---|---|---|---|
| `first_kill` | `afterFight` in `services/combatFights.ts`, first kill of a creature on the server | yes (`player_creature_kills`) | 50 | |
| `strong_kill` | same, creature's level well above the player's combat level | yes | 12 | Scaled by the gap. |
| `bestiary_mark` | same, 250th and 1,000th kill of one creature | yes | 15 | Matches `BESTIARY_STEPS`. |
| `death` | `dropEverythingWithin` in `services/groundItems.ts` (with the killer from the fight) | yes | 5 | Only when it is a story (§6). |

### The world
| Kind | Source | Has data | Base | Notes |
|---|---|---|---|---|
| `museum_first_give` | `donate` in `services/museum.ts`, first to give that item | yes | 12 | |
| `exhibit_complete` | same, last case of an exhibit filled | yes | 45 | |
| `event_winner` | `endExpiredEvents` in `services/worldEvents.ts`, from `world_event_participation` | yes | 20 | Top player and top guild. Guild part goes to From the guilds. |
| `merchant_arrived` | `services/travellingMerchant.ts` arrival | yes | 8 | World deed, no player. |
| `road_first` | first on the server to walk a road (`player_exploration`) | yes | 30 | |

### Homestead and trade
| Kind | Source | Has data | Base | Notes |
|---|---|---|---|---|
| `mount_raised` | husbandry, a mount leaving the pen | yes | 15 | Higher tiers weigh more. |
| `field_twenty` | `farming.ts` build plot, the 20th field | yes | 15 | |
| `shop_big_sale` | `buyFromShop` in `services/shops.ts`, a single sale far above the day's median | yes | 6 | |

### Guilds
| Kind | Source | Has data | Base | Notes |
|---|---|---|---|---|
| `guild_founded` | guild creation route | yes | 10 | |
| `guild_hall_tier` | `resolveBuildCycle` in `services/guildHall.ts`, a tier finished | yes | 35 | |
| `guild_ballad` | §9 | new | (always) | Not scored; a paid ballad is always sung. |

That is about 30 kinds at launch. New kinds are a row plus a `noteDeed` call plus verses; nothing in the composer changes.

---

## 6. Scoring

For each deed of the day:

```
score = base_weight(kind)
      × rarity(deed)            drops: 1 + log10(1 / chance); others: 1
      × magnitude(deed)         levels by tier of milestone, record margin, kill gap, mount tier
      × personal_damp           0.5 ^ (n - 1) for a player's nth deed of the day, best first
      × freshness               0.5 if the same player had the same kind and subject yesterday
      × jitter                  0.9 to 1.1, seeded by day_key + deed id (never Math.random())
```

- **Server firsts** carry their weight in `base_weight` (70 to 90), so they beat almost anything else.
- **Deaths are only told when they are a story:** to a creature well above the player, to a named creature (Ol' Shellback), a player's first death, or a heavy loss. Never the same player in Of the fallen twice in three days, never mocking in tone, and the verses for it are written with care.
- **Rolled-up kinds** (newcomers, guest claims) are counted, then become one deed with `n`.
- The **headline threshold** is a knob: a score above it is headline-eligible; at most two make it.

The jitter is seeded, so composing the same day twice gives the same page (useful for an admin dry run, §12).

---

## 7. Word from the Maker

- `news_posts` gains `chronicle_line` (nullable text). The news editor gets one optional field: *"Wenna's line"*.
- A news post published on a game day puts a line under **Word from the Maker** on that day's page: the post's `chronicle_line` if written, else a verse of kind `maker_generic` ("Word came from the Maker, and the island is not quite as it was this morning.").
- These lines are never scored and never capped by the other sections.

---

## 8. Verses

### Templates are rows
`chronicle_verses`: `id`, `kind`, `text`, `min_n`/`max_n` (optional number guards), `needs` (slots the deed must carry), `enabled`, `added_at`. Edited from the admin panel like other content (CLAUDE.md §2: text is content). Verse text follows CLAUDE.md §10 in full: no em dashes, nothing banned, written from inside the world.

**Slots:** `{player}`, `{guild}`, `{tag}`, `{members}`, `{item}`, `{a item}` (with a/an), `{creature}`, `{a creature}`, `{place}`, `{place2}` (the far end of a road), `{skill}`, `{level}`, `{n}`, `{weight}`, `{quest}`, `{museum}`, `{exhibit}`, `{date}`, `{names}` (the long roll's list, ending "and N others" past the cap). A verse whose `needs` the deed cannot fill is skipped.
**Alternates:** `[cold|grey|slate-coloured]` inside a template picks one, seeded by the day and the line's position. A template with two alternate groups of three is nine sentences.

### Today's tidings, without names
The Wenna tab speaks before the page is set and names nobody, so it draws on its own verses: kind `today:<deed kind>` (`today:drop_rare`, `today:death`, …). They may use every slot except `{player}`, `{guild}` and `{tag}`; the composer refuses a `today:` verse that contains one. A deed kind with no `today:` verses yet is simply left out of the tab.

### Never repeating
- `chronicle_verse_uses` records (verse id, day_key, rendered text hash).
- For each line, the composer picks among the kind's verses **not used in the last `cooldown` days**, where `cooldown` grows with the kind's verse count (half the count, at most 60 days), least recently used first, ties broken by the seeded jitter.
- Within one page no verse appears twice.
- If every verse of a kind is on cooldown, the least recently used is taken and the admin panel's verse view flags the kind as **thin**. That flag is the to-do list for writing more.

### Target counts before launch
- Common kinds (`drop_rare`, `level_milestone`, `death`, `strong_kill`, heading, sign-off): **25 or more each**.
- Uncommon kinds: **10 or more**.
- One-off kinds (`level_max`, `exhibit_complete`, `world_first_item`, `server_first_level`): **10 or more**; each is rare enough that ten with alternates will not repeat for a long time.

§14 is the first batch.

---

## 9. Guild ballads

- Commissioned at the tavern's **Ballads** tab by a member whose rank has `post_news` (§ guild ranks; Officers by default).
- **Who pays** **(locked)**: a guild with a hall pays from its storehouse gold, which also needs the commissioner's rank to hold `withdraw_gold`, with a `guild_storage_ledger` row like any withdrawal. A guild with no hall yet pays from the commissioner's own purse (a `gold_ledger` row), so small guilds are not shut out.
- **Price: 10,000 gold** **(locked)**, a knob (`chronicle_settings`) changeable without a deploy. Against the economy rules (CLAUDE.md §8): selling everything gathered earns about 9% of XP per hour in gold, so at level 30 (about 4,000 XP an hour) a player makes up to 400 gold an hour. 10,000 is about 25 hours of one player's full earnings, or two to three hours each across a ten-member guild, once a week at most.
- **One ballad per guild per seven game days.**
- The verse is built from the guild's real numbers: hall tier and island, member count, best skill by total XP, event wins, kills, deaths. Templates of kind `ballad` with guild slots.
- It is sung in **From the guilds** on the next page (not scored, at most two ballads a page; a third waits a day) and kept on the guild's own page.
- Moves gold, so it gets a `race:check` scenario (CLAUDE.md §3): two parallel commissions must charge once.

---

## 10. Scale

**Deed volume at 300 players, 8 hours a day:** level-ups are the biggest source (a few thousand a day across the island), then notable drops (one to three thousand), then everything else (hundreds). Under 20,000 rows a day. One insert each, after commit: negligible next to the work that earned them.

**Composition** runs once per game day: one indexed read of that day's deeds (`day_key`), scoring in memory, selection, rendering, a handful of inserts. Under a second at that volume.

**Reading** never computes anything: a finished page is a stored row. Today-so-far (the Wenna tab, no names) is computed from today's deeds and cached for 60 seconds, shared by everyone.

**Growth:** deed rows older than 30 days are trimmed (the pages keep everything that was sung). Pages, lines and mentions grow by roughly 60 rows a day, which is nothing for decades.

**Fairness at scale:** one line per player per page; the long roll names up to 40 more and counts the rest; personal damping stops a heavy player's tenth find from outranking someone else's first.

---

## 11. Rules and care

- **Opt out:** Settings > Game, "Keep my name out of the Chronicle". On by default for nobody. Takes effect for deeds from then on; past pages are history.
- **Guests:** never named. Counted among newcomers.
- **Names are as they were:** a line stores the rendered text and the player's id. A later rename does not rewrite history; the link still finds them.
- **Banned players:** their deeds stop being written from the ban on. Old lines stay unless struck.
- **Striking a line:** staff (`can_moderate_chat`) can strike one line from a page (an offensive name, a mistake). It is replaced with "a line here was struck from the book" and logged. Pages are otherwise never edited.
- **Lore rule:** nothing she says names what lies under the Rift. It is "the light".
- **The composer never invents.** Every line is a template filled with a recorded deed. No generated prose.

---

## 12. Data model

All created unconditionally in one migration; content (kinds, verses, the tavern, Wenna) behind `hasContent` (CLAUDE.md §9).

```
chronicle_deed_kinds   key PK, section, base_weight, max_per_page, enabled, label
chronicle_deeds        id, day_key, kind, player_id NULL, guild_id NULL, subject NULL,
                       data jsonb, created_at          index (day_key), (player_id, day_key)
chronicle_verses       id, kind, text, min_n, max_n, needs text[], enabled, added_at
chronicle_verse_uses   verse_id, day_key, text_hash     index (verse_id, day_key)
chronicle_days         day_key PK, status ('composing'|'done'), composed_at,
                       headline text, quiet bool
chronicle_lines        id, day_key, section, position, text, deed_kind NULL, struck_at NULL
chronicle_mentions     day_key, line_id, player_id NULL, guild_id NULL, in_lines bool
                       index (player_id), (guild_id)
chronicle_ballads      id, guild_id, commissioned_by, paid_gold, day_key_sung NULL, text, created_at
taverns                id, location_id, name, description, bard_npc_id
news_posts             + chronicle_line text NULL
player_settings        + chronicle_opt_out bool default false
```

`chronicle_deed_kinds`, `chronicle_verses` and `taverns` are authored content: register them in `lib/contentTables.ts` or `content:export` silently leaves them out (CLAUDE.md §3).

### Composition
- **Trigger:** whichever comes first after a game midnight: the game tick noticing the day has turned (one in-memory comparison per tick), or anyone opening the book. On boot, any missing finished days are composed in order, so a server that was down over midnight catches up.
- **Lock:** `INSERT INTO chronicle_days (day_key, status) VALUES (…, 'composing') ON CONFLICT DO NOTHING`; only the inserter composes. The whole page, its lines, mentions and verse uses are written in one transaction that also sets `status = 'done'`; a failure rolls back and deletes the claim, so the next trigger tries again.
- **After commit:** the chat line, the named notices, feat evaluation for named players (§13).
- **Admin dry run:** "Compose today so far" renders the page from today's deeds without saving, for tuning weights and checking verses.

---

## 13. Feats and titles

New criterion kind `chronicle_days` in `services/feats.ts`: the number of distinct days the player is in `chronicle_mentions` with `in_lines = true` (the long roll does not count).

| Feat | Target | Title |
|---|---|---|
| **Set Down in the Tidings** | 1 | none |
| **Sung of in Talador** | 10 | *Sung of in Talador* |
| *(later)* Headline | first headline | *(decide later)* |
| *(later)* Fifty days | 50 | *(decide later)* |

Evaluated after each page is composed, for the players it named.

---

## 14. Build plan

Each step ends with Nathan testing.

1. **Journal.** Migration (all tables), `noteDeed`, hooks for the kinds marked *has data*, and an admin view of raw deeds by day. Ship and let it collect real deeds for a few days before any page is written: the first pages are then built from real play, and the weights are tuned against it.
2. **Composer.** Scoring, selection, rendering, verse picking and uses; the admin dry run; boot catch-up. Verse batch one loaded.
   **Built (2026-11-08):** `services/chronicleComposer.ts` (`composePage`, `writePage`, `chronicleTick` from the events scheduler each minute, `todaySoFar`), `lib/chronicleVerse.ts` (seeded rendering: slots, alternates, "a/an/some", small counts in words, "Ol' Shellback" without an article), migration `20261108120000` (batch one, with "{a item}" throughout, two record-fish verses without a place, and verses for trophy, total_level_mark, bestiary_mark, event_winner_guild and guest_claimed). **Writing is off** (`chronicle_settings.composer_enabled`) until switched on in Admin > Chronicle, where each day shows its written page beside a dry run, every deed's score, today-so-far and verse counts against the launch targets; a written page can be written again until players can read the book. Turned on, it catches up every missed day back to the oldest deed (30 days at most). Not yet: the chat line, notices and feats (step 4), rumours (step 5), ballads (step 6).
3. **The tavern.** `taverns` row in Talador, Wenna's NPC row and dialogue, the Tavern panel (Wenna tab, book tab), the place-action via the location payload (`routes/location.ts`, as other places are).
   **Built (2026-11-08):** migration `20261108130000` (the Salty Sloth, Wenna Halloway with `intro` and `about` stages whose options carry `open:tavern`, a client-only action `NPCDialogue` turns into opening the panel, and six `greeting` verses, one a day); `location.tavern` in the location payload; `routes/chronicle.ts` + `services/chronicleBook.ts` (`/tavern` for whoever stands there, `/days`, `/page`, `/named`); `TavernPanel.tsx` with the Wenna tab (greeting, today so far, the last headline) and The Chronicle tab (arrows, a day picker, names linking to profiles, "Days I was named" and a search by player or guild that opens the page with the name picked out). The Ballads tab waits for step 6. Pages appear only once writing is switched on (step 2).
4. **Public page and notices.** `/chronicle`, the midnight chat line, named notices, the `chronicle` push type, feats and title.
   **Built (2026-11-08):** after the newest page is written (not catch-up pages, not admin writes), `afterPageWritten` posts `__CHRONICLE__<day>__…` to world chat (`ChatMessageLine.tsx` makes it open the book on that day), pushes `chronicle_named` to everyone named in the page's own lines (push type `chronicle`, off by default) and evaluates their feats. The notice (`ChronicleNotice.tsx`, low on the scene in the Crier's card) shows the newest page within a week that named the player, in the lines or the roll, until read or put away (`players.chronicle_seen_day`, every device). The book opens anywhere through `talaran:open-chronicle` (GameLayout); away from Talador it is the book alone. Public: `/chronicle` and `/chronicle/<day>` (`ChroniclePage.tsx`, plain fetch to `/api/chronicle/public/*`, names as plain text), linked from the home page. Feats: `chronicle_days` (`services/feats.ts`), Set Down in the Tidings (1) and Sung of in Talador (10, title); migration `20261108140000`. A day with a headline is never written as a quiet day.
5. **The Maker and rumours.** `news_posts.chronicle_line` and the editor field; rumour kinds.
   **Built (2026-11-08):** "Wenna's line (optional)" on the news create and edit forms (`routes/news.ts`, one sentence, no em dash). Rumours in `services/chronicleRumours.ts`: a creature never killed (with a place it is found), a museum case never given (exhibit and museum only), a place holding a drop nobody has found (the place only; combat, tree and rock sources), a place nobody has travelled to and nobody stands in, and the merchant due within a day (his next place is now chosen when his visit is set, `world_event_settings.merchant_next_location_id`). One page in `rumour_chance` (50%) carries one, seeded; a subject waits `rumour_cooldown_days` (14) via `chronicle_lines.subject`. Migration `20261108150000`.
6. **Ballads.** Tab, payment, race:check scenario.
   **Built (2026-11-08):** `services/chronicleBallads.ts`, the Ballads tab in `TavernPanel.tsx`, `/api/chronicle/ballads` (trusted accounts, at the tavern). The guild row is the gate (locked before the cooldown is read); storehouse (with `withdraw_gold`, a `guild_storage_ledger` row) or purse (`gold_ledger` reason `chronicle_ballad`). The words are made at payment from the guild's numbers and shown at once; the next page sings them under From the guilds (`BALLADS_PER_PAGE` 2), marked sung when kept, unmarked if the page is written again. race:check `ballad` (purse, and five officers on one storehouse), both shown failing without the locks. Six more ballad verses that fit a guild without a hall: migration `20261108160000`.
7. **The rest of the kinds and the verse passes,** until no kind is thin.
   **Built (2026-11-08):** the kinds the journal did not write. `road_first` (`road_firsts`, one row per road made by the first to walk it, `noteRoadWalked` on arrival; roads with both ends already reached were filled in so old roads are not hailed as new; the unwalked-road rumour now reads it), `gem_best_grade` (the best grade off a graded recipe, once a day per player and stone), `first_craft_tier` (first on the island to make a tier 3+ item, from the tick's world-first check on recipe outputs), `feat_rare` (feats with `feats.chronicle`, set for titled and hidden ones), `quest_first` (first to finish a quest, in the transaction that completes it), `shop_big_sale` (a single sale of `SHOP_BIG_SALE_GOLD`, 2,000, or more, of the shop's keeper) and `cryptid` (`items.cryptid`, set for the Squonk's drops). Verse batch two brings every kind to its target: common 25, the rest 10, today's 3 (migrations `20261108170000`, `20261108180000`). No kind is under target.

---

## 15. Rumours

At most one per page, and only from this list when its check passes at composition time:

| Kind | True when | Example subject |
|---|---|---|
| `rumour_unkilled` | an active creature no player has ever killed | a creature |
| `rumour_unfilled_case` | a museum case no one has given | an exhibit (the case itself stays a silhouette: never name the item) |
| `rumour_unfound_item` | an active secondary drop no one has found (`item_firsts`) | a place, never the item |
| `rumour_unwalked_road` | a road no one has walked | the two places |
| `rumour_merchant` | the travelling merchant is due within a day | a direction of sail |

The same subject is not rumoured twice within 14 days. Rumours never reveal what the Bestiary or museum would hide (CLAUDE.md §2: drops are the Bestiary's to tell; unfilled cases show no name).

---

## 16. Decisions since the first draft

1. **Tavern:** the Salty Sloth, Talador **(locked)**.
2. **Ballads:** 10,000 gold, from the storehouse for a guild with a hall and from the commissioner's purse otherwise **(locked)**.
3. **Today's tidings name nobody** **(locked)**; names wait for the page.
4. **Death lines are in at launch** **(locked)**, under the rules in §6.

---

## 17. Verse batch one

Every line below has been checked against CLAUDE.md §10. Slots in braces; alternates in brackets.

### Heading (`heading`)
1. Tidings for the {date}, as told at the Salty Sloth.
2. The {date}. Wenna sets down what the island did today.
3. What was heard at the Salty Sloth on the {date}.
4. Tidings for the {date}. Pull up a stool.
5. The {date}, and the [taps are open|fire is lit|benches are full].
6. Here is the {date}, as near as Wenna could get it from people who were there.
7. Tidings for the {date}. Some of this is even true.
8. The {date}. The ink is fresh and the gossip fresher.

### Rare find (`drop_rare`)
1. {player} turned up {a item} at {place}, and looked at it for a long while before putting it away.
2. At {place}, {player} found {a item}. Nobody else did.
3. {a item} came out of {place} today, in the hands of {player}.
4. {player} is the one with {a item} now. Ask nicely and they may show you.
5. Of all the people working {place} today, only {player} came away with {a item}.
6. {player} found {a item} at {place} and has not stopped mentioning it.
7. Luck sat on {player}'s shoulder at {place}: {a item}, of all things.
8. They will be talking about {player}'s {item} at {place} for a week. Possibly two.

### Cryptid (`cryptid`)
1. {player} came back from {place} with {a item}, and nobody at the Salty Sloth believed it until it was on the table.
2. There are things in {place} most of us will never see. {player} saw one today, and has {a item} to prove it.
3. Mark the day: {player} found {a item}. The old ones at the bar went very quiet.
4. {player} swears the thing looked right at them before it left {a item} behind.
5. {a item}. From {place}. {player} has it, and the rest of us have questions.

### First in Talaran to find it (`world_first_item`)
1. No one in Talaran had ever held {a item} until {player} did, today, at {place}.
2. {player} is the first. {a item}, out of {place}, and the island has never seen one before.
3. Something new under the sky: {a item}, found by {player}. Whatever it is for, they had it first.
4. Ask anyone in a year who found the first {item}. If they are honest, they will say {player}.

### First on the island to a level (`server_first_level`)
1. Before anyone else on the island, {player} reached {skill} {level}.
2. {player} is the first in Talaran to {skill} {level}. Everyone else is now second at best.
3. Of all of us, {player} got there first: {skill}, level {level}.
4. The first to {skill} {level} was {player}, and nobody can take that back.

### Personal milestone (`level_milestone`)
1. {player} reached {skill} {level} today.
2. {skill} {level} for {player}. The hands are getting good.
3. {player} went to bed a little better at {skill} than they woke: level {level}.
4. Raise a cup to {player}, {skill} {level}.
5. {player} has {skill} at {level} now, which is further than most will bother to go.
6. {level} in {skill}, and {player} did not even stop for supper.

### Mastery (`level_max`)
1. {player} has mastered {skill}. There is nothing left on this island to teach them about it.
2. {skill}, level {level}. {player} has gone as far as the craft goes.
3. Today {player} put down the last lesson {skill} had to give. Mastered.
4. There are masters of {skill} in the stories. As of today there is one in Talaran: {player}.

### Record fish (`record_fish`)
1. {player} landed a {item} of {weight} at {place}, the heaviest anyone has pulled from these waters.
2. The scales at {place} creaked for {player}'s {item}: {weight}, and a new record.
3. A {weight} {item} for {player}. The old record holder has been told.

### First kill (`first_kill`)
1. {player} is the first ever to bring down {a creature}.
2. Nobody had beaten {a creature} until today. {player} did.
3. {a creature} fell today for the first time anyone knows of, to {player}, near {place}.

### A fight above their weight (`strong_kill`)
1. {player} took on {a creature} that had no business losing to them, and won.
2. {a creature} near {place} met {player} today and came off the worse, to everyone's surprise including the creature's.
3. {player} should not have beaten {a creature}. Nobody has told {player}.
4. Brave or foolish, {player} went at {a creature} and walked away. Mostly walked.

### Of the fallen (`death`)
1. {player} fell to {a creature} near {place}. They will be back. They always are.
2. {a creature} near {place} had the better of {player} today.
3. {player} went to {place} with more courage than armour, and {a creature} was waiting.
4. Lost at {place}: one {player}, to {a creature}. Found again at Talador, a little sorer.
5. {player} met {a creature} today. The meeting did not go their way.

### Museum, first to give (`museum_first_give`)
1. {player} gave the first {item} to the {museum}, and their name goes on the plaque.
2. The {museum} has {a item} on show now, thanks to {player}.

### Exhibit complete (`exhibit_complete`)
1. The last case in {exhibit} at the {museum} is filled. {player} set the final piece.
2. {exhibit} is whole. It took the island a long while, and {player} finished it.

### Event winners (`event_winner`)
1. When the call went out at {place}, {player} answered it hardest.
2. Nobody worked the event at {place} like {player}.
3. {guild} came to {place} in force and left with the honours.

### Travelling merchant (`merchant_arrived`)
1. A merchant's sail came into {place} today, low in the water with goods from elsewhere.
2. The travelling merchant is at {place}. Bring coin, and do not believe everything he says.

### First on a road (`road_first`)
1. {player} walked the road from {place} to {place2} before anyone else had.

### Homestead
1. (`mount_raised`) {player} led a {item} out of the pens at Novita today, fit to ride.
2. (`mount_raised`) A new {item} out of {player}'s pens, and already eating like a lord.
3. (`field_twenty`) {player} fenced a twentieth field at Novita. That is a farm now, not a garden.

### Guilds
1. (`guild_founded`) A new banner on the island: {guild}, with {tag} beside its people's names.
2. (`guild_hall_tier`) {guild} finished another tier of their hall at {place}. The hammering can stop for a while.
3. (`guild_hall_tier`) The walls of the {guild} hall at {place} stand higher tonight.

### Newcomers (`newcomers`)
1. {n} strangers came ashore at Talador today. Be kind; we were all new once.
2. The docks saw {n} new faces today. Several of them already look lost.
3. {n} came to the island for the first time today. Point them toward Geoffrey.

### Word from the Maker (`maker_generic`)
1. Word came from the Maker, and the island is not quite as it was this morning.
2. The Maker has been at work again. Mind where you step.
3. There is news from the Maker. Read the board at Talador.

### The long roll (`roll`)
1. Also seen at their work: {names}.
2. Not to be forgotten today: {names}.
3. Others worth a nod: {names}.

### A quiet day (`quiet`)
1. A quiet day on Taiar. The fishing was fair and nobody fell in.
2. Not much to tell today. Sometimes that is the best news.
3. The island kept its head down today. Wenna polished glasses.

### Rumours
1. (`rumour_unkilled`) They say {a creature} still walks near {place}, and nobody has ever brought one down.
2. (`rumour_unfilled_case`) There is a case in {exhibit} at the {museum} that nobody has ever filled.
3. (`rumour_unfound_item`) Old hands say {place} keeps something nobody has found yet.
4. (`rumour_unwalked_road`) Nobody has walked the road from {place} to {place2}. Somebody should.
5. (`rumour_merchant`) A sail was sighted off {place}. If it is who Wenna thinks, bring coin.

### Today's tidings, no names (`today:*`)
1. (`today:drop_rare`) Somebody came out of {place} this morning with {a item}. You'll hear who tomorrow.
2. (`today:drop_rare`) {a item} turned up at {place} today. Wenna knows whose hands it was in. She isn't telling yet.
3. (`today:cryptid`) Something strange came out of {place} today. Ask again tomorrow, and bring a strong drink.
4. (`today:world_first_item`) Someone has found a thing nobody on this island has ever held. It's in the book tomorrow.
5. (`today:server_first_level`) Somebody is first to {skill} {level} as of today. Not saying who. Not yet.
6. (`today:level_max`) There's a new master of {skill} on Taiar. The name keeps till morning.
7. (`today:death`) {a creature} near {place} had the better of somebody today. They'll live. Everyone does, here.
8. (`today:strong_kill`) Somebody took down {a creature} they had no right to beat. Wenna's still laughing about it.
9. (`today:record_fish`) There's a {item} on the scales at {place} heavier than any before it.
10. (`today:guild_hall_tier`) The hammering at {place} stopped this afternoon. Somebody's hall stands a storey higher.
11. (`today:newcomers`) {n} new faces at the docks so far today.
12. (`today:quiet`) Quiet so far. Give it time; the day's young.

### Sign-off (`signoff`)
1. That is the day. Drink up.
2. Wenna Halloway, the Salty Sloth, Talador.
3. More tomorrow, if the island obliges.
4. That is all the tidings there are. Go to bed.
5. Set down by Wenna Halloway, who was there for most of it.
6. Mind the step on your way out.

### Ballad (`ballad`)
1. Sing of {guild}, who keep a hall of tier {n} at {place} and {members} names on the roll. Their best hands are at {skill}, and they are not shy about it.
2. Here is a song for {guild}. They raised their hall at {place} one nail at a time, and every nail was paid for.

*About 110 verses. Batch two fills the common kinds toward 25 each.*

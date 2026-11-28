# The Manual of Talaran — Build Spec

*Spec written 2026-07-25, Fable session. Build target: Opus, this chat.*
*Status: approved by Nathan. Author character, IA, architecture all settled — build, don't re-litigate.*

---

## 1. What this is

A player-facing game manual with two surfaces:

1. **Public page** at `/manual` — prominently linked from the homepage, readable without an account.
2. **In-game panel** — opened by the existing **Manual** button in `apps/client/src/components/TopNav.tsx`, which currently has **no click handler mapped**. Renders inside the existing `DockableWindow` pattern. Must work in `MobileShell`.

Written as a plain guide, with no narrator (see §6; Nathan, 2026-11-28). Prose is authored; numbers are generated live from the database (see §4).

**Pattern precedent:** mirror the News duality (`NewsPage.tsx` public page + `NewsPanel.tsx` in-game, shared `MarkdownRenderer`). The manual is News's scholarly sibling — same page chrome (wordmark header, eyebrow/title hero, sidebar + content body), same theme tokens. No new visual language. Existing theme variables only (`--color-bg-panel`, the gold ramp, `--color-text-*`, `--color-border-*`); must look correct in all five themes (Tavern, Scriptorium, Moonveil, Mosswood, Forgeheart).

---

## 2. Content model

**Hybrid: markdown files + dynamic data blocks.**

- Prose lives in markdown files at `apps/client/public/manual/<section>/<slug>.md`. Versioned in git, deployed as static assets, fetched by slug at runtime. No server route for prose; no DB rows for prose.
- A manifest at `apps/client/public/manual/manifest.json` defines the nav: sections, page order, titles, slugs, one-line descriptions (used on section landing cards). The client builds the sidebar from the manifest — adding a page = add file + manifest entry, no code change.
- Numeric/tabular game data is **never hand-written** in the markdown. It is injected via data directives (§4) resolved against the live database, so content added through the admin Content tab is correct in the manual before any prose mentions it.

Rationale (settled, don't reopen): the manual documents mechanics; mechanics change when code changes; manual pages therefore version with code in the same commit, matching the existing patch-notes discipline. If live editing is ever wanted post-1.0, files→DB migration is trivial.

---

## 3. Information architecture

Four sections, in this order. Slugs are kebab-case and **stable forever** (deep-link targets).

### Getting Started
| Slug | Page | Notes |
|---|---|---|
| `your-first-hour` | Your First Hour | Starting kit, the pony, first travel, first gather. Second person, direct. |
| `reading-the-screen` | Reading the Screen | Layout, panels, F-keys (Skills/Stats/Quests), chat tabs, minimap. The one page allowed to talk about UI plainly. |
| `how-actions-work` | How Actions Work | The tick, timers, passive vs. active actions, the action limiter, travel time. Predicted to kill half of new-player questions — write it carefully. |
| `where-to-go-next` | Where to Go Next | Pointer page into Skills, one paragraph per early skill. |

### Skills
One page per skill, identical template (§5). Landing page is a card grid built from the manifest (icon, name, one-line hook). Order = canonical build order, then the rest:

Carpentry, Crafting, Hunting, Husbandry, Foraging, Farming, Fishing, Cooking, Combat, Mining, Woodcutting, Smithing, Tanning, Wayfaring.

Slugs: lowercase skill name (`farming`, `wayfaring`, …). Ship pages only for skills that exist in game; the manifest is the gate.

### Systems
Features that aren't self-explanatory at face value:

`travel-and-mounts`, `quests-and-npcs`, `trading`, `guilds`, `the-homestead`, `property-storage`, `trapping`, `themes-and-palettes`, `item-firsts` (page can ship ahead of the feed feature to make it legible at launch).

### Reference
Flat lookup, minimal prose, data-block-heavy: `xp-curve` (levels table from the single XP formula), `travel-times`, `plot-costs`. Grows over time.

---

## 4. Dynamic data blocks

### Directive syntax
Inside manual markdown:

```
{{data:<query>:<param>}}
```

Examples: `{{data:training-path:farming}}`, `{{data:xp-curve}}`, `{{data:plot-costs}}`, `{{data:item-stats:Lanai Hunting Bow}}`.

A `ManualRenderer` component wraps/extends `MarkdownRenderer`: splits content on directives, renders prose segments through the existing renderer, and mounts a `ManualDataBlock` component per directive that fetches and renders its table.

### Server: the query registry
New route file `apps/server/src/routes/manual.ts` (note: no `services/manual.ts` exists — but per repo convention, always write the full path anyway; 14 filenames collide between `routes/` and `services/`).

- One endpoint: `GET /api/manual/data/:query/:param?` — **public, no auth** (the page must work logged out, like `/api/news/latest`).
- A registry object maps query names to handler functions. **Directives can only invoke registered queries — never raw SQL or table names from content.** Unknown query → 404 with a clean error payload.
- Handlers return a uniform shape the client renders generically:

```ts
{ title: string, columns: [{ key, label, align? }], rows: Record<string, string | number>[], note?: string }
```

- **Cache server-side, short TTL (~60s)** — this data changes on content edits, not per request. In-memory map is fine; no infra.
- Initial registry (grow later):
  - `training-path` (param: skill) — level → unlock → where, from the unified `recipes` table filtered by skill, plus non-recipe unlocks where relevant.
  - `xp-curve` — level → XP required → cumulative, from the single XP formula. Import the real constant/function; do not re-derive.
  - `plot-costs` — plot number → materials → build time, from the constants in `apps/server/src/services/farming.ts`.
  - `item-stats` (param: item name) — tier, slot, level required, notable modifiers, from `items`.

### Client behavior
- Loading: subtle skeleton row, theme-colored.
- **Empty state is mandatory:** if a query returns no rows (content not seeded yet), render a plain placeholder ("No entries recorded yet."), never a broken table, never a thrown error. Pages will ship before their content; design for it.
- Error state: same placeholder treatment, log to console.

---

## 5. The skill page template

Every skill page uses this exact structure, in this order, so reading one teaches the navigation of all:

1. **Intro**: 2 or 3 plain sentences. What the skill is for and what it makes. No lore dumps.
2. **Where and how to start** — the location, the tool, the level-1 action. Concrete: names, not categories.
3. **Training path** — `{{data:training-path:<skill>}}` with one short prose line above it.
4. **Tools & gear** — explicitly distinguishes **equipped** tools (hoe, mallet — mainhand) from **carried** kit (saw, bucket — inventory). This distinction generated real player confusion; the manual is where it stops being a support question.
5. **Connections** — how this skill feeds and is fed by others (Hunting→Husbandry, Mining→Crafting, Woodcutting→Carpentry, feather supply→arrow demand…). The dependency graph is a genuine differentiator; surface it. 2–4 sentences plus a short list.
6. **Numbers**: a collapsed-by-default (`<details>`-style) section holding the denser data blocks: yields, timers, rates.

Systems pages follow the spirit (intro → how it works → data appendix) without the rigid template.

---

## 5a. Scope: Talaran is the world, not the island

**ADDED 2026-07-26.** The first pass wrote "this island" throughout, which bakes in an
assumption that will be wrong.

- **Talaran** is the world. It is the name to use for anything true everywhere: how actions
  work, how the XP ladder behaves, how tools are held, how travel is paid.
- **Taiar Island** is the world's first island and currently all of it. It is a proper noun
  and must be named whenever a statement is only true there.
- More islands are coming. Manual pages will eventually carry information and tables drawn
  from several at once.

Practical rules for authors:

1. Never write "this island" to mean the world. If it is a world rule, say Talaran or "this
   world". If it is a Taiar rule, name Taiar.
2. **Attribute island-specific facts explicitly.** "Farming begins at Novita" becomes "On
   Taiar, farming begins at Novita." The second sentence stays true after a second island
   ships; the first becomes a lie.
3. Distances, place names, NPC locations, and the roster of what can be found where are all
   island-scoped. Skill mechanics, tool rules, XP costs, and travel arithmetic are
   world-scoped.
4. **Data blocks carry island context automatically.** `locations.region` holds the island
   name (all 22 current locations are `'Taiar Island'`). The `training-path` query emits an
   `island` column that only appears once a skill genuinely spans more than one island, so
   the tables grow correct without a content edit. Any future registry query touching
   locations must do the same.
5. Page structure should anticipate multi-island content: prefer "where to find it" sections
   that can take a second island as another entry, over prose that assumes one place.

## 5b. Style: punctuation

**ADDED 2026-07-26.** Em dashes were heavily overused in the first pass. Use them
occasionally, where the break genuinely earns it. Reach for commas, colons, full stops, or
parentheses first. A page with more than two or three em dashes needs another edit.

## 6. Voice: a plain guide

**REVISED 2026-11-28 (Nathan).** The Manual had a narrator, the Geographer, written as a
whimsical storyteller. A new player read the opening pages, said they were "obviously AI",
and left. A witty narrator who lands a quip in every paragraph is exactly the voice people
now recognize as generated, so the narrator is gone. The Manual is plain information.

**Who is speaking:** nobody in particular. The pages explain the game to the reader in the
second person. No "I", no anecdotes, no persona, no signature. (The Geo- tutors keep their
names; they are simply the tutors.)

**Rules:**
- **Answer the question the reader came with.** Lead with what to do, where, with what, and
  what comes of it. A sentence that does not tell the reader something goes.
- **Short sentences, concrete nouns.** "Lanai trees grow at Lanaivale" beats "the western
  woods await". The world's flavor comes through its own names (places, people, items),
  never through jokes about them.
- **No jokes, quips, asides, or rhetorical questions.** No punchline endings, no one-line
  paragraphs for timing, no aphorisms, no footnotes.
- **The patterns that read as generated are banned outright:** "not X, but Y" and "it is not
  X, it is Y" reversals; triplets used for rhythm; "here is the thing", "the trouble is",
  "let us", "take heart"; a closing line that sums up the paragraph. CLAUDE.md §10 applies
  in full (no em dashes, American spelling, the Oxford comma, the banned word list).
- **Say "you" for the player and name places.** Island-specific facts name the island (§5a).
- **The interface may be named plainly** wherever it helps: buttons, panels, keys.
- **Data blocks stay as they are**, with a plain line above when a table needs one.
- **Accuracy over everything.** Write from the code and the live rows, not from memory; a
  plain wrong sentence is easy to catch, so catch it.

**Calibration (Your First Hour, opening):**

> You arrive in Talador with a hatchet and a pickaxe. That is enough to start Woodcutting
> and Mining, which supply the timber and metal most other trades need.
>
> Quank stands in Talador's square. Talk to him and he gives you a pony. Equip it before
> you travel: riding takes about a third off every journey.

## 7. Routing & surfaces

- **Public:** `/manual` (section landing → Getting Started) and `/manual/:section/:slug`. Add to the `Route` list in `apps/client/src/App.tsx` alongside `/news`. Linked prominently from the homepage and from the News-style page header nav (Play · News · **Manual**).
- **In-game:** wire the TopNav Manual button (add an `onManualClick` prop following the existing handler pattern) to open `ManualPanel` in a `DockableWindow`. Same manifest, same renderer; sidebar collapses to a drawer or breadcrumb — panel real estate is tight, and it must be usable in `MobileShell`.
- **Deep-linking:** panel accepts an initial `{section, slug}` prop. Long-term payoff: contextual "?" affordances (e.g. on `FarmPanel`) opening the manual directly to the relevant page. **Not phase 1**, but slugs and the prop exist for it from day one.
- **Search:** client-side and deliberately dumb — fetch all markdown (~25 small files) once on first search focus, cache, substring match against title + body, jump to page. No server involvement. Panel and page share it.

---

## 8. Phase 1 slice (build this, then stop)

1. Manifest + shell: `/manual` page with sidebar nav, section landing cards, and the `ManualPanel` behind the TopNav button. Theme-token styling on both.
2. `ManualRenderer` + `ManualDataBlock` with loading/empty/error states.
3. `apps/server/src/routes/manual.ts` with the four initial registry queries + TTL cache.
4. Four content pages: `your-first-hour`, `how-actions-work`, and two skill pages proving the template — **`farming`** (freshest system) and **`mining`** (old, stable).
5. Search.

Everything else is content treadmill: one page at a time, prose drafted **from the actual service code** so numbers and mechanics are real, not remembered.

## 9. Constraints & repo rules that apply

- Full paths from `apps/server/src/` / `apps/client/src/` in all discussion and docs — 14 filenames collide between `routes/` and `services/`.
- Client type-check: `npx tsc --noEmit -p tsconfig.app.json` (client tsconfig has `"files":[]`); server: `npx tsc --noEmit`.
- Any migration (none expected in phase 1 — the registry reads existing tables) follows the frozen-migrations rule; new migration files only.
- The manual route is public: no `requireAuth` on `GET /api/manual/*`. Keep it read-only; expose nothing beyond the registered queries.
- New dialogue/content seeds elsewhere must store quest **IDs** in action strings (per `20260725050000_dialogue_quest_ids`) — noted here because manual pages about quests should also never treat quest names as identifiers.

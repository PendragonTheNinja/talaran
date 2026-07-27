# The Manual of Talaran — Build Spec

*Spec written 2026-07-25, Fable session. Build target: Opus, this chat.*
*Status: approved by Nathan. Author character, IA, architecture all settled — build, don't re-litigate.*

---

## 1. What this is

A player-facing game manual with two surfaces:

1. **Public page** at `/manual` — prominently linked from the homepage, readable without an account.
2. **In-game panel** — opened by the existing **Manual** button in `apps/client/src/components/TopNav.tsx`, which currently has **no click handler mapped**. Renders inside the existing `DockableWindow` pattern. Must work in `MobileShell`.

Written in-universe by **the Geographer** (see §6). Prose is authored; numbers are generated live from the database (see §4).

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
| `your-first-hour` | Your First Hour | Character creation, the pony, first travel, first gather. Second person, direct — framed as the Geographer's letter to a new arrival. |
| `reading-the-screen` | Reading the Screen | Layout, panels, F-keys (Skills/Stats/Quests), chat tabs, minimap. The one page allowed to talk about UI plainly. |
| `how-actions-work` | How Actions Work | The tick, timers, passive vs. active actions, the action limiter, travel time. Predicted to kill half of new-player questions — write it carefully. |
| `where-to-go-next` | Where to Go Next | Pointer page into Skills, one paragraph per early skill. |

### Skills
One page per skill, identical template (§5). Landing page is a card grid built from the manifest (icon, name, one-line hook). Order = canonical build order, then the rest:

Carpentry, Crafting, Hunting, Husbandry, Foraging, Farming, Fishing, Cooking, Combat, Mining, Woodcutting, Smithing, Tanning, Agility, Equitation.

Slugs: lowercase skill name (`farming`, `equitation`, …). Ship pages only for skills that exist in game; the manifest is the gate.

### Systems
Features that aren't self-explanatory at face value:

`travel-and-mounts`, `quests-and-npcs`, `trading`, `guilds`, `the-homestead`, `property-storage`, `trapping`, `themes-and-palettes`, `item-firsts` (page can ship ahead of the feed feature to make it legible at launch).

### Reference
Flat lookup, minimal prose, data-block-heavy — the Geographer's "appendices": `xp-curve` (levels table from the single XP formula), `travel-times`, `plot-costs`. Grows over time.

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
- **Empty state is mandatory:** if a query returns no rows (content not seeded yet), render a styled placeholder in-voice — e.g. *"The Geographer's ledger for this is not yet copied."* — never a broken table, never a thrown error. Pages will ship before their content; design for it.
- Error state: same placeholder treatment, log to console.

---

## 5. The skill page template

Every skill page uses this exact structure, in this order, so reading one teaches the navigation of all:

1. **Intro** — 2–3 sentences, Geographer voice, field-journal register. What the skill *is* on Taiar Island. No lore dumps.
2. **Where and how to start** — the location, the tool, the level-1 action. Concrete: names, not categories.
3. **Training path** — `{{data:training-path:<skill>}}` with one short prose line above it.
4. **Tools & gear** — explicitly distinguishes **equipped** tools (hoe, mallet — mainhand) from **carried** kit (saw, bucket — inventory). This distinction generated real player confusion; the manual is where it stops being a support question.
5. **Connections** — how this skill feeds and is fed by others (Hunting→Husbandry, Mining→Crafting, Woodcutting→Carpentry, feather supply→arrow demand…). The dependency graph is a genuine differentiator; surface it. 2–4 sentences plus a short list.
6. **The Geographer's numbers** — collapsed-by-default (`<details>`-style) section holding the denser data blocks: yields, timers, rates. Framed as the appendix/ledger.

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

## 6. The Geographer — voice guide

**REVISED 2026-07-26.** The original register was a quiet field journal. Nathan asked for a
whimsical storyteller instead — Hoid/Wit from Sanderson's Cosmere as the touchstone. The
character and lore are unchanged; only the telling is.

**Who:** the scholar who trained the Geo- tutorial teachers (Geonsen, Geoffrey, Geossica,
Georgic — the shared prefix is canonically *his* school, retroactively turning a dev-side
naming convention into worldbuilding). He has practiced every trade on Taiar Island once,
competently and never brilliantly, and would far rather tell you about it than let you get
on with your day.

**Register:** a storyteller who has been waiting all week for someone to ask. Warm,
theatrical, delighted by his own material. He addresses you directly and often. He is fond
of a digression and knows exactly how long he is allowed to indulge one. He mocks himself
before he mocks you, which earns him the right to do both. Every so often a joke turns out
to have been load-bearing.

**Rules:**
- **Whimsy never costs information.** This is the rule the voice most endangers, so it is
  the rule that wins. Openings, transitions, Connections and marginalia are his. The moment
  a passage becomes *how to do the thing*, sentences get short and imperative and the jokes
  stop until the instruction is delivered.
- Hoid is *economical*. His wit is compression, not padding. If a flourish costs a second
  sentence, it is not a flourish, it is a delay. One joke that also teaches beats three that
  don't.
- Direct address, rhetorical questions, and mock-grandeur are in. Whimsy for its own sake,
  quirky-for-quirky, and randomness are out.
- Land it. A page should end on something either useful or quietly true — preferably both.
  He is a jester who occasionally forgets to be joking.
- He is never cruel about the reader's ignorance. He was worse at this than you are, and
  says so, repeatedly, with relish.
- UI chrome (nav labels, search, buttons, section names) stays **out-of-universe**. The
  character exists inside page content only.
- He does not reference the interface in-voice (no "click", no "panel") — except
  `reading-the-screen`, which drops the frame and admits the frame exists.
- Data blocks stay plain and factual, framed as his copied ledgers ("I have copied the
  guild's rates faithfully. Take your complaints to them.").
- **At most one footnote per page**, and it must do work — a joke that also contains a fact.

**Sample passage (calibration target — Farming opening):**

> Let us begin with a confession: I was a dreadful farmer.
>
> Oh, I *understood* farming. I understood it the way a man on a cliff understands
> gravity — thoroughly, and too late to be useful. I had come from the forests, where
> patience means swinging until the tree falls, and from the forges, where patience means
> waiting for metal to stop being angry. Soil, I assumed, would be a third variety of the
> same virtue.
>
> Soil does not care what you assume. Soil has one lesson and it teaches it to everyone
> identically: *you cannot hurry this, and you should go away.*
>
> That is genuinely the whole trade. Till the ground, put a seed in it, and then — this is
> the part that took me two seasons — **leave**. Go and do something else. The field will
> not grow faster for being supervised. I have tested this. I have tested it extensively,
> standing in a field, being useless, at considerable cost to my own progress.¹
>
> ¹ Novita's farmers still greet me by name. Not warmly. By name.

Note what that footnote does: it lands a joke, establishes the character, and teaches the
single most important thing about farming (crops grow in real time whether you are present
or not). That is the bar. A footnote that is only funny should be cut.

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
4. Four content pages, Geographer-voiced: `your-first-hour`, `how-actions-work`, and two skill pages proving the template — **`farming`** (freshest system) and **`mining`** (old, stable).
5. Search.

Everything else is content treadmill: one page at a time, prose drafted **from the actual service code** so numbers and mechanics are real, not remembered.

## 9. Constraints & repo rules that apply

- Full paths from `apps/server/src/` / `apps/client/src/` in all discussion and docs — 14 filenames collide between `routes/` and `services/`.
- Client type-check: `npx tsc --noEmit -p tsconfig.app.json` (client tsconfig has `"files":[]`); server: `npx tsc --noEmit`.
- Any migration (none expected in phase 1 — the registry reads existing tables) follows the frozen-migrations rule; new migration files only.
- The manual route is public: no `requireAuth` on `GET /api/manual/*`. Keep it read-only; expose nothing beyond the registered queries.
- New dialogue/content seeds elsewhere must store quest **IDs** in action strings (per `20260725050000_dialogue_quest_ids`) — noted here because manual pages about quests should also never treat quest names as identifiers.

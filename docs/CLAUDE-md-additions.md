# CLAUDE.md — proposed additions

Three edits. **§0 is the important one** — most of what went wrong this session was
already written down in §2, §3, and the action checklist, and was simply not read.
The other two close gaps that genuinely weren't covered (all client-side).

---

## EDIT 1 — insert a new §0 at the very top, above "Working rules"

```markdown
## 0. Before you build anything

**Read this file first, every session.** The rules below are not general advice —
each one is a bug that shipped. Most repeat failures are re-reading nothing and
re-deriving a convention that already exists.

**Then find the nearest existing implementation and read it in full.** Not the part
that looks relevant — the whole file. Before a new skill, read a finished skill's
service, route, tick block, *and* its client panel. Before new UI, open the
component that already does the closest thing.

The test before writing any new file: **name the existing feature this mirrors.**
If that can't be answered with a filename, the codebase hasn't been read yet.

Failures this catches, all of which have happened:
- Building a two-column text list for storage without opening `LeftPanel.tsx`,
  which already renders items as an icon grid.
- Adding thirteen recipes without setting `flavor_text`, a column that exists
  precisely for that, so all thirteen read "You are working at the bench."
- Shipping an action with no cancel button, which item 7 of the action checklist
  already requires.
- Hard-coding scene text on the client, which §2 explicitly forbids by name.
```

---

## EDIT 2 — extend the "New player_actions type checklist" in §2

Append to the existing numbered list:

```markdown
8. **Clear `lastResult` when the action starts.** Every `startX` in `GameView.tsx`
   does `setLastResult(null)` plus timer/travel cleanup. Skip it and the previous
   result card hangs around under the new action's timer. Mirror `startForage`
   exactly — don't copy the shortest nearby branch (`kiln_collecting` is three
   lines and misses all of this).
9. **The result card must handle actions with no item.** The generic
   `action_complete` branch is gated on `data.result?.itemName`; anything that
   produces only XP (tilling, building, tending) falls straight through it and
   renders nothing at all. Send a `message` and give it its own branch.
10. **Recipes carry `flavor_text`.** Set it on every new recipe row. The per-skill
    fallback in `RECIPE_FLAVOR_BY_SKILL` is a safety net, not the plan — and it
    needs an entry for any new skill that owns recipes.
```

---

## EDIT 3 — new section, after §2 (Architecture principles)

```markdown
## 2b. Client patterns (match these, don't invent)

- **Items are always an icon grid.** `getItemIcon(name)` from `lib/items`, rendered
  as `inventory-slot` tiles inside a grid, with a text fallback on image error and a
  quantity badge. Inventory, ground items, and property storage all use it. A text
  list of item names is never the answer.
- **Persistent modes follow drop mode.** A toggle that changes what tapping an
  inventory item does — see `dropMode` / `tradeMode` in `LeftPanel.tsx`. Full-screen
  panels cover the inventory, so any "click your items to do X" feature *must* work
  as a mode that outlives the panel. Give the grid a visible active state; drop mode
  references `drop-mode-active` but never styles it, so don't copy that.
- **Feature panels are one modal with tabs**, not several location buttons. The
  farm panel carries Fields / Processing / Storage. New sub-systems become tabs.
- **Admin panel cards are `admin-action-card`** with an emoji-led
  `admin-section-title`. `admin-section` is the plain sidebar style — using it in the
  main column renders an unboxed control that looks broken. Gate admin-only tools on
  `isAdmin` in the UI as well as the route; a button that can only 403 is a bug.
- **Reuse the shared components.** `RecipeList` renders any skill's recipes. Don't
  write a second recipe list.

## 2c. Property & homestead model

- A **property** (`player_properties`) is a container a player owns at a location —
  a farmstead at Novita, a house at Talador. It holds sub-systems: plots, storage,
  and later pens and stables. It is **not** a workstation; workstations are
  single-purpose benches keyed by `type`.
- **Storage is per-property**, keyed by location, so a new property type gets storage
  with no new code. One slot = one unique item stack of any size. Topping up an
  existing stack must never require a free slot.
- **Sub-system capacity lives on the property row** (`plot_slots`, `storage_slots`)
  so a tier upgrade is a number change, not a schema change.
- **Skill gates belong to the skill that owns the sub-system.** Farming level caps
  plot count; Carpentry level caps house tier. Never gate one skill's capacity behind
  another skill's level — materials can be traded between players, levels cannot.
```

---

## EDIT 4 — new section, anywhere after §2 (writing style)

```markdown
## 2d. Writing style for player-facing text

Applies to everything a player reads: item and habitat descriptions, NPC dialogue,
quest text, flavour text, scene text, result messages, button labels, error strings.

- **Use em dashes sparingly.** They are heavily overused by default. Reach for a
  full stop, a comma, a colon, or a semicolon first. Keep one only where the break
  genuinely earns it, which is rare. A patch shipped with 27 player-facing lines
  carrying an em dash and needed a text pass to strip them.
- Rewrites are easy: "A hardy root — good on the table" becomes "A hardy root. Good
  on the table". "Resting — recovers in 4h" becomes "Resting, recovers in 4h".
- **Text is content, so it lives in the DB.** Descriptions, dialogue, and
  `flavor_text` are rows. A wording change ships as a migration, not a code edit.
  The exception is UI chrome (button labels, status lines), which lives in the
  component.
- Keep the established voice: plain, concrete, a little folkloric. NPCs talk like
  working people, not narrators.
```

---

## Also worth fixing while in here

- **§3 migrations** already says an applied migration is frozen. It happened again
  this session (`20260721040000` was edited after running, so its `scene_text`
  column and values never executed on the local DB and needed a repair migration).
  Consider adding: *"If a migration has been delivered to Nathan, treat it as applied
  unless he says otherwise — ask before editing rather than assuming."*
- **§7 docs index** should list `docs/IDEAS.md` (the event-chat "firsts" feed).

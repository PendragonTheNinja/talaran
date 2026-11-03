# Patch notes: template and rules

Every set of patch notes Talaran posts follows this. It exists so notes look the same from one update to the next and players can skim for what they care about (forum, 2026-11-03).

## Tags

Start every bullet with exactly one tag. The news page and the Manual draw them as coloured labels (`renderTags` in `apps/client/src/lib/markdown.ts`):

| Tag | Colour | Use for |
|---|---|---|
| `[Feature]` | green | Something new players can do. |
| `[Fix]` | red | Something broken that now works. (`[Bug]` is drawn as Fix.) |
| `[Balance]` | gold | Numbers changed: XP, timers, prices, drop rates, costs. |
| `[UI]` | blue | How something looks or is laid out; phone and desktop layout. |
| `[Content]` | purple | New items, creatures, recipes, places, quests, Manual pages, writing. |
| `[Event]` | orange | Events, the travelling merchant, anything time-limited. |

One tag per bullet. If a change is two things (a new feature that also changes numbers), split it into two bullets.

## Shape

```markdown
# Talaran 1.24: Short Title Naming the Headline

> One or two sentences on what this update is about, in plain words.

---

## 🏷️ First Area (e.g. Guilds)

- [Feature] **What it is, in bold.** One or two sentences on how it works for the player.
- [Fix] **What was wrong.** What happens now.

## 🏷️ Next Area

- [Balance] **Mill Flour** takes **2 Grain** instead of 3.

---

## 🧰 Smaller Things

- [UI] ...
- [Fix] ...

---

*Thank you for playing. Keep the feedback coming on the forum.*
```

- **Group by area of the game** (Guilds, Farming, Talar, Chat, Phones), biggest first; an emoji leads each area's heading. "Smaller Things" comes last.
- **Bold the part a skimmer needs**, usually the first words of the bullet and the key number.
- **Numbers are exact**: "5 minutes and 212 XP", never "faster" alone.
- **Only this deploy's changes.** Never repeat a previous update's notes (CLAUDE.md §1).
- **Leave out staff-only changes** (admin panel) and anything unreleased.

## Writing

Patch notes are player-facing text, so CLAUDE.md §10 applies in full: no em dashes, none of the banned words ("unlock" included), concrete and specific, no rhythmic three-item lists. Grep the finished notes for `—` before handing them over.

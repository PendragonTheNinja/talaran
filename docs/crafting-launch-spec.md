# Talaran Crafting — Launch Spec

*Spec v1 — 2026-07-15. Crafting goes live this patch. Companion to docs/xp-rebalance.md, docs/trapping-spec.md, CLAUDE.md §3.*

## 1. Identity — why "the catch-all" is a feature

Crafting is the **workshop skill**: if it's made at a bench, it's Crafting. That breadth isn't a junk drawer — it's the skill's strategic identity: Crafting is the **crossroads of the economy**. It consumes hunting's hides, mining's gems, smithing's ingots, carpentry's wood, and (later) husbandry's cattle — every crafter is every gatherer's customer. No other skill touches as many markets, and that's the pitch to players.

Two more pillars make it mechanically distinct:

1. **Two tempos.** Launch is all *active handwork* (bench actions via the recipe executor). When Husbandry ships cattle, Crafting gains its second tempo: **tanning vats** — kiln-pattern passive batches for cattle Leather. The realism maps exactly: brain-tanning buckskin was active labor; bark-tanning leather was months of passive soaking. Wild = active, farmed = passive, by history and by design.
2. **You build your workshop.** Stations are owned, and owning them is progression (§2).

## 2. Stations — launch on the sawhorse precedent

Verified in code: carpentry already models station ownership as **items in inventory** (`Lanai Sawhorse` halves saw time vs. the public bench). Crafting launches on the identical, proven pattern:

- A recipe's `station` column names a **station item**. Station item in inventory → full speed. Absent → **timer ×2** ("making do at the public bench").
- **Executor change (small):** `canStartCraft`/route apply the ×2 when the station item isn't held; the recipes list flags it so the UI can show why.
- Launch stations, both **built by Carpentry** (cross-skill, exactly like the sawhorse — carpenters build the workshops of the world), shipped as the recipes table's first Carpentry tenants:

| Station | Built by | Inputs | Lvl | Timer | XP |
|---|---|---|---|---|---|
| Tanning Rack | Carpentry | 4 Lanai Planks · 4 Leather Strips | 5 | 300s | 363 |
| Lapidary Bench | Carpentry | 4 Lanai Planks · 1 Ambren Ingot | 5 | 300s | 363 |

- **Phase 2 (future):** placed stations at locations (player_traps taught us the shape) — owned-and-placed beats carried. **Phase 3:** tanning vats (passive batch system) with the cattle line.

## 3. Material spine

Families per CLAUDE.md §3: **Buckskin** (wild, one item, yield-scaled) vs **Leather** (cattle, five tiers, arrives with Husbandry). Gems: **Rough Quartz** (already dropping from mining) is the tier-1 gem; future gem tiers ride the metal cadence (Ambren→Serph→Azulyss… at 1/13/25/37…).

## 4. Launch content — the 1–25 band

Policies from the rebalance: intermediates ≈ 1.19×R̂(u) xp/hr, finished goods ≈ 1.98×R̂(u). Existing tenants noted for completeness. All station recipes assume the station held (×2 timer otherwise).

| Lvl | Recipe | Station | Inputs → Output | Timer | XP | Class |
|---|---|---|---|---|---|---|
| 1 | Tan Deerhide | Tanning Rack | 1 Deerhide → 1 Buckskin | 30s | 20 | interm. |
| 1 | Cut Buckskin Strips | — | 1 Buckskin → 3 Leather Strips | 20s | 13 | interm. |
| 1 | Tie Snare *(shipped)* | — | 2 Lanai Planks · 2 Leather Strips → Snare | 60s | 66 | finished |
| 5 | Cut Rough Quartz | Lapidary Bench | 1 Rough Quartz → 1 Cut Quartz | 45s | 33 | interm. |
| 9 | Tan Boarhide | Tanning Rack | 1 Boarhide → 2 Buckskin | 60s | 48 | interm. |
| 13 | Quartz Ring | Lapidary Bench | 1 Cut Quartz · 1 Ambren Ingot → Quartz Ring | 120s | 176 | finery |
| 17 | Tan Slothhide | Tanning Rack | 1 Slothhide → 3 Buckskin | 90s | 87 | interm. |
| 21 | Quartz Amulet | Lapidary Bench | 2 Cut Quartz · 1 Ambren Ingot → Quartz Amulet | 150s | 266 | finery |
| 25 | Ornate Quartz Brooch | Lapidary Bench | 4 Cut Quartz · 1 Ambren Ingot → Brooch | 180s | 351 | finery |

*(Fletch Arrows remains Smithing; it lists in the same menu, grouped by skill.)*

**Finery** launches as high-value tradeable goods — the luxury line and a future NPC-sale gold-faucet knob. **Equippable jewelry is gated on one 30-second check:** `\d player_equipment` — if necklace/ring columns exist, Ring/Amulet gain modest equip stats this patch (small armor or an agility_reduction perk, values as knobs); if not, equip slots for jewelry are a future migration and finery ships as goods.

Earlier chat values for Tan Boarhide (40) and Tan Slothhide (60) are superseded by the computed 48/87 above.

## 5. The `is_implemented` flip — checklist

1. Migration: `UPDATE skills SET is_implemented = true WHERE name = 'Crafting';` (plus the content data migration for §2/§4 rows — one migration can carry both).
2. **Icon asset — Nathan task:** Crafting skill icon to match the existing set (skills panel loads by convention).
3. Verify the reveal surfaces automatically: skills panel (display_order 11 exists), hover tooltip, click-through detail view, highscores. Expected: all data-driven off the skills table; confirm, don't assume.
4. **Banked XP reveals on flip** — every snare tied and hide tanned during testing already accrued. Patch-notes beat: early crafters wake up with levels.
5. Hints/quest hooks: none required at launch; `updateQuestObjectiveProgress(…, 'craft', …)` already fires for future quests.

## 6. Crafting UI (the remaining client step)

`CraftingMenu` modal on the HuntingMenu pattern: opened from a sidebar **"Crafting"** entry (global — camp recipes work anywhere), recipes grouped by skill, each row showing inputs (with have/need counts from inventory), output, level lock, timer — with a **×2 badge when the station item is missing** — plus a quantity field wired to `actionLimit` ("Craft ×20"). Uses `GET /api/crafting/recipes` (extend response with `station` + held-check) and `POST /api/crafting/start`. Crafting results already render through the existing generic `action_complete` path (ingredientsRemaining/outputTotal were already client-supported) — the restore-switch case shipped in step 4. Locked rows mirror the hunting-card lock treatment.

## 7. Build order

1. Migration: station items + §4 recipes + station column values + `is_implemented` flip (one data migration).
2. Executor: station ×2 timer check + `station`/held fields in the recipes response.
3. CraftingMenu component + sidebar entry.
4. Slot audit → finery equip stats (if columns exist).
5. Icon asset (Nathan) → verify reveal surfaces → patch notes.

## 8. Knobs (veto list)

Station-absent multiplier ×2 (carpentry precedent) · rack/bench costs & 363 xp · finery equip stats pending slot audit · quartz drop rate vs. lapidary demand (watch after launch) · L25 brooch as capstone · public-bench framing ("making do") vs. hard-requiring stations · vat system deferred to Husbandry era.

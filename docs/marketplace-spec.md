# Talaran — Currency, Marketplace & Player Shops

*Spec v1, 2026-08-10. Designed with Nathan. Everything in §1 is LOCKED; do not
re-litigate it. Builds directly on `docs/economy-spec.md`, which is the pricing
doctrine this patch spends.*

---

## 0. What this patch is

Gold becomes a real, circulating currency, and Talador becomes the place it
circulates. Three things ship together:

1. **Gold** — a balance, an append-only ledger, and the trade window finally
   able to move it.
2. **Taiar Marketplace** — five NPC merchants at Talador who sell a limited
   daily stock at 175% of value and buy at 45% (35% for the pawnbroker), with a
   per-player daily allowance that steps down the more you sell.
3. **Player Shops** — a Carpentry-built structure at Talador with its own
   storage, sell listings, and standing buy orders, tradeable while the owner
   is offline.

Plus one small piece of UI debt: the skills tab gets an identity header.

**Prerequisite, blocking:** `items.value` must actually be populated. That means
deploying the fishing + registry work to live, re-exporting `content-snapshots/`,
re-running `npm run values:derive -- --write`, and hand-tuning what remains.
Nothing in this patch is meaningful against null values.

---

## 1. Locked decisions

- **Currency is gold**, unit `g`. No unique coin name in the UI. Lore and NPC
  dialogue may name the coin for texture; every number on screen says gold.
  Talers remain the separate premium currency and the line is never crossed.
- **Value is derived, never chosen.** `value = xp of the yielding action ÷ 5`,
  min 1, whole gold. See `docs/economy-spec.md` §2 for the full rules, including
  the rule that bit three times: **price the attention an action costs, never
  the clock it runs on.**
- **NPC walls:** sell at **175%** of value, buy at **45%**. The pawnbroker buys
  anything at **35%**. Because buy% is far below sell%, store-to-NPC arbitrage
  always loses money by construction.
- **NPC merchants map to production chains, not skills.** Four themed merchants
  plus a pawnbroker. NPCs sell only entry-tier tools and consumables. They never
  sell raw materials, and never anything above the first tier.
- **All NPC limits are per player, per day.** No global stock pool, so no
  sniping and no timezone unfairness.
- **One shop per player, at Talador.** Built and owned like a homestead. The
  code should not hard-code Talador in a way that makes a second market town
  painful later, but Talador is the only one for now.
- **Shops trade while the owner is offline.** Proceeds accumulate in a till.
- **Presence is required.** You must be standing at Talador to manage your shop,
  move goods, or set prices. This matches the homestead.
- **Two separate gold stores per shop:** the **till** (sale proceeds, withdraw
  only) and the **buy fund** (gold you deposit to back standing buy orders).
  They never mix.
- **3% tax** on completed player shop sales, taken from the seller's proceeds.
- **No tool repair, ever.** Tools break and are replaced. This is what gives the
  NPC store an ongoing purpose after the tutorial quests have handed out the
  starter kit.
- **No aggregated cross-shop index.** Finding a good price is a player activity.
  Filtering and sorting happen inside a shopfront.

---

## 2. Gold

### 2.1 Storage model

Diverges deliberately from Talers. Talers compute balance as `SUM(delta)` over
`taler_ledger`, which is correct at purchase volume but will not hold up when
every fishing catch sold to a pawnbroker writes a row.

- `players.gold` — **bigint, not null, default 0. The authoritative balance.**
- `gold_ledger` — append-only audit trail, same shape as `taler_ledger`.

Every mutation updates both inside one transaction, with the player row locked
`forUpdate`. Balance may never go negative. A periodic admin reconciliation
report comparing `players.gold` against `SUM(delta)` per player is cheap
insurance and catches any code path that forgot the ledger.

### 2.2 `gold_ledger` reasons

Stable strings, because the whole economy becomes readable through them:

`npc_sale`, `npc_purchase`, `shop_sale`, `shop_purchase`, `shop_tax`,
`shop_till_withdraw`, `shop_fund_deposit`, `shop_fund_withdraw`,
`shop_order_refund`, `trade`, `quest_reward`, `admin_grant`, `shop_build`.

### 2.3 The vault

No table. Two sources, because shop tax never touches `gold_ledger`:

- NPC store spending: `SELECT -SUM(delta) FROM gold_ledger WHERE reason = 'npc_purchase'`
- Shop tithes: `SELECT SUM(tax) FROM shop_transactions`

**Why the split.** `gold_ledger`'s invariant is that its deltas sum to
`players.gold`, which is what makes `reconcileGold()` meaningful. A shop sale
pays into the shop's TILL, not the owner's balance, so writing a ledger row at
sale time would put every player with uncollected takings permanently out of
reconciliation. The owner's ledger entry happens at collection
(`shop_till_withdraw`); the sale itself is history in `shop_transactions`, and
the tithe is a column on it.

It is a statistic, never a pool anything draws from. Surfaced as a line on the
Marketplace page: what Taiar's commerce has paid in tithes to date.

The donator monument is Taler-side and stays a separate fixture. Do not merge
the two leaderboards onto one object.

### 2.4 Trade window

`routes/trades.ts` currently blocks any trade with a non-zero gold offer with a
hard error, because the offer field wrote to `trade_gold` and nothing ever moved
it. That guard comes out and the accept path moves gold for real: both balances
adjusted and both ledger rows written inside the existing accept transaction,
with both player rows locked. Confirm the offering player still has the gold at
accept time, not just at offer time.

### 2.5 Starting gold

None at signup. **The new player tutorial (§8) is the only source of starting
gold, and there is no separate marketplace tutorial quest.** A second NPC handing
out gold in a new player's first ten minutes was cut for exactly the confusion it
would cause.

---

## 3. Taiar Marketplace

A submenu at Talador containing five NPCs.

### 3.1 Roster

| Merchant | Buys at 45% | Sells |
|---|---|---|
| Smith | ore, ingots, metal tools and goods | entry-tier metal tools |
| Carpenter | logs, planks, wooden goods | entry-tier wooden tools |
| Leatherworker | hides, leather, crafted goods | basic leather goods |
| Provisioner | fish, crops, forage, cooked food, animal products | bait, sundries, containers |
| Pawnbroker | **anything, at 35%** | nothing |

**Naming.** `Geo-` is the skill-tutor prefix and must stay that. Merchants need
their own register so a player reads a name and knows the role. Names are
Nathan's call; the spec uses roles as placeholders.

**Domain routing.** A merchant's buy domain is derived from `items.type` /
`items.subtype`, held as a small map in `services/marketplace.ts`. Anything
unclaimed is pawnbroker-only, which is the safety net that guarantees no item is
ever unsellable.

### 3.2 Selling to a merchant (the 45% floor)

Price paid = `floor(value × rate × tierMultiplier)`, minimum 1g.

The step-down is **per player, per item, per day**, resetting on the same
Eastern-timezone daily boundary the chat history already uses. Allowance for one
item is:

```
allowance = clamp(ceil(500 / value), 5, 500)
```

which is roughly one hour's worth of that item's value, and falls out of the peg
automatically for anything added later. Sell beyond it and the rate steps:

| Units sold today | Rate |
|---|---|
| 1 to allowance | 100% of floor |
| next allowance | 75% |
| next allowance | 50% |
| beyond | 25%, forever |

Constants live in one exported block and are tunable. Tracked in
`npc_sale_daily` keyed `(player_id, item_id, sale_date)`.

The client must show the player, before confirming, exactly what a stack will
fetch when it crosses a step boundary. A sale that silently pays less than the
displayed unit price is the kind of thing that costs trust once and never gets
it back.

**Never sellable:** `items.value IS NULL`. That is already the "no price, do not
show" signal in the loot log and admin. Quest items and anything bound must have
a null value.

### 3.3 Buying from a merchant (the 175% ceiling)

Price = `ceil(value × 1.75)`.

Stock is **per player, per day**, so every player sees the same shop and nobody
races anyone. Two layers:

- **Core stock, always available.** The entry tools for every skill, at 3 to 7
  units per player per day depending on the tool. This is the breakage safety
  net, and it is the reason tools breaking outright is survivable.
- **Rotating stock, 3 to 5 extra lines per merchant per day**, drawn from a pool
  of consumables and sundries.

**Implementation note that matters:** seed the daily rotation from the date
string, not `Math.random()`, so the shop is stable across server restarts. A
merchant whose stock reshuffles because pm2 bounced is a bug report.

Tracked in `npc_purchase_daily` keyed `(player_id, item_id, purchase_date)`.

---

## 4. Player Shops

### 4.1 Building one

Reuses the property system unchanged: a shop is `player_properties` with
`type='shop'` at Talador. The unique constraint `(player_id, location_id, type)`
already permits a shop and a farmstead to coexist, and `property_storage` works
as-is with no changes.

| | Farmstead (existing) | Shop (new) |
|---|---|---|
| Lanai Planks | 500 | **350** |
| Granite Block | 500 | **350** |
| Ambren Nails | 1000 | **700** |
| Build seconds | 600 | **480** |
| Carpentry level | 1 | **1** |
| Tools | mallet equipped, saw carried | same |
| Storage slots | 50 | **75** |

Build pays Carpentry XP with the same `ESTABLISH_XP_BONUS` treatment. One slot
holds one unique item stack of any size, matching the homestead.

Tier 1 gets **12 sell slots** and **6 buy-order slots**. Higher tiers raise
storage, sell slots and buy slots together; the ladder is future work, but every
number must live in a per-tier table so adding tier 2 is data, not code.

### 4.2 Schema

```
player_shops
  id, property_id (unique, FK player_properties)
  name (60), description (text)
  sell_slots (default 12), buy_slots (default 6)
  till_gold (bigint, default 0)
  buy_fund_gold (bigint, default 0)
  is_open (bool, default true)
  timestamps

shop_listings
  id, shop_id, item_id, quantity (bigint), unit_price
  unique (shop_id, item_id)

shop_buy_orders
  id, shop_id, item_id
  quantity_wanted, quantity_filled, unit_price
  unique (shop_id, item_id)

shop_transactions
  id, shop_id, item_id, quantity, unit_price, gross, tax
  direction ('sale' | 'purchase')
  counterparty_player_id
  created_at
```

`shop_transactions` is history. It is readable in admin and never editable, for
the same reason `purchases` and `trades` are not.

### 4.3 Escrow, both sides

**Items.** Creating a listing moves the stack from `property_storage` into the
listing. Goods that are for sale are not also in storage. Cancelling returns
them, which needs a free storage slot, so refuse the cancel with a clear message
if storage is full rather than deleting anything.

**Gold.** You deposit gold into the shop's buy fund. Each order reserves against
it:

```
reserved  = Σ (quantity_wanted − quantity_filled) × unit_price
available = buy_fund_gold − reserved
```

Posting an order requires `available ≥ cost`. Withdrawals are capped at
`available`. Cancelling an order releases its reservation. When an order fills,
gold leaves `buy_fund_gold` and goes to the seller.

This is what stops five 500g orders sitting on a 500g fund and four sellers
hitting an error at the worst possible moment.

### 4.4 A sale

Buyer is at Talador, enters a shopfront, buys N of a listing. Inside one
transaction, with both player rows locked:

1. Re-read the listing. Quantity or price may have changed since the page
   rendered, so this is not optional.
2. `gross = N × unit_price`. Check buyer gold.
3. `tax = floor(gross × 0.03)`. Small sales round to zero tax, which is fine.
4. Buyer gold − gross, ledger row `shop_purchase`.
5. Shop till + `(gross − tax)`. Ledger row `shop_sale` against the owner, plus
   `shop_tax` for the cut.
6. Decrement or delete the listing; items to buyer inventory. If the buyer has
   no room, fail cleanly before anything moves.
7. Insert `shop_transactions`.

Selling into a buy order is the mirror image, filling partially where the seller
has fewer than the order wants.

The owner withdraws the till on a later visit. Sale notifications can wait; a
till counter visible on the Manage tab is enough for v1.

---

## 5. Client

### 5.1 Talador

Two entries following the existing `isNovita` submenu pattern in
`LocationPanel.tsx`: **Taiar Marketplace** and **Player Shops**.

### 5.2 Marketplace panel

Merchant list, then per merchant a Buy tab and a Sell tab. Sell shows your
carried items with what each will actually fetch today, including the step-down
warning. Buy shows today's stock with remaining daily allowance per line. The
tithe counter sits at the bottom.

### 5.3 Player Shops panel

- **Browse:** the shopfront list at Talador. Name, owner, description snippet.
- **Inside a shop:** description at the top, listings below, a text filter box,
  and sort by name or unit price, ascending or descending. Buy orders the shop
  is running are shown in a second section so a visitor can sell into them.
- **Your shop:** defaults to a **Storage** tab identical to the homestead's, with
  a **Manage Shop** tab for name and description, listings, buy orders, the till,
  and the buy fund.

### 5.4 Skills tab header

Above the skills grid in `SkillsPanel.tsx`: player name, total level, total XP,
gold, then a rule. `/player` already returns `totalLevel` and `totalXp` computed
only over `skills.is_implemented = true`, which is exactly the requested
behaviour, so this is a props-and-CSS change with no server work beyond adding
gold to the payload.

Compact. Two rows at most. The skills grid should not move down more than it has
to.

---

## 6. Build order

1. Migration: `players.gold`, `gold_ledger`. `services/gold.ts` with
   `getBalance`, `creditWithin`, `debitWithin`, all lock-aware.
2. Trade window gold: remove the block, move gold for real.
3. Skills tab header. Small, independent, gets gold visible early.
4. Migration: `npc_sale_daily`, `npc_purchase_daily`, merchant NPC rows.
   `services/marketplace.ts` with the walls, the domain map, the step-down and
   the date-seeded rotation.
5. `routes/marketplace.ts` + `MarketplaceMenu.tsx` / `.css`.
6. (removed — folded into the new player tutorial, §8)
7. Migration: `player_shops`, `shop_listings`, `shop_buy_orders`,
   `shop_transactions`, plus the shop build path in `services/property.ts`.
8. `services-shops.ts` — listings, orders, escrow, the sale transaction.
9. `routes-shops.ts` + `ShopPanel.tsx` / `.css`, browse and shopfront.
10. Your-shop management: Storage and Manage tabs.
11. **Arbitrage validate check.** Walk every recipe: if
    `NPC-sell(inputs) < NPC-buy(output)` anywhere, flag it. Structurally
    impossible while the walls hold, but content rows change and the report
    should prove it forever. Extends the existing validate work.
12. Admin: gold grant, ledger view, shop browser, reconciliation report.

Type-check between every increment, both `-p tsconfig.app.json` and
`-p tsconfig.migrations.json`.

---

## 7. Open and deferred

- **Blocking:** deploy fishing + registry to live, re-export snapshots, re-run
  `values:derive -- --write`, hand-tune the remainder. See `economy-spec.md` §3.
- **Still open from economy-spec:** the `Lanai Bark` / `Deerhide` / `Boarhide` /
  `Slothhide` seed drift, and the fresh-install migration ordering faults.
- **Poll the player base** on one shop per island versus one per location.
  Keep the location out of hard-coded paths so the answer is cheap to act on.
- **Deferred:** shop tier ladder, stall rent, sale notifications, the suspicious
  trades tool (`docs/IDEAS.md`), the donator monument.
---

## 8. New Player Tutorial (added 2026-08-10, same patch)

Alpha players new to the genre have reported not knowing what to do or even how
to travel to an adjacent town. That is a first-session retention problem, and it
gets worse the moment the game is actually advertised.

**Shape.** A guide NPC at Talador runs a short, guided click-through: a rundown
of the screen regions, then getting around. Nice and in depth, but quick to
finish. Skippable, but skipping forfeits the reward, so it should not be.

**Rewards.** The **Novice's Pony** (already seeded: `tier 0`, `quality starter`,
`travel_speed_modifier 0.65`, `travel_floor 0.40`, currently granted only by
`04_dev_setup.ts`) plus starting gold.

**Single source of gold.** LOCKED: this is the only quest that grants starting
gold. The separate marketplace tutorial quest is cut. Nothing else pays a new
player before they have earned it.

**Travel gate.** Attempting to travel before speaking to the guide raises a
confirmation the player must click through, reminding them to talk to him first.
A reminder, not a wall: it must always be possible to proceed.

**The real work is the highlight primitive, not the quest.** Pointing at "the
equipment panel" or "the travel button" needs a reusable spotlight overlay plus
stable anchor targets (`data-tutorial-anchor` attributes) on every region it
points at. Build it generically: the skill tutors will want it, and retrofitting
anchors later across a dozen panels is much worse than adding them once.

Sequencing risk worth naming: the anchor attributes touch the same client
components as the shop and marketplace panels. Landing the tutorial *after*
those panels exist avoids anchoring things that are about to move.

**Naming.** The guide is not a skill tutor, so `Geo-` does not apply. Third
naming register, after tutors and merchants.

**Open:** exact step list and copy, and whether the pony is granted equipped or
granted with "now equip it" as a tutorial step. The latter teaches more.


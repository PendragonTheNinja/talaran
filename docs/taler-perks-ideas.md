# Taler perks: ideas

*Brainstorm, 2026-11-27, with Nathan's answers the same day.*

## Decided and built (2026-11-27)

| Idea | Decision | Built |
|---|---|---|
| Supporter badges | Yes: $5, $20, $50, $100, $1,000 given in all | `services/supporter.ts`, migration `20261127160000` (glyphs until art) |
| Supporter titles | Yes | four titles in `services/store.ts` STORE_TITLES, 300 each |
| Name change | Yes, with one free for everyone | `services/nameChange.ts`, migration `20261127170000`, Settings > Profile, admin undo |
| Name color | Yes | perk:name_color, eight colors, chat and Players Here |
| Gifting | Yes | `giftItem`, a Give button on every store card |
| Patrons plaque | Yes, as a museum plaque of the top ten (rank and name, never amounts; opt-out) | museum Patrons tab |
| Seasonal themes | Yes: Christmas first | Yuletide, sold through December |
| Avatar frames, chat emotes, shop sign and awning, bell packs | Yes | waiting on art and sounds |
| Profile backdrop | Not now | |
| Boat livery, mount trappings, map styles, guild banner | Later | |
| Homestead sign, gilded plaque | Unsure | |
| Lanterns, the toast | No | |


## What is on sale today

`services/store.ts`, about 100 Talers to the dollar (`config/talerTiers.ts`, $5 to $100 with up to +20%):

| Item | Price |
|---|---|
| Themes: Moonveil, Mosswood, Forgeheart (Hallowtide in its season) | 300 each, 750 the three |
| Custom Palettes (editor, the three themes, sharing) | 1,500 |
| Custom Sound (your own timer bell) | 500 |

All of it is how the game looks to the buyer alone. Nobody else can see any of it, which is the main gap: in an MMO, people pay most for what other people see.

## The rules every idea below keeps

1. **No power.** Nothing that moves gold, items, XP, speed, drops, storage, or safety. A free player and a paying one stand level at a tear, a bench, and a pen.
2. **Nothing tradeable.** Every perk is bound to the account, so Talers never become gold by the back door (the Crier's chits rule: "keep anything they buy untradeable, or votes become gold").
3. **Seen by others, where it can be.** The worth of a cosmetic in a shared world is that it is shared.
4. **Words go through the filter.** Anything a player names (a boat, a homestead, a sign) goes through `namesRefusal`, as usernames do, and staff can clear it, as avatars are cleared now.
5. **Guests cannot buy** (they cannot today).

## Ideas, by where they show

### On the player (seen by everyone)

| Idea | What it is | Rough price | Notes |
|---|---|---|---|
| **Avatar frames** | A border around the avatar on the profile, the fight view, and the guild list: knotwork, gilt, driftwood, a seasonal one | 200 to 400 each | Cheap to make, very visible. Strong first candidate. |
| **Name color in chat** | A handful of curated colors for one's name in chat and Players Here | 400 | Curated only, so nobody is unreadable on any theme. |
| **Profile backdrop** | The picture behind a player's profile: a harbor at dusk, the Rift, a forge | 300 each | Uses the place art already being painted. |
| **Showcase shelf** | A row on the profile showing up to five chosen items, feats, or trophies the player owns | 500 | Pure bragging, earned things only: the money buys the shelf, never what goes on it. |
| **Supporter titles** | A short list of titles ("the Generous", "Lamplighter", "Friend of the Sloth") worn like feat titles | 300 each | Curated, so no moderation. |
| **Name change** | A new username, once, through `cleanUsername` and the filter, with the old name kept in the profile's history for a while | 500 | Wanted in every MMO; needs a cooldown and a staff log. |

### On what they own (seen by visitors)

| Idea | What it is | Rough price | Notes |
|---|---|---|---|
| **Boat livery** | Sail color, a figurehead, and a name painted on the hull, shown when the boat is moored or sailing | 300, name 200 | Boats are new and a point of pride. |
| **Mount trappings** | A saddle cloth color and a few tack styles, shown on the profile and the travel scene | 300 | No speed, only looks. |
| **Homestead sign** | A carved sign with the homestead's name, shown to anyone who visits | 200 | Name through the filter. |
| **Shop sign and awning** | A sign style and awning color for a player shop, shown in Wendhaven's and Talador's shop lists | 300 | Shops are player commerce; this changes only the look. |
| **Guild banner** | A crest built from parts (field, charge, colors), flown at the hall and beside the guild tag | 1,000 | Any member may buy it for the guild. Big, social, and shared. |

### In the world (everyone sees it, nobody is helped)

| Idea | What it is | Rough price | Notes |
|---|---|---|---|
| **Lanterns over a town** | A line in chat ("Pendragon has hung lanterns over Talador") and lanterns drawn on that town's scene for an hour | 100 | A small, cheerful thing a supporter does for everyone. No buff. |
| **A round for the house, the cosmetic way** | At a tavern: everyone there gets a drink line and a toast in the Chronicle's tavern talk | 150 | The Ale round already gives a buff for gold; this is the Taler version with no buff, so it is never pay to win. |
| **Patron of the museum** | An opt-in plaque on a museum wall listing those who supported the game | free with any purchase | Recognition, not a product. |
| **Gilded donor plaque** | A gold-leaf border on one's own museum plaques | 300 | Plaques stay earned (earliest donation); only their look is bought. |

### For the screen (the buyer alone, like today's items)

| Idea | What it is | Rough price | Notes |
|---|---|---|---|
| **More seasonal themes** | Yuletide, Midsummer, Harvest, alongside Hallowtide | 300 each | Proven: Hallowtide exists. |
| **Bell packs** | Curated timer bells (anvil, church bell, gull, horn of Annwn) for those who will not record their own | 200 | Custom Sound's cheaper cousin. |
| **Chat emotes** | A small set of game-art emotes for chat | 300 the set | Others see them, so they count as social too. |
| **Map styles** | The island and world maps drawn as a sea chart, a monk's copy, a burned scrap | 300 each | Uses map art already wanted. |

### Recognition for supporting at all (not sold)

- **Supporter badge, by lifetime support**: bronze, silver, gold, from Talers ever bought. Given, never sold, so the $5 supporter gets something on day one.
- **Gifting**: buy any perk for another player (never Talers, never gold). The gift arrives with the giver's name. This roughly doubles who can be reached: the people who would never buy for themselves but will for a friend or a guildmate.

## Leave out

- **Extra storage, bank, pack, or loadout slots, faster timers, XP boosts, or "skip" anything.** Power, however small.
- **Buying a Chronicle line, a feat, a title that reads like a feat, or a place on a board.** Those are the game's honest record.
- **Paying to send a tear or start a world event.** It would change everyone's day for one player's money, and tears are staff's.
- **Loot boxes or random cosmetics.** Unpleasant, and in some places regulated.

## A first batch, if wanted

Cheap to build, seen by others, and close to systems that exist:

1. **Avatar frames** (avatars and the fight view exist).
2. **Supporter badge by lifetime support** (feats and badges exist; free to the buyer).
3. **Supporter titles** (titles exist).
4. **Name change** (`cleanUsername`, the filter, and `endSessions` exist).
5. **Lanterns over a town** (chat announcements and scene art exist).
6. **Gifting** (the store's buy path, made to name a recipient).

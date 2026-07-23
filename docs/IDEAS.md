# Talaran — Future Ideas & Long-Term To-Do

Parking lot for features we've discussed but aren't building yet. Not committed
scope; a place so good ideas don't get lost between sessions.

---

## Event Chat — the "firsts" feed  *(wanted, not started)*

A global, server-wide event chat that broadcasts notable **firsts** and **unique
drops** to everyone in Talaran.

**Core idea**
- The **first** player to do something in the game triggers a broadcast: "PlayerX
  is the first in Talaran to mine Craxial Ore!" — and the same for the first catch
  of a new fish, first craft of a new item, first kill of a new creature, etc.
- Every **unique / rare drop** also gets announced ("PlayerY found a Squonk!").
- Expected to be **spammy right after launch or a content update** (lots of firsts
  at once) — that's fine, it's an exciting period. It naturally settles down until
  only genuinely rare drops remain in the feed.

**Scope thoughts**
- Wants to cover *everything* firstable: ores, fish, crops, catches, crafts, drops,
  skill milestones, discoveries, etc. Likely a general "first-event" ledger keyed by
  (event_type, event_key) so a broadcast fires the first time any key is seen.
- **Admin tool** to push **custom / retroactive** announcements — e.g. "first
  donator" for someone who already donated $20 before the system existed. Same
  visual treatment, manually triggered.

**Why it's cool:** turns milestones into shared community moments and gives content
updates a built-in hype loop.

---

import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Antura's islets (docs/islets-plan.md; Nathan, 2026-11-23): eight on Taiar's
// pattern, reached in a Cog from Wendhaven (putToSea wants a boat of the
// island's tier), with tier 2 finds.
//
//   The eight      the Pine Holm, the Granite Skerry, the Shingle Spit, the
//                  Kelp Reef, the Grass Holm (common, 16 each); the Bird Cliff
//                  and the Tide-Cut Quarry (seldom, 8); the Wreck (rare, 4).
//                  Standing names: players may give their own (services/isletNames.ts).
//   'nests'        a new find, handed over there and then from
//                  islet_find_items as young and flowers are: birds' nests
//                  off the Bird Cliff's ledges, a feather source.
//   Work finds     Antura has no trees or game of its own, so a stand or a trail
//                  on its islets is the best the player can work on any island
//                  (services/isletFinds.ts targetFor).
//   The guardians  three of the sea (simulated 2026-11-23 against a one-hand
//                  fighter at the guardian's level, with its weakness): the Blue
//                  Man of the Minch (15) 103 s and 33% of health, the gentle one;
//                  the Each-uisge (17) 93 s and 46%, which drags a swing back
//                  12% of the time (creatures.hesitate_pct and hesitate_text);
//                  the Nuckelavee (20) 131 s and 52%, the real fight. XP per
//                  kill is the level's (xpPerKillAt: 37, 40, 46) times the fight's length
//                  over a normal kill's (3, 2.5, 3.5), as the Taiar three were set.
//                  Each always drops a Locked Antura Chest, and its keepsake 1 in 20.
//   The chest      the Locked Antura Chest (Geoffrey's lock, 200 gold) and the
//                  Antura Chest, which holds Antura's three pieces of the
//                  sailor's set (container_types.set_island, new): the Oilskin
//                  Smock, Canvas Slops, and Boat Cloak, worn from Wayfaring 13.
//   Quank          met once on Antura's islets: a first meeting gives a Tidbit as
//                  on Taiar; one who carries Taiar's Tidbit gives it back and gets a
//                  receipt, which finishes his quest; one who does not is looked at.
//   The ship's log Taiar's lines that name nothing of Taiar's go to every island
//                  (island null); those about Taiar, Talador, or rowing stay its own,
//                  and Antura gets a few of its own.
//
// Also creatures.hesitate_text: what stays a strike, in the creature's words
// (the Siren's, written into the client until now, becomes her row).

const ISLAND = 'Antura';

const ISLETS: { name: string; kind: string; weight: number; description: string; arrive: string[] }[] = [
    {
        name: 'The Pine Holm', kind: 'common', weight: 16,
        description: 'A steep knuckle of rock with black pines clinging to it, grown short and stubborn in the wind off the Narrows. The needles underfoot are a foot deep.',
        arrive: [
            'You bring the Cog round into the lee and drop the anchor. The pines creak all together, like a crowd shifting its feet.',
            'There is no beach, only a ledge of rock and the roots of the first pines gripping it. You step from the gunwale onto the roots.',
            'Resin and salt. The wind drops the moment you are under the trees, and you can hear yourself breathe.',
        ],
    },
    {
        name: 'The Granite Skerry', kind: 'common', weight: 16,
        description: 'A low whale-back of gray granite, scoured bare by the sea, with seals hauled out along its flanks. Pink stone shows where the surf has cut it.',
        arrive: [
            'The seals watch you come in, decide you are not worth moving for, and go back to sleep.',
            'You make fast to a horn of rock. The granite is rough enough to stand on in bare feet, and cold enough to regret it.',
            'Gray stone, pink stone, and the sea sucking at the cracks. Someone has scratched a mark here, long ago, and the weather has nearly had it.',
        ],
    },
    {
        name: 'The Shingle Spit', kind: 'common', weight: 16,
        description: 'A long bank of round gray pebbles, piled up by the tide and dragged down by it again. Every wave makes it rattle like a sack of teeth.',
        arrive: [
            'The Cog grounds on shingle with a long grinding crunch. You wince, and jump down.',
            'Walking on it is like walking on marbles. The spit runs out into the sea further than you can see in the spray.',
            'The tide is drawing back and the whole bank is talking, every pebble at once.',
        ],
    },
    {
        name: 'The Kelp Reef', kind: 'common', weight: 16,
        description: 'Rocks a man could stand on at low water, ringed by a forest of kelp so thick the swell dies in it. Otters live in the forest and do not care who knows.',
        arrive: [
            'The kelp takes the Cog gently, like a hand, and holds her. You climb out onto a rock slick with weed.',
            'An otter floating on its back cracks a shell on its chest and watches you while it eats.',
            'Under the kelp the water is green and gold and full of small quick shapes. Above it, the gulls are already arguing.',
        ],
    },
    {
        name: 'The Grass Holm', kind: 'common', weight: 16,
        description: 'Round and green and cropped short, with an old stone fold on top that nobody has used in years. Larks go up from it all day long.',
        arrive: [
            'You run the Cog up on a little beach of crushed shell and walk up into the grass. The larks go up all round you.',
            'A stone fold on the crown of the holm, its gate long gone. Something has been sheltering in it, and not long ago.',
            'Turf so short and springy it feels like a rug. The wind smells of thyme.',
        ],
    },
    {
        name: 'The Bird Cliff', kind: 'seldom', weight: 8,
        description: 'A sheer wall of rock straight up out of deep water, every ledge packed with nesting birds. There is one way up, and the birds use it as a lavatory.',
        arrive: [
            'You stand off and let the Cog drift in on the swell. The noise of the birds is a wall of its own.',
            'Gannets come and go like thrown spears. Puffins stand on the ledges in rows, as if waiting to be inspected.',
            'You find the one crack in the cliff that goes up, and climb it with your face as close to the rock as you can stand.',
        ],
    },
    {
        name: 'The Tide-Cut Quarry', kind: 'seldom', weight: 8,
        description: 'Somebody quarried granite here and the sea came in to finish the job. Twice a day the tide floods the cuttings, and twice a day it drains them, and the walls are streaked dark with ore.',
        arrive: [
            'The tide is out. The cuttings stand empty and dripping, their floors carpeted in weed and stranded fish.',
            'Old wedge holes run along the walls in neat rows. Whoever worked here meant to come back.',
            'The rock here is darker than the skerries\' granite, and when the sun catches it, it shows a blue-gray sheen.',
        ],
    },
    {
        name: 'The Wreck', kind: 'rare', weight: 4,
        description: 'A great ship lies on her side on a reef far out from Wendhaven, her ribs open to the sky. Nobody in Wendhaven will say whose she was, or how long she has been there.',
        arrive: [
            'She comes out of the haze all at once: a hull bigger than any in Wendhaven harbor, heeled over on the rocks as if she lay down to sleep.',
            'You climb in through a gap in her planking. Inside, it is like a church with the roof off.',
            'The mast is still standing, though the ship is on her side, so it points out over the sea like a finger. You do not look where it points for long.',
        ],
    },
];

const LINES: Record<string, string[]> = {
    set_out: [
        'You cast off from the Wendhaven slip and let the tide take the Cog out past the harbor wall.',
        'The sail fills with a crack and the Cog leans into it. Wendhaven drops behind, roofs and smoke and noise.',
        'A fisherman mending nets on the quay watches you go and says nothing, which in Wendhaven is a blessing.',
        'Out past the breakwater the sea turns from brown to green to the dark blue of deep water.',
    ],
    sail_on: [
        'You haul the anchor and put the islet astern. There is always another one, out here.',
        'The Cog swings her bow round to open water. The islet shrinks to a smudge, then to nothing.',
        'You leave it behind. The wind is fair and the day is not over.',
    ],
    home: [
        'Wendhaven comes up out of the haze, its roofs and its masts and its gulls.',
        'You bring the Cog in on the flood tide and lay her alongside the slip as gently as you can.',
        'The harbor smells of tar and fish and woodsmoke. After the islets, it smells like company.',
        'Somebody on the quay catches your line and makes it fast before you can ask.',
    ],
    strandline: [
        'Along the wrack line, between the kelp and the cork, you find {find}.',
        'The tide has left something here, as it always does: {find}.',
        'You walk the shore before you do anything else, and turn up {find}.',
        'Tangled in a mat of weed above the tideline: {find}.',
    ],
    unnamed: [
        'Nobody has put a name to this place yet. If you have one, the Harbor Council will hear it, so long as you put it forward before you leave.',
        'There is no name for this islet on any chart. Put one to the Harbor Council before you push off, and it may be yours.',
    ],
    find_stand: [
        'Back from the shore, a stand of timber nobody has ever cut, grown thick and straight where the wind cannot reach.',
        'The trees here are old, and close, and nobody has put an axe to them in living memory.',
    ],
    find_vein: [
        'Where the sea has bitten into the rock, a seam of ore shows in the wet face, bright as a coin.',
        'A vein runs down the cutting into the water, fat with ore and washed clean by the tide.',
    ],
    find_shoal: [
        'Off the point the water is thick with fish, turning all at once so the sea flashes silver.',
        'The birds give it away, diving and diving. Under them the water is crowded with a shoal.',
    ],
    find_patch: [
        'In a hollow out of the wind the ground is thick with growth nobody has picked: leaves, seeds, roots, and all.',
        'Sheltered behind the rocks, a patch of green so thick you have to push through it.',
    ],
    find_trail: [
        'Tracks in the soft ground, and a path worn through the grass. Something lives here that has never seen a bow.',
        'A game trail runs the length of the holm, worn deep. You nock an arrow without thinking.',
    ],
    find_nothing: [
        'You walk the islet end to end. Rock, weed, and gulls. Nothing else worth the trip, this time.',
        'A quiet landing. The shore gave what it gave, and the rest of the islet keeps its counsel.',
    ],
    find_chest: [
        'Above the tideline the shingle is heaped wrong. You dig, and the corner of a small chest comes up.',
        'Wedged in a crack where only a storm could have put it: a little strongbox, crusted shut.',
    ],
    find_young: [
        'Something is calling in the long grass. You go to look, and find {find}.',
        'You are not alone out here after all: {find}.',
    ],
    find_flowers: [
        'The turf is starred with flowers nobody has ever picked. You gather {find} for the pens at home.',
        'Out of the wind, in a fold of the rock, you find {find}, and take them home for the pens.',
    ],
    find_nests: [
        'You work along a ledge, with the birds shrieking at every step, and come back with {find}.',
        'The lowest ledges are crammed with old nests the birds have given up on. You take {find}.',
    ],
    find_artefact: [
        'In the wreck\'s dark belly, where the water has drained away: {find}. Nobody has touched it since she went down.',
        'Wedged behind a rib of the hull, as if somebody hid it there to keep: {find}.',
        'Your boot turns something up out of the sand that has drifted in through her side: {find}.',
    ],
    // Quank's scenes on Antura's islets, told in order (services/isletFinds.ts).
    quank: [
        'There is a man at the end of the islet, sitting on a coil of rope and reading a chart upside down.',
        'It is Quank. "I have not left the square," he says, without looking up. "This is a different square."',
        'He folds the chart into something like a hat, presses a little parcel into your hand, and says, "A tidbit. Mind it."',
        'When you look up from it, the rope is coiled neatly and nobody is sitting on it.',
    ],
    quank_back: [
        'Somebody has lit a very small fire at the end of the islet and is warming his hands over it, though it is not cold.',
        'It is Quank. He holds out a hand without looking round. "My tidbit," he says.',
        'You give it to him. He turns it over, sniffs it, and tucks it into his coat as if you had borrowed it for a day and brought it back a little late.',
        'Then he writes something on a scrap of paper, signs it with a flourish, and hands it to you. When you look up from it, the fire is out and the islet is empty.',
    ],
    quank_owed: [
        'Somebody has lit a very small fire at the end of the islet and is warming his hands over it, though it is not cold.',
        'It is Quank. He holds out a hand without looking round. "My tidbit," he says.',
        'You do not have it with you. He looks at your empty hand for a long moment, then at you, then back at the hand.',
        '"Another time," he says. When you look up, the fire is out and the islet is empty.',
    ],
};

// [item or 'coins', min, max, weight, words for one, words for many ({n})]
const STRANDLINE: [string, number, number, number, string, string][] = [
    ['coins', 4, 15, 30, 'a coin', '{n} coins, black with the sea'],
    ['Barley Seeds', 2, 4, 8, 'a seed of barley', 'a twist of barley seed, {n} or so'],
    ['Leek Seeds', 2, 4, 8, 'a leek seed', '{n} leek seeds in a split paper'],
    ['Beet Seeds', 2, 4, 8, 'a beet seed', '{n} beet seeds in the corner of a broken crate'],
    ['Broad Bean Seeds', 1, 3, 6, 'a broad bean, good for sowing', '{n} broad beans, good for sowing'],
    ['Cabbage Seeds', 2, 4, 6, 'a cabbage seed', 'a pinch of cabbage seed, {n} or so'],
    ['Gooseberry Cutting', 1, 1, 3, 'a gooseberry cutting, still green', '{n} gooseberry cuttings, still green'],
    ['Samphire', 2, 5, 10, 'a sprig of samphire', '{n} sprigs of samphire'],
    ['River Mussel', 1, 2, 8, 'a mussel, shut tight', '{n} mussels, shut tight'],
    ['Bird Nest', 1, 1, 5, 'a bird\'s nest blown down off the rocks', '{n} birds\' nests'],
    ['Locked Rusty Chest', 1, 1, 3, 'a small chest, rusted shut', '{n} small chests, rusted shut'],
];

// [kind, item, min, max, weight, words for one, words for many ({n})]
const HANDOUTS: [string, string, number, number, number, string, string][] = [
    ['young', 'Chick', 1, 2, 30, 'a chick, cheeping in the grass', '{n} chicks, cheeping in the grass'],
    ['young', 'Calf', 1, 1, 30, 'a calf, wet-nosed and lost', '{n} calves, wet-nosed and lost'],
    ['young', 'Piglet', 1, 1, 20, 'a piglet gone half wild', '{n} piglets gone half wild'],
    ['young', 'Rouncey Foal', 1, 1, 12, 'a rouncey foal, alone and frightened', '{n} rouncey foals'],
    ['young', 'Palfrey Foal', 1, 1, 8, 'a palfrey foal, fine-boned and nervous', '{n} palfrey foals'],
    ['flowers', 'Spring Gentian', 2, 4, 35, 'a spring gentian', '{n} spring gentians'],
    ['flowers', 'Wayfarer\'s Star', 2, 3, 30, 'a wayfarer\'s star', '{n} wayfarer\'s stars'],
    ['flowers', 'Sea Thrift', 2, 5, 35, 'a tuft of sea thrift', '{n} tufts of sea thrift'],
    ['nests', 'Bird Nest', 1, 3, 1, 'a bird\'s nest', '{n} birds\' nests'],
];

const HOLDS: Record<string, [string, number][]> = {
    'The Pine Holm': [['stand', 30], ['patch', 15], ['nothing', 14], ['chest', 12], ['young', 8], ['flowers', 10], ['quank', 1]],
    'The Granite Skerry': [['vein', 45], ['nothing', 14], ['chest', 12], ['cache', 10], ['quank', 1]],
    'The Shingle Spit': [['shoal', 45], ['nothing', 14], ['chest', 12], ['quank', 1]],
    'The Kelp Reef': [['shoal', 45], ['nothing', 14], ['chest', 12], ['cache', 10], ['quank', 1]],
    'The Grass Holm': [['patch', 25], ['trail', 20], ['nothing', 14], ['chest', 12], ['young', 8], ['flowers', 10], ['quank', 1]],
    'The Bird Cliff': [['nests', 25], ['shoal', 20], ['nothing', 5], ['chest', 10], ['cache', 20], ['young', 15], ['artefact', 3], ['quank', 2]],
    'The Tide-Cut Quarry': [['vein', 45], ['nothing', 5], ['chest', 10], ['cache', 20], ['artefact', 3], ['quank', 2]],
    'The Wreck': [['nothing', 1], ['chest', 30], ['cache', 20], ['artefact', 25], ['quank', 10]],
};

type Row = Record<string, unknown> & { name: string };

const LOCKED = 'Locked Antura Chest';
const CHEST = 'Antura Chest';

const SET = (name: string, slot: string, description: string): Row => ({
    name, type: 'armor', subtype: 'sailors_set', slot, tier: 2, level_required: 13, island: ISLAND,
    sea_speed_pct: 1, set_island: ISLAND, durability_uses: 900, durability_break_pct: 0.2, description,
});
const KEEPSAKE = (name: string, description: string): Row => ({
    name, type: 'curio', subtype: 'keepsake', tier: 2, level_required: 1, island: ISLAND, description,
});
const ARTEFACT = (name: string, description: string): Row => ({
    name, type: 'curio', subtype: 'artefact', tier: 2, level_required: 1, island: ISLAND, set_island: ISLAND, description,
});

const ITEMS: Row[] = [
    { name: LOCKED, type: 'collectible', subtype: 'container_locked', tier: 2, level_required: 1, island: ISLAND,
      description: 'A heavy chest bound in Serph, black with weed, its lock rusted into one lump. It was packed for a long voyage.' },
    { name: CHEST, type: 'collectible', subtype: 'container', tier: 2, level_required: 1, island: ISLAND,
      description: 'A Serph-bound chest with its lock picked. The lid groans, but it opens.' },
    SET('Oilskin Smock', 'chest', 'A smock of sailcloth soaked in linseed and left to cure until it creaks. Water beads on it and runs straight off.'),
    SET('Canvas Slops', 'legs', 'Wide canvas breeches cut short at the shin, so they never drag in the bilge. Every sailor in Wendhaven owns a pair.'),
    SET('Boat Cloak', 'back', 'A heavy wool cloak with a deep hood and a fold to wrap round the face. Soaked through, it is still warm.'),
    KEEPSAKE('Blue Man\'s Conch', 'A big whorled shell with its point knocked off for blowing. Hold it to your ear and you hear weather coming.'),
    KEEPSAKE('Water Horse\'s Mane-Knot', 'A knot of coarse black hair braided with weed. It has been out of the sea for days and is still wet.'),
    KEEPSAKE('Drowned Rider\'s Spur', 'A spur of Serph, green with salt, on a strap that has rotted through. Whoever wore it rode something that did not walk on land.'),
    KEEPSAKE('Quank\'s Receipt', 'A scrap of paper in a careful hand: "Received, one Tidbit, back half, in fair condition. Q." There is no mention of the front half.'),
    ARTEFACT('Ship\'s Bell Clapper', 'The tongue of a ship\'s bell, long as a forearm and heavy as a cudgel. The bell itself is somewhere on the bottom.'),
    ARTEFACT('Figurehead\'s Hand', 'A carved wooden hand, painted once, holding nothing. The rest of the figurehead went over the side with the ship.'),
    ARTEFACT('Navigator\'s Bowl', 'A shallow bowl of Serph with a socket in the middle for a needle, and the needle long gone. The marks round the rim point to places on no chart in Wendhaven.'),
    ARTEFACT('Sealed Letter Case', 'A leather tube stopped with wax, the wax unbroken. The letter inside, if there is one, was never delivered.'),
];

const CONTAINER = { item: CHEST, key: 'antura_chest', skill: 'Fishing', timer_seconds: 10, xp: 12,
    coin_one_in: 1, coin_min: 120, coin_max: 400, empty_text: 'Coins, and a smell of tar and old rope. The rest has rotted.', set_island: ISLAND };
const LOCK = { locked_item: LOCKED, unlocked_item: CHEST, fee: 200 };

// [item, 1 in N, min, max]
const CONTENTS: [string, number, number, number][] = [
    ['Serph Ingot', 3, 2, 5],
    ['Serph Nails', 3, 10, 30],
    ['Lanai Planks', 3, 5, 15],
    ['Granite Block', 4, 5, 15],
    ['Linen Cloth', 4, 1, 3],
    ['Charc', 4, 5, 10],
    ['Cooked Mackerel', 4, 2, 4],
    ['Salt Fish', 8, 1, 2],
    ['Rough Garnet', 6, 1, 1],
    ['Locked Sea Chest', 10, 1, 1],
    ['Rough Amethyst', 300, 1, 1],
];

const GUARDIANS = [
    {
        key: 'blue_man', name: 'Blue Man of the Minch', level: 15, accuracy: 0.95, defence: 1.15, power: 1.1, hp: 2.8, swing_seconds: 3.8,
        stance_pierce: 'resistant', stance_slash: 'neutral', stance_crush: 'weak', xp_multiplier: 3, xp_per_kill: 111, hesitate_pct: null, hesitate_text: null,
        description: 'A long blue man, smooth as a seal, who rises out of the swell to the waist and calls out a riddle in rhyme. Get it wrong and he brings the sea down on you.',
        lore: 'The Blue Men keep the narrow waters. They will let a boat pass for a good answer, and take it for a poor one.',
        keepsake: 'Blue Man\'s Conch',
        islets: ['The Granite Skerry', 'The Tide-Cut Quarry'],
        spot: { name: 'The Blue Man\'s Water', description: 'A channel of dark water between the rocks, with a chest wedged at the bottom of it, and something long and blue lying in the channel with it.' },
        lines: [
            'In the channel between the rocks a chest lies wedged on the bottom, and something long and blue is lying in the water beside it, watching you.',
            'A voice comes up out of the swell in rhyme, asking whose chest that is on the rocks. Whatever the right answer is, you do not know it.',
        ],
    },
    {
        key: 'each_uisge', name: 'Each-uisge', level: 17, accuracy: 1.15, defence: 0.95, power: 0.95, hp: 2.4, swing_seconds: 2.4,
        stance_pierce: 'weak', stance_slash: 'neutral', stance_crush: 'resistant', xp_multiplier: 2.5, xp_per_kill: 100, hesitate_pct: 12,
        hesitate_text: 'The Each-uisge drags you back a step through the shallows, and your swing is lost.',
        description: 'A black horse that walks up out of the sea with weed in its mane, gentle as a pony, waiting for someone to climb on. Nobody who climbs on gets off again.',
        lore: 'The water horse wants a rider. Its hide is sticky as pitch, and it takes whoever mounts it home to the bottom.',
        keepsake: 'Water Horse\'s Mane-Knot',
        islets: ['The Bird Cliff', 'The Kelp Reef'],
        spot: { name: 'The Water Horse\'s Shallows', description: 'Knee-deep water over sand, a chest half buried in it, and a black horse standing over the chest with its head down, as if grazing.' },
        lines: [
            'A black horse is standing in the shallows over a half-buried chest, wet to the withers. It lifts its head and looks at you as if it has been waiting.',
            'There are hoofprints coming up out of the sea, and they stop at a chest in the shallows. The horse that made them is still standing there.',
        ],
    },
    {
        key: 'nuckelavee', name: 'Nuckelavee', level: 20, accuracy: 1.0, defence: 1.05, power: 1.15, hp: 3.3, swing_seconds: 3.4,
        stance_pierce: 'resistant', stance_slash: 'weak', stance_crush: 'neutral', xp_multiplier: 3.5, xp_per_kill: 161, hesitate_pct: null, hesitate_text: null,
        description: 'Horse and rider grown into one, and neither has any skin. It comes up out of the sea, and wherever it breathes the grass goes black.',
        lore: 'The fishers of Wendhaven will not say its name at sea. They say it went down with a ship, and stayed with her.',
        keepsake: 'Drowned Rider\'s Spur',
        islets: ['The Wreck'],
        spot: { name: 'The Wreck\'s Hold', description: 'The dark of the wreck\'s hold, where a sea chest sits lashed to a rib of the hull, and something stands over it that is both horse and rider.' },
        lines: [
            'In the hold of the wreck a chest is lashed to the timbers, still. Something stands between you and it, and its breath smells of the bottom of the sea.',
            'You hear hooves on the deck above you, which is not possible, and then it comes down the hatch: horse and rider, one thing, and no skin on either.',
        ],
    },
];

const CACHE_WEIGHTS: Record<string, number> = {
    'The Granite Skerry': 10, 'The Kelp Reef': 10, 'The Bird Cliff': 20, 'The Tide-Cut Quarry': 20, 'The Wreck': 20,
};

const SIREN_TEXT = 'The Siren\'s song stays your hand, and the moment passes.';

const FEAT = {
    slug: 'quank-antura', name: 'Still Not Leaving the Square',
    description: 'Find Quank somewhere he says he is not, out among the islets off Antura.',
    title: null, badge: null, badge_key: null,
    criterion_kind: 'quank_met', criterion_target: ISLAND, criterion_value: 1,
    is_hidden: true, chronicle: false,
};

// Ship's log lines of Antura's own (services/shipLog.ts): [kind, weather, text].
const SHIP_LOG: [string, string | null, string][] = [
    ['sea', null, 'Antura is a dark line behind you now, with the high passes white above it.'],
    ['sea', null, 'The Narrows run hard here. The Cog crabs sideways across the current, and you let her.'],
    ['aboard', null, 'You ease the sheet and the Cog settles onto her course like a dog onto its bed.'],
    ['aboard', null, 'The yard creaks overhead. You look up, and it creaks again, as if to make a point.'],
    ['aboard', null, 'You go forward to clear a fouled line and come back aft soaked to the knee.'],
    ['sighting', null, 'A Wendhaven herring boat, deep in the water with her catch, beats home past you. Nobody aboard waves.'],
    ['sighting', null, 'Seals on a rock, a long way off, all lifting their heads at once to look at you.'],
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('container_types', 'set_island'))) {
        await knex.schema.alterTable('container_types', (t) => { t.string('set_island', 100).nullable(); });
    }
    if (!(await knex.schema.hasColumn('creatures', 'hesitate_text'))) {
        await knex.schema.alterTable('creatures', (t) => { t.string('hesitate_text', 200).nullable(); });
    }
    await knex('islet_find_kinds').insert({ key: 'nests', skill: null, amount_min: 0, amount_max: 0, boost: 1, is_active: true })
        .onConflict('key').merge();

    if (!(await hasContent(knex))) return;

    // What used to be written into code: Taiar's sea chest holds Taiar's pieces;
    // the Siren's song is her row's.
    await knex('container_types').where({ key: 'sea_chest' }).update({ set_island: 'Taiar Island' });
    await knex('creatures').where({ key: 'siren' }).update({ hesitate_text: SIREN_TEXT });

    const names = new Set<string>([...STRANDLINE.map(s => s[0]), ...HANDOUTS.map(h => h[1]), ...CONTENTS.map(c => c[0])]);
    names.delete('coins');
    for (const name of names) {
        if (ITEMS.some(i => i.name === name)) continue;
        if (!(await knex('items').where({ name }).first('id'))) throw new Error(`antura_islets: item "${name}" not found`);
    }
    if (!(await knex('vessel_types').where({ key: 'cog' }).first('id'))) throw new Error('antura_islets: the Cog is not built (run 20261120230000_cog first)');
    if (!(await knex('locations').where({ region: ISLAND, has_slip: true }).first('id'))) throw new Error('antura_islets: Antura has no slip to sail from');

    for (const item of ITEMS) {
        const had = await knex('items').where({ name: item.name }).first('id');
        if (had) await knex('items').where({ id: had.id }).update(item);
        else await knex('items').insert({ ...item, is_active: true });
    }

    // The islets and their lines. Lines for Antura are replaced whole, so a rerun never doubles them.
    await knex('voyage_lines').where({ island: ISLAND }).delete();
    const isletIds: Record<string, number> = {};
    for (const islet of ISLETS) {
        const row = {
            name: islet.name, region: ISLAND, type: 'islet', description: islet.description,
            is_safe: true, is_accessible: false, islet_kind: islet.kind, islet_weight: islet.weight,
        };
        const existing = await knex('locations').where({ name: islet.name }).first('id', 'region');
        let id: number;
        if (existing) {
            if (existing.region !== ISLAND) throw new Error(`antura_islets: a place called "${islet.name}" already stands on ${existing.region}`);
            await knex('locations').where({ id: existing.id }).update({ ...row, updated_at: knex.fn.now() });
            id = existing.id;
        } else {
            const [ins] = await knex('locations').insert(row).returning('id');
            id = typeof ins === 'object' ? ins.id : ins;
        }
        isletIds[islet.name] = id;
        await knex('voyage_lines').insert(islet.arrive.map(text => ({ island: ISLAND, moment: 'arrive', location_id: id, text })));
    }
    for (const [moment, texts] of Object.entries(LINES)) {
        // In order: Quank's scenes are told line by line, oldest id first.
        for (const text of texts) await knex('voyage_lines').insert({ island: ISLAND, moment, text });
    }

    for (const [item_name, min_qty, max_qty, weight, words_one, words_many] of STRANDLINE) {
        await knex('strandline_finds').insert({ island: ISLAND, item_name, min_qty, max_qty, weight, words_one, words_many, is_active: true })
            .onConflict(['island', 'item_name']).merge();
    }
    for (const [kind, item_name, min_qty, max_qty, weight, words_one, words_many] of HANDOUTS) {
        await knex('islet_find_items').insert({ island: ISLAND, kind, item_name, min_qty, max_qty, weight, words_one, words_many, is_active: true })
            .onConflict(['island', 'kind', 'item_name']).merge();
    }
    for (const [name, holds] of Object.entries(HOLDS)) {
        await knex('islet_finds').where({ location_id: isletIds[name] }).delete();
        for (const [kind, weight] of holds) await knex('islet_finds').insert({ location_id: isletIds[name], kind, weight });
    }

    // The chest, its lock, and what it holds.
    const chestItem = await knex('items').where({ name: CHEST }).first('id');
    const containerRow = { item_id: chestItem.id, key: CONTAINER.key, skill: CONTAINER.skill, timer_seconds: CONTAINER.timer_seconds, xp: CONTAINER.xp,
        coin_one_in: CONTAINER.coin_one_in, coin_min: CONTAINER.coin_min, coin_max: CONTAINER.coin_max, empty_text: CONTAINER.empty_text,
        set_island: CONTAINER.set_island, is_active: true };
    const hadContainer = await knex('container_types').where({ key: CONTAINER.key }).first('id');
    if (hadContainer) await knex('container_types').where({ id: hadContainer.id }).update(containerRow);
    else await knex('container_types').insert(containerRow);
    await knex('chest_locks').insert({ ...LOCK, is_active: true }).onConflict('locked_item').merge();
    const openKey = `open:${CHEST}`;
    await knex('drop_table_entries').where({ source_key: openKey }).delete();
    for (const [name, oneIn, min, max] of CONTENTS) {
        const item = await knex('items').where({ name }).first('id');
        await knex('drop_table_entries').insert({ source_key: openKey, item_id: item.id, chance_one_in: oneIn, chance_percent: null, min_qty: min, max_qty: max, is_active: true });
    }

    // The guardians.
    const locked = await knex('items').where({ name: LOCKED }).first('id');
    for (const g of GUARDIANS) {
        const row = {
            key: g.key, name: g.name, level: g.level, accuracy: g.accuracy, defence: g.defence, power: g.power, hp: g.hp,
            swing_seconds: g.swing_seconds, stance_pierce: g.stance_pierce, stance_slash: g.stance_slash, stance_crush: g.stance_crush,
            xp_multiplier: g.xp_multiplier, hesitate_pct: g.hesitate_pct, hesitate_text: g.hesitate_text,
            description: g.description, lore: g.lore, is_active: true,
            xp_per_kill: g.xp_per_kill,
        };
        const existing = await knex('creatures').where({ key: g.key }).first('id');
        let creatureId: number;
        if (existing) {
            await knex('creatures').where({ id: existing.id }).update(row);
            creatureId = existing.id;
        } else {
            const [ins] = await knex('creatures').insert(row).returning('id');
            creatureId = typeof ins === 'object' ? ins.id : ins;
        }
        const keepsake = await knex('items').where({ name: g.keepsake }).first('id');
        const source_key = `combat:${g.key}`;
        await knex('drop_table_entries').where({ source_key }).delete();
        await knex('drop_table_entries').insert([
            { source_key, item_id: locked.id, chance_one_in: 1, chance_percent: null, min_qty: 1, max_qty: 1, is_active: true },
            { source_key, item_id: keepsake.id, chance_one_in: 20, chance_percent: null, min_qty: 1, max_qty: 1, is_active: true },
        ]);
        for (const isletName of g.islets) {
            const isletId = isletIds[isletName];
            const key = `${g.key}_${isletName.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '')}`;
            const spotRow = { key, location_id: isletId, name: g.spot.name, kind: 'guardian', description: g.spot.description, display_order: 0, is_active: true };
            const hadSpot = await knex('fighting_spots').where({ key }).first('id');
            let spotId: number;
            if (hadSpot) {
                await knex('fighting_spots').where({ id: hadSpot.id }).update(spotRow);
                spotId = hadSpot.id;
            } else {
                const [ins] = await knex('fighting_spots').insert(spotRow).returning('id');
                spotId = typeof ins === 'object' ? ins.id : ins;
            }
            await knex('fighting_spot_creatures').where({ spot_id: spotId }).delete();
            await knex('fighting_spot_creatures').insert({ spot_id: spotId, creature_id: creatureId, weight: 1 });
            await knex('islet_finds').insert({ location_id: isletId, kind: 'cache', weight: CACHE_WEIGHTS[isletName] ?? 10 })
                .onConflict(['location_id', 'kind']).merge();
            await knex('voyage_lines').insert(g.lines.map(text => ({ island: ISLAND, moment: 'find_cache', location_id: isletId, text })));
        }
    }

    // Quank's feat for Antura, beside Taiar's.
    const taiarFeat = await knex('feats').where({ slug: 'quank-taiar' }).first('category', 'display_order');
    if (taiarFeat) {
        const featRow = { ...FEAT, category: taiarFeat.category, display_order: Number(taiarFeat.display_order) + 1, is_active: true };
        const had = await knex('feats').where({ slug: FEAT.slug }).first('id');
        if (had) await knex('feats').where({ id: had.id }).update(featRow);
        else await knex('feats').insert(featRow);
    }

    // The ship's log: lines that name nothing of Taiar's are for every island.
    // A story moves or stays whole.
    const TAIAR_ONLY = /\b(taiar|talador|oars?|row|rows|rowing|rowed)\b/i;
    const taiarLines = await knex('ship_log_lines').where({ island: 'Taiar Island' }).select('id', 'story_key', 'text');
    const keptStories = new Set(taiarLines.filter((l: any) => l.story_key && TAIAR_ONLY.test(l.text)).map((l: any) => l.story_key));
    const shared = taiarLines.filter((l: any) => (l.story_key ? !keptStories.has(l.story_key) : !TAIAR_ONLY.test(l.text))).map((l: any) => l.id);
    if (shared.length) await knex('ship_log_lines').whereIn('id', shared).update({ island: null });
    await knex('ship_log_lines').where({ island: ISLAND }).delete();
    await knex('ship_log_lines').insert(SHIP_LOG.map(([kind, weather, text]) => ({ island: ISLAND, kind, weather, text, weight: 1, step: 0, is_active: true })));

    // The museum: Antura's islet things in its own From the Islets.
    const exhibit = await knex('museum_exhibits as e').join('museums as m', 'm.id', 'e.museum_id')
        .where({ 'm.island': ISLAND, 'e.name': 'From the Islets' }).first('e.id');
    if (exhibit) {
        for (const item of ITEMS.filter(i => i.subtype === 'keepsake' || i.subtype === 'artefact')) {
            const row = await knex('items').where({ name: item.name }).first('id');
            if (await knex('museum_cases').where({ item_id: row.id }).first()) continue;
            const [{ max }] = await knex('museum_cases').where({ exhibit_id: exhibit.id }).max('display_order as max');
            await knex('museum_cases').insert({ exhibit_id: exhibit.id, item_id: row.id, display_order: Number(max ?? -1) + 1 });
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await hasContent(knex)) {
        const islets = await knex('locations').where({ region: ISLAND }).whereNotNull('islet_kind').pluck('id');
        if (islets.length) {
            // Anyone out there goes home to Wendhaven, and loses what they found.
            const port = await knex('locations').where({ region: ISLAND, has_slip: true }).first('id');
            if (port) await knex('players').whereIn('current_location_id', islets).update({ current_location_id: port.id });
            await knex('player_actions').whereIn('location_id', islets).delete();
            await knex('player_islet_finds').whereIn('location_id', islets).delete();
            const spots = await knex('fighting_spots').whereIn('location_id', islets).pluck('id');
            if (spots.length) {
                await knex('fighting_spot_creatures').whereIn('spot_id', spots).delete();
                await knex('fighting_spots').whereIn('id', spots).delete();
            }
            await knex('islet_finds').whereIn('location_id', islets).delete();
            // The islet rows stay, unreachable (other rows may point at them), as on Taiar's down.
            await knex('locations').whereIn('id', islets).update({ islet_kind: null, islet_weight: null });
        }
        await knex('voyage_lines').where({ island: ISLAND }).delete();
        await knex('strandline_finds').where({ island: ISLAND }).delete();
        await knex('islet_find_items').where({ island: ISLAND }).delete();
        await knex('drop_table_entries').whereIn('source_key', [`open:${CHEST}`, ...GUARDIANS.map(g => `combat:${g.key}`)]).delete();
        await knex('container_types').where({ key: CONTAINER.key }).delete();
        await knex('chest_locks').where({ locked_item: LOCKED }).delete();
        // The creature rows go inactive rather than away: kill counts point at them.
        await knex('creatures').whereIn('key', GUARDIANS.map(g => g.key)).update({ is_active: false });
        const feat = await knex('feats').where({ slug: FEAT.slug }).first('id');
        if (feat) {
            await knex('player_feats').where({ feat_id: feat.id }).delete();
            await knex('feats').where({ id: feat.id }).delete();
        }
        await knex('ship_log_lines').where({ island: ISLAND }).delete();
        await knex('ship_log_lines').whereNull('island').update({ island: 'Taiar Island' });
        // Items and museum cases stay, as with every content migration: players may hold them.
    }
    if (await knex.schema.hasTable('islet_find_kinds')) {
        await knex('player_islet_finds').where({ kind: 'nests' }).delete();
        await knex('islet_finds').where({ kind: 'nests' }).delete();
        await knex('islet_find_kinds').where({ key: 'nests' }).delete();
    }
    if (await knex.schema.hasColumn('creatures', 'hesitate_text')) await knex.schema.alterTable('creatures', (t) => { t.dropColumn('hesitate_text'); });
    if (await knex.schema.hasColumn('container_types', 'set_island')) await knex.schema.alterTable('container_types', (t) => { t.dropColumn('set_island'); });
}

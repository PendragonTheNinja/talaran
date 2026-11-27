# Art still to make

*2026-11-27. Everything the built and planned features ask for that has no picture yet, with sizes, file names, and prompts for Google Flow (Nano Banana). Antura's art (places, maps, islets, creatures) is on its own branch and is listed separately once it merges: run `pnpm images:audit` then, which lists every picture the live rows ask for that is missing.*

## Before you start

- **Transparency.** Nano Banana does not reliably give a transparent background. Every prompt below asks for a plain white background; cut it out afterwards (Photopea's "Remove BG", remove.bg, or Canva) and save as PNG.
- **Sizes.** Generate square at whatever size Flow gives, then scale down to the size listed. Scaling down sharpens; never scale up.
- **Names.** Item and creature files are the name with spaces as underscores and apostrophes dropped (`Pwca's Lantern` is `Pwcas_Lantern.png`). Badges are `images/badges/<badge_key>.png`.
- **Matching the art already in the game.** The prompts carry one style line per kind, taken from what is there now: the Bestiary is painterly, semi-realistic, three-quarter view (the Hodag); items are painterly single objects (the Agropelter Knuckle); badges are a gold emblem on a dark round medallion with a gold rim (the master badges).

### Style lines (paste in front of each subject)

- **CREATURE:** `Painterly semi-realistic dark fantasy creature illustration, full body, three-quarter view, centered, muted natural colors, detailed textures, soft dramatic lighting, isolated on a plain pure white background, no ground, no shadow, no text, square 1:1.`
- **ITEM:** `Single object, painterly realistic medieval fantasy game inventory icon, three-quarter view, centered and filling most of the frame, soft light from the top left, isolated on a plain pure white background, no shadow, no text, square 1:1.`
- **BADGE:** `Round game badge: a simple bold gold line-art emblem centered on a dark charcoal circular medallion with a thin gold rim, flat, high contrast, readable at very small size, no text, plain white background outside the circle, square 1:1.`
- **PET:** `Cute but grounded pixel art animal sprite, 32x32 pixel art style, limited earthy palette, crisp dark outline, side view facing right, plain pure white background, no text.`

---

## 1. Invasion creatures: 12, 256×256, `images/bestiary/`

| File | Prompt (after CREATURE) |
|---|---|
| `Myrmex.png` | A dog-sized ant with a glossy bronze-black armored shell, gold dust on its mandibles and forelegs, digging posture. |
| `Pwca.png` | A small, wiry, shape-shifting goblin of Welsh folklore, half goat, half man, shaggy dark fur, long ears, holding a dim lantern, mischievous grin, night colors. |
| `Spartos.png` | A soldier grown from a sown dragon's tooth: ancient Greek bronze armor and crested helmet over a body of pale bone and earth, no face visible in the helmet, spear and round shield. |
| `Gwyllgi.png` | A huge shadowy mastiff made of black smoke and fur, glowing red eyes, lean and fast, mid-stride. |
| `Stymphalian_Bird.png` | A crane-like bird with a bronze beak, bronze claws, and metallic bronze feathers like darts, wings half spread. |
| `Afanc.png` | A huge lake beast like a monstrous beaver, wet dark fur, long yellow gnawing teeth, webbed claws, water dripping. |
| `Khalkotauros.png` | A massive bull of living bronze, bronze hooves, heat glowing orange in its nostrils and joints like a forge, heavy and slow. |
| `Cŵn_Annwn.png` | A spectral white hunting hound with bright red ears, slender and fast, faint otherworldly glow, baying. |
| `Teumessian_Fox.png` | A sleek, impossibly quick russet fox with an enormous brush tail, motion-blurred edges, sly eyes. |
| `Gwiber.png` | A winged serpent of the Welsh hills, green and bronze scales, leathery wings, fangs dripping venom, coiled to strike. |
| `Crommyonian_Sow.png` | A wild sow the size of a cart, bristling black hide, huge yellow tusks, muddy and furious. |
| `Huntsman_of_Annwn.png` | A cloaked Otherworld rider on foot, gray-green hooded cloak, pale face half hidden, a curved hunting horn at his belt, spear in hand, evening-light colors. |

## 2. Invasion trophies: 12, 128×128, `images/items/`

| File | Prompt (after ITEM) |
|---|---|
| `Ant-gold_Nugget.png` | A rough nugget of bright gold with tiny ant tunnel marks in it. |
| `Pwcas_Lantern.png` | A small crooked horn lantern with a dim greenish glow inside. |
| `Sown_Dragons_Tooth.png` | A long curved dragon's tooth, ivory with dark soil still clinging to its root. |
| `Gwyllgis_Eye.png` | A glowing red eye set in a lump of black smoky glass. |
| `Bronze_Feather.png` | A single sharp feather made of polished bronze, edge like a blade. |
| `Afanc_Skull.png` | The skull of a giant beaver-like beast with long orange-yellow incisors. |
| `Bronze_Hoof.png` | A heavy bull's hoof cast in bronze, faint heat glow in the cracks. |
| `Red_Ear_of_Annwn.png` | A white hound's ear tipped deep red, soft fur, faintly glowing. |
| `Teumessian_Brush.png` | A full russet fox tail, thick and bright. |
| `Gwiber_Fang.png` | A long curved serpent fang with a drop of green venom at the tip. |
| `Sows_Tusk.png` | A huge curved yellowed boar tusk, chipped. |
| `Horn_of_Annwn.png` | A curved hunting horn of pale bone bound in dark silver, Celtic knotwork on the band. |

## 3. Invasion rare gear: 7, 128×128, `images/items/`

| File | Prompt (after ITEM) |
|---|---|
| `Myrmex_Mandible_Pick.png` | A mining pickaxe whose head is a curved black-bronze ant mandible lashed to a wooden haft. |
| `Pwcas_Blackthorn.png` | A gnarled blackthorn walking staff, dark knotted wood, a small thorn-crowned knob at the top. |
| `Afanc-tooth_Hatchet.png` | A woodcutting hatchet whose blade is a huge orange-yellow beaver tooth, bound to a wooden handle. |
| `Forgefire_Hammer.png` | A smith's hammer with a bronze head glowing orange-hot along its edges, leather-wrapped handle. |
| `Teumessian_Boots.png` | A pair of light leather travel boots trimmed with russet fox fur. |
| `Gwiber-scale_Gloves.png` | A pair of leather gloves faced with small overlapping green-bronze serpent scales. |
| `Huntsmans_Bow.png` | A longbow of pale wood with dark silver fittings and Celtic knotwork at the grip. |

## 4. Badges: 6 now, 64×64, `images/badges/`

Each is BADGE + the emblem. Until a file is there, the game shows the emoji.

| File | Emblem |
|---|---|
| `the-mender.png` | A torn swirl in the sky being stitched closed with a gold thread. |
| `supporter-5.png` (Friend of Talaran) | A single lit candle. |
| `supporter-20.png` (Patron of Talaran) | A hanging lantern. |
| `supporter-50.png` (Benefactor of Talaran) | A heater shield. |
| `supporter-100.png` (Steward of Talaran) | A simple crown. |
| `supporter-1000.png` (Pillar of Talaran) | A stone pillar with a star above it; for this one use a brighter gold and a double rim. |

## 5. Pets: 22, three pictures each (`docs/pets-spec.md`)

The animals are proposals until you settle them in the spec. For each pet:

- **Sprite strip**, `images/pets/<key>.png`, 128×32 (four 32×32 frames side by side; two or three frames is fine, 64×32 or 96×32). Prompt: PET + the animal + `sprite sheet of 4 frames in one horizontal row of equal squares, a simple idle loop: breathing and a small tail or ear twitch, the animal in the same position in every frame.` Image models drift between frames; if they do, keep the best single frame and make the others by hand (a one-pixel bob and a blink is enough).
- **Badge**, `images/badges/pet-<key>.png`, 64×64: BADGE + `the head of a <animal>`.
- **Chat emote**, `images/emotes/pet-<key>.png`, 64×64: the first sprite frame scaled up with nearest-neighbor (keeps pixels crisp). No new prompt needed.

| Key | Skill | Animal (proposal) |
|---|---|---|
| `stoat` | Woodcutting | a stoat with a wood chip in its mouth |
| `rock-wren` | Mining | a small brown wren on a lump of ore |
| `otter-pup` | Fishing | an otter pup holding a tiny fish |
| `hedgehog` | Foraging | a hedgehog with a leaf on its spines |
| `fox-kit` | Hunting | a red fox kit |
| `sawdust-mouse` | Carpentry | a mouse dusted with sawdust |
| `ember-sprite` | Smithing | a tiny glowing ember creature, like a coal with eyes |
| `kitchen-cat` | Cooking | a tabby cat with a ladle |
| `magpie` | Crafting | a magpie with a shiny ring in its beak |
| `field-hare` | Farming | a brown hare among wheat stalks |
| `lamb` | Husbandry | a white lamb |
| `wisp` | Talar | a floating blue-white will-o'-the-wisp |
| `road-dog` | Wayfaring | a scruffy brown traveling dog with a bandana |
| `war-hound-pup` | Melee | a bold war hound puppy in a tiny spiked collar |
| `tortoise` | Defense | a tortoise with a shell like a little shield |
| `ox-calf` | Constitution | a sturdy ox calf |
| `candle-moth` | Supporter $5 | a pale moth with a candle-flame glow |
| `lantern-owlet` | Supporter $20 | a small owl with lantern-gold eyes |
| `badger` | Supporter $50 | a badger, broad and steady |
| `stag-fawn` | Supporter $100 | a fawn with tiny golden antler buds |
| `firebird-chick` | Supporter $1,000 | a small gold and crimson firebird chick |
| `snow-robin` | Yuletide (holiday) | a robin with a red breast and a dusting of snow |

## 6. Avatar frames: a first set of 6, 256×256, `images/frames/<key>.png`

A frame is a border only, with the middle fully transparent. Keep the border inside the outer 24 pixels. Prompt for each: `Ornate square picture frame border only, 256x256, the entire center is empty plain white, border thickness about one tenth of the width, flat front view, no text,` then:

| Key | Border |
|---|---|
| `knotwork` | Celtic knotwork carved in dark wood. |
| `gilt` | Gilded gold with small corner flourishes. |
| `driftwood` | Weathered gray driftwood with rope at the corners. |
| `iron` | Black iron bands with rivets. |
| `holly` | A wreath of holly and red berries (Yuletide). |
| `annwn` | Pale bone and silver with faint blue-green Otherworld glow. |

After cutting out, erase the center to transparent too.

## 7. Chat emotes: a first set of 12, 64×64, `images/emotes/<key>.png`

Shown about 20 pixels tall, so each must read as one shape. Prompt: `Simple bold game emoji icon, painterly medieval style, one clear shape, thick dark outline, centered, plain pure white background, no text, square,` then:

`wave` a raised hand · `laugh` a laughing round face · `cheers` two clinking tankards · `gg` two crossed swords · `rip` a small gravestone · `gold` a stack of gold coins · `heart` a red heart · `sweat` a face with a sweat drop · `think` a face with a hand on chin · `sleep` a sleeping face with "Zz" drawn as shapes, not letters · `fire` a campfire · `squonk` a crying little Squonk.

## 8. Shop signs and awnings

**Use free textures, don't generate** (see below). Proposal:

- **Signs**, 4 styles, 256×128, `images/shops/sign-<key>.png`: carved oak, painted board, iron-bound plank, gilt-edged. Each is a blank board; the shop's name is drawn over it by the game. Make them from a CC0 wood texture with a border painted on.
- **Awnings**: no art needed. Striped awnings in six colors can be drawn by CSS, which keeps them sharp at every size and lets us add colors for free.

## 9. Profile backdrops (now wanted: a new perk to build)

1200×400, `images/backdrops/<key>.jpg` (JPG, under 300 KB; no transparency needed). Shown behind the top of a profile and cropped to the middle on phones, so keep the interest in the center third. A first set of 8 from public-domain art (below): a harbor at dusk, a forest edge, a castle on a hill, a market square, a tapestry hunt scene, an old sea chart, a winter village, a starry night over hills.

## 10. Sounds: bell packs, 4

Up to 3 seconds, under 200 KB, MP3 or OGG, mono: `sounds/bells/anvil.mp3`, `church-bell.mp3`, `gull.mp3`, `horn.mp3`. From Freesound (CC0 filter) or the Sonniss GDC bundles; trim and fade the ends in Audacity.

---

## Free sources (check every file's license and keep a note of where it came from)

Use only **public domain or CC0**. CC-BY is usable but needs a credit line somewhere in the game; avoid "non-commercial" (NC) licenses entirely, because Talers make the game commercial.

| Source | What it's good for | License |
|---|---|---|
| **The Met Open Access** (metmuseum.org, "Open Access" filter) | Profile backdrops: the Unicorn Tapestries, landscape paintings, medieval manuscripts | CC0 |
| **Rijksmuseum** (rijksmuseum.nl, Rijksstudio) | Harbors, ships, winter villages, Dutch landscapes | CC0 for public domain works |
| **Art Institute of Chicago** (artic.edu, "Public domain" filter) | Landscapes, night scenes | CC0 |
| **Wikimedia Commons** | Manuscript borders, old sea charts and maps, castles | Varies per file; take only "Public domain" or CC0 |
| **British Library on Flickr** | Old book illustrations, borders, decorated initials | "No known copyright restrictions" |
| **Poly Haven** and **ambientCG** | Wood, stone, cloth, and metal textures for shop signs | CC0 |
| **OpenGameArt.org** | Game UI pieces, some frames | Varies; filter to CC0 |
| **Freesound.org** | Bells, gulls, anvils, horns | Varies; filter to CC0 |

A photo of a painting can carry its own claim even when the painting is old. The museum sites above publish their own photos as CC0, which is why they are safest. Paintings still in copyright (most made after about 1930) are out.

## Count

| Kind | How many |
|---|---|
| Invasion creatures | 12 |
| Invasion trophies | 12 |
| Invasion rare gear | 7 |
| Badges (feat and supporter) | 6 |
| Pets (sprite and badge each; emote made from the sprite) | 22 × 2 = 44 |
| Avatar frames | 6 |
| Chat emotes | 12 |
| Shop signs (from textures) | 4 |
| Profile backdrops (public domain) | 8 |
| Bell sounds | 4 |
| **To generate in Flow** | **99** |

import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Wording pass, part two (Nathan, 2026-11-10): the two oldest teachers, the
// flat action text and the plainest recipe lines.
//
//   - Geoffrey and Geossica speak like the teachers written after them. Their
//     facts are brought up to date: Ambren wants Burgh ore as well as Ambren
//     ore; a carpentry bench is a sawhorse and a plane, and the saw is held in
//     hand at any bench (migration 20261109100000), so Geossica says to bring
//     one and no longer lists it as part of the bench.
//   - One line each for Geothro and Georold (a stray double space, a spelling).
//   - Scene text for the eight oldest actions, which read "You are mining
//     rocks." The woodcutting line named a Lanai tree whatever was being cut.
//   - Recipe lines that only named the job ("You are forging a hammer.") say
//     what the hands are doing, as the later recipes do.
//
// Dialogue is found by the teacher's name and stage, never by id. text_lines
// is text[], so a plain array is passed. A missing row where content exists is
// a loud error. down() puts the earlier text back.

interface Lines { npc: string; stage: string; before: string[]; after: string[] }
interface Scene { actionType: string; before: string; after: string }
interface Flavor { name: string; before: string; after: string }

const DIALOGUE: Lines[] = [
    {
        npc: "Geoffrey", stage: "intro",
        before: [
            "Hm? Another one looking to learn the craft, are ye? I don't give lessons for free, stranger.",
            "But I'll make ye a deal. If you can smelt me 6 batches of Ambren Ingots using my forge, I'll know you're serious. You'll need Ambren Ore and Charc, both found up in the mines to the north at Grundagr and Origrund.",
            "Fair warning! My forge isn't as efficient as having your own setup. Once you prove yourself, I'll show you how to smith your own tools and build a proper workstation. That's when the real work begins.",
        ],
        after: [
            "Another one come to learn the trade. I don't teach for nothing, stranger.",
            "Here's the bargain. Smelt me six batches of Ambren ingots at my forge and I'll know you mean it. You'll want Ambren ore, Burgh ore, and Charc to fire them. The ore is up in the mines to the north, at Origrund and Grundagr.",
            "Mind, my forge is slower than one of your own would be. Prove yourself and I'll show you how to forge your own tools and set up a proper workstation. That's when the work starts.",
        ],
    },
    {
        npc: "Geoffrey", stage: "offer",
        before: [
            "Good. The forge is yours to use. Smelt those ingots and come back to me when you're done.",
        ],
        after: [
            "Good. The forge is yours to use. Smelt the ingots, then come and find me.",
        ],
    },
    {
        npc: "Geoffrey", stage: "progress",
        before: [
            "Back already? Don't rush it. Good metal takes patience.",
        ],
        after: [
            "Back already? Don't rush it. Good metal takes its time.",
        ],
    },
    {
        npc: "Geoffrey", stage: "ready",
        before: [
            "Well now. You actually did it. I'll admit, I had my doubts.",
            "A deal's a deal. You've earned access to my anvil for smithing. But hear me... this forge is slow. If you want real speed, you'll need to smith your own tools and set up your own workstation.",
            "You'll need an Ambren Anvil, an Ambren Hammer, and Ambren Tongs. All things you can smith yourself at my trust Anvil.",
        ],
        after: [
            "Well now. You did it. I'll admit I had my doubts.",
            "A bargain's a bargain. My anvil is yours to smith at. But hear me: this forge is slow. If you want speed, forge your own tools and set up your own workstation.",
            "You'll need an Ambren Anvil, an Ambren Hammer and Ambren Tongs. You can forge all three yourself, on my trusty anvil.",
        ],
    },
    {
        npc: "Geoffrey", stage: "complete",
        before: [
            "The forge is yours to use whenever you need it. But don't forget! Build your own workstation when you're ready. My anvil won't wait around forever.",
        ],
        after: [
            "The forge is yours whenever you need it. But build your own workstation when you're ready. Mine won't get any quicker for being borrowed.",
        ],
    },
    {
        npc: "Geossica", stage: "intro",
        before: [
            "New face in Verdale, eh? Come to learn the grain, have you?",
            "Tell you what... prove your hands are honest. Saw me 6 good batches of planks at the bench here, and I'll know you're serious.",
            "Mind, the public bench is slow going. Earn your keep and I'll show you how to set up your own. That's when the wood really starts to sing.",
        ],
        after: [
            "New face in Verdale. Come to learn the grain, have you?",
            "Then show me your hands are honest. Saw me six good batches of planks at the bench here, and I'll know you mean it. You'll want a saw of your own in hand. Merrick sells them in Talador.",
            "Mind, a borrowed bench is slow going. Earn your keep and I'll tell you how to set up your own. That's when the wood starts to sing.",
        ],
    },
    {
        npc: "Geossica", stage: "offer",
        before: [
            "Good. The bench is yours. Saw your planks and come find me when the sawdust settles.",
        ],
        after: [
            "Good. The bench is yours. Saw your planks, and come and find me when the sawdust settles.",
        ],
    },
    {
        npc: "Geossica", stage: "ready",
        before: [
            "Well, look at that. Clean lines, every one. You've got the feel for it.",
            "A deal's a deal! The workshop's open to you. But this old bench is slow. For real speed, build your own: a Lanai Sawhorse, an Ambren Saw, and an Ambren Plane.",
            "Saw the sawhorse here from your own planks; the saw and plane you'll forge at a smithy. Put them together and you'll have a proper workstation.",
        ],
        after: [
            "Well, look at that. Clean lines, every one. You've the feel for it.",
            "A deal's a deal. The workshop's open to you. But this old bench is slow. For real speed, build your own: a Lanai Sawhorse to make the bench, and an Ambren Plane to fit to it.",
            "You can build the sawhorse here, from your own planks. The plane is smith's work. Keep your saw in your hand and you've a proper workstation.",
        ],
    },
    {
        npc: "Geossica", stage: "complete",
        before: [
            "The bench is yours whenever you need it. But build your own setup when you can. Your back will thank you.",
        ],
        after: [
            "The bench is here whenever you need it. But set up your own when you can. Your back will thank you.",
        ],
    },
    {
        npc: "Geothro", stage: "complete",
        before: [
            "Mind the muck heap. It's not waste,  it's next year's field, and Georgic will take all you can barrow over.",
            "And if you ever bring a foal back from the wood, bring it here. A horse grown in your own paddock carries you differently than one bought at market. I've no proof of that. I'm right all the same.",
        ],
        after: [
            "Mind the muck heap. That's next year's field, and Georgic will take all you can barrow over.",
            "And if you ever bring a foal back from the wood, bring it here. A horse grown in your own paddock carries you differently than one bought at market. I've no proof of that. I'm right all the same.",
        ],
    },
    {
        npc: "Georold", stage: "complete",
        before: [
            "Still here? The rats are not. Two hundred and six this morning.",
            "Further along the coast there are worse things than rats. Read the Bestiary before you fight them.",
            "Eat. Watch your health. Leave while you still can. Nobody listens to that last part. I have fished two out of the harbour who did not.",
        ],
        after: [
            "Still here? The rats are not. Two hundred and six this morning.",
            "Further along the coast there are worse things than rats. Read the Bestiary before you fight them.",
            "Eat. Watch your health. Leave while you still can. Nobody listens to that last part. I have fished two out of the harbor who did not.",
        ],
    },
];

const SCENES: Scene[] = [
    { actionType: "woodcutting", before: "You are chopping a Lanai Tree.", after: "You swing, the chips fly, and the tree leans a little further." },
    { actionType: "mining_rock", before: "You are mining rocks.", after: "You swing the pick, and the rock comes away in lumps." },
    { actionType: "mining_vein", before: "You are mining an ore vein.", after: "You work along the vein, prising the ore out of the rock." },
    { actionType: "smelting", before: "You are smelting ingots.", after: "You feed the forge and wait for the ore to run." },
    { actionType: "smithing", before: "You are working the forge.", after: "You work the metal on the anvil while it is still hot enough to listen." },
    { actionType: "kiln_collect", before: "Collecting Charc from the kiln...", after: "You rake the Charc out of the kiln." },
    { actionType: "sawing", before: "You are sawing planks.", after: "You saw the log down into planks, one pass after another." },
    { actionType: "woodworking", before: "You are working at the sawhorse.", after: "You work the timber at the bench, cutting and fitting." },
];

const RECIPES: Flavor[] = [
    { name: "Build Tanning Rack", before: "You are lashing together a tanning rack.", after: "You lash the frame together and test it with your weight." },
    { name: "Lanai Tool Rod", before: "You are turning a tool rod.", after: "You turn a length of Lanai round and smooth it to fit a hand." },
    { name: "Lanai Staff", before: "You are shaping a walking staff.", after: "You strip a straight length of Lanai and round off the head." },
    { name: "Lanai Sawhorse", before: "You are joining a sawhorse.", after: "You join the legs to the beam and knock the pegs home." },
    { name: "Split Arrow Shafts", before: "You are splitting arrow shafts.", after: "You split the plank along the grain and plane each shaft round." },
    { name: "Build Tanning Barrel", before: "You are raising staves for a tanning barrel.", after: "You raise the staves and drive the hoops down over them." },
    { name: "Fletch Arrows", before: "You are fletching arrows.", after: "You seat the head, bind the feathers, and sight down the shaft." },
    { name: "Ambren Pickaxe", before: "You are hammering out a pickaxe head.", after: "You hammer out a pickaxe head and punch the eye for the haft." },
    { name: "Ambren Hatchet", before: "You are hammering out a hatchet head.", after: "You hammer out a hatchet head and draw the edge thin." },
    { name: "Ambren Hammer", before: "You are forging a hammer.", after: "You square a block of Ambren for the head and punch the eye through it." },
    { name: "Ambren Tongs", before: "You are bending a pair of tongs.", after: "You draw out two long reins and rivet them at the jaws." },
    { name: "Ambren Anvil", before: "You are beating out an anvil.", after: "You beat the block square and draw the horn out at one end." },
    { name: "Ambren Saw", before: "You are filing saw teeth.", after: "You hammer the blade thin and file the teeth one at a time." },
    { name: "Ambren Plane", before: "You are fitting a plane iron.", after: "You grind the iron to a keen edge and wedge it into its body." },
    { name: "Ambren Cauldron", before: "You are raising the belly of a cauldron.", after: "You raise the belly of a cauldron from the flat, a blow at a time." },
    { name: "Ambren Skillet", before: "You are beating out a skillet.", after: "You beat a plate out shallow and draw a long handle from the rim." },
    { name: "Ambren Cooking Knife", before: "You are setting a keen little blade into a wooden haft.", after: "You set a keen little blade into a wooden haft." },
    { name: "Ambren Meat Cleaver", before: "You are hanging a broad blade on a haft heavy enough to swing it.", after: "You hang a broad blade on a haft heavy enough to swing it." },
    { name: "Ambren Ladle", before: "You are drawing out the handle of a ladle.", after: "You dish the bowl and draw out a long handle." },
    { name: "Ambren Flesh Hook", before: "You are turning two prongs on a flesh hook.", after: "You split the end of the bar and turn the two prongs." },
    { name: "Ambren Tinderbox", before: "You are fitting a steel striker into a small wooden box.", after: "You fit a steel striker into a small wooden box." },
    { name: "Cut Buckskin Strips", before: "You are cutting buckskin into strips.", after: "You cut the buckskin into long, even strips." },
    { name: "Tie Snare", before: "You are tying a snare.", after: "You tie the loop, set the slip knot, and test that it runs." },
    { name: "Granite Mortar and Pestle", before: "You are hollowing out a bowl of granite.", after: "You hollow a bowl out of the granite and grind the inside smooth." },
    { name: "Weave Skep", before: "You are coiling straw into a dome.", after: "You coil the straw round and stitch each turn to the last." },
    { name: "Spin Linen Thread", before: "You draw the flax fibre out and twist it into thread.", after: "You draw the flax fiber out and twist it into thread." },
    { name: "Scutch Flax", before: "You beat and comb the flax until the fibre comes free.", after: "You beat and comb the flax until the fiber comes free." },
    { name: "Press Cheese", before: "You break the curd, pack the mould, and lean on the press.", after: "You break the curd, pack the mold, and lean on the press." },
];

async function write(knex: Knex, side: 'before' | 'after'): Promise<void> {
    if (!(await hasContent(knex))) return;

    for (const d of DIALOGUE) {
        const npc = await knex('npcs').where({ name: d.npc }).first('id');
        if (!npc) throw new Error(`Rewording: no NPC named "${d.npc}".`);
        const changed = await knex('npc_dialogues')
            .where({ npc_id: npc.id, stage_key: d.stage })
            .update({ text_lines: d[side] });
        if (changed === 0) throw new Error(`Rewording: ${d.npc} has no "${d.stage}" dialogue.`);
    }

    for (const s of SCENES) {
        const changed = await knex('action_presentation')
            .where({ action_type: s.actionType })
            .whereNull('kind')
            .update({ scene_text: s[side] });
        if (changed === 0) throw new Error(`Rewording: no scene text for action "${s.actionType}".`);
    }

    for (const r of RECIPES) {
        const changed = await knex('recipes').where({ name: r.name }).update({ flavor_text: r[side] });
        if (changed === 0) throw new Error(`Rewording: no recipe named "${r.name}".`);
    }
}

export async function up(knex: Knex): Promise<void> {
    await write(knex, 'after');
}

export async function down(knex: Knex): Promise<void> {
    await write(knex, 'before');
}

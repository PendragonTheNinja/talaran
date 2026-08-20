/**
 * Guest conversion prompts.
 *
 * Asking someone to claim their character when the clock hits zero is the
 * weakest possible moment: they have stopped playing and the answer is
 * whatever they already felt. The good moments are the ones where the game
 * has just proved something, so the prompt rides those instead.
 *
 * Each milestone fires at most once per character, recorded in localStorage
 * so a refresh does not re-nudge someone who already said not yet. The whole
 * module is inert for real accounts.
 */

export type Milestone = 'travel' | 'craft' | 'tutorial' | 'halfway'

/** Why the prompt opened, so the panel can say something that fits. */
export const MILESTONE_COPY: Record<Milestone, string> = {
    travel: 'You have left Talador. The island is bigger than this, and your character can keep exploring it.',
    craft: 'You just made something. That production chain runs through every trade in the game.',
    tutorial: 'Quank is finished with you. Everything past this point is the real game.',
    halfway: 'You are about half an hour into the trial. Claiming takes a moment and nothing resets.',
}

function storageKey(playerId: number): string {
    return `talaran_guest_milestones_${playerId}`
}

function seen(playerId: number): Set<string> {
    try {
        const raw = localStorage.getItem(storageKey(playerId))
        return new Set(raw ? (JSON.parse(raw) as string[]) : [])
    } catch {
        return new Set()
    }
}

/**
 * Records a milestone and reports whether it is new. Returns false for one
 * already seen, so callers can fire on every relevant event without having to
 * track state themselves.
 */
export function reachMilestone(playerId: number, milestone: Milestone): boolean {
    try {
        const already = seen(playerId)
        if (already.has(milestone)) return false
        already.add(milestone)
        localStorage.setItem(storageKey(playerId), JSON.stringify([...already]))
        return true
    } catch {
        // Private browsing with storage disabled. Prompting every time would be
        // worse than never prompting, so this stays quiet.
        return false
    }
}

/** Called after a successful claim, so a later guest on this browser starts clean. */
export function clearMilestones(playerId: number): void {
    try {
        localStorage.removeItem(storageKey(playerId))
    } catch {
        /* nothing to clean up */
    }
}

/** Skills whose first XP means the player has turned raw material into a good. */
export const CRAFTING_SKILLS = ['Carpentry', 'Smithing', 'Crafting', 'Cooking', 'Tanning']

/** Quank's tutorial, by name. Matched loosely so a rename does not silently break it. */
export function isTutorialQuest(questName: string | undefined): boolean {
    if (!questName) return false
    const n = questName.toLowerCase()
    return n.includes('quank') || n.includes('first steps') || n.includes('welcome')
}

// Gem grades (docs/talar-spec.md §2). A cut rolls Cut, Polished or Flawless,
// and the better grades come more often the further the cutter's Crafting level
// is above the recipe's. Pure, so the cut (services/recipes.ts), the price
// (scripts/deriveValues.ts) and any sim read one copy.

/** Grade odds in percent, [Cut, Polished, Flawless], at the recipe's own level. */
export const GRADE_ODDS_AT_UNLOCK = [85, 13, 2] as const

/** The odds once the cutter is GRADE_RAMP_LEVELS above the recipe, and beyond. */
export const GRADE_ODDS_AT_BEST = [45, 40, 15] as const

/** Three tiers: the odds improve evenly from the unlock level to this many above it. */
export const GRADE_RAMP_LEVELS = 36

/**
 * What each grade holds against a Cut gem: 1 : 1.5 : 3 (Nathan, 2026-10-24).
 * Talar capacity when filled, and so its price. Three Cut, two Polished or one
 * Flawless carry the same.
 */
export const GRADE_WORTH = [1, 1.5, 3] as const

/** Percent odds of each grade for a cutter `levelsOver` the recipe's level. */
export function gradeOdds(levelsOver: number): [number, number, number] {
    const t = Math.min(1, Math.max(0, levelsOver) / GRADE_RAMP_LEVELS)
    const at = (i: number) => GRADE_ODDS_AT_UNLOCK[i] + (GRADE_ODDS_AT_BEST[i] - GRADE_ODDS_AT_UNLOCK[i]) * t
    return [at(0), at(1), at(2)]
}

/** Roll a grade: 0 Cut, 1 Polished, 2 Flawless. `roll` is a number in [0, 100). */
export function rollGrade(levelsOver: number, roll: number = Math.random() * 100): number {
    const [cut, polished] = gradeOdds(levelsOver)
    if (roll < cut) return 0
    if (roll < cut + polished) return 1
    return 2
}

/** A cut gem's grade by its items.quality, worst first: the index used above. */
export const CUT_QUALITIES = ['cut', 'polished', 'flawless'] as const

/** What each grade is called once filled (Nathan, 2026-10-25): Lit, Bright, Radiant. */
export const CHARGED_PREFIXES = ['Lit', 'Bright', 'Radiant'] as const

/**
 * How much faster each grade fills, against a Cut gem of its kind
 * (docs/talar-spec.md §3: 5% and 12%). With the 1 : 1.5 : 3 holding, Polished
 * and Flawless take longer in all but pour quicker while they do.
 */
export const GRADE_FILL_SPEED = [1, 1.05, 1.12] as const

/** The grade index of a cut gem's quality, or -1 if it is not a cut gem. */
export function cutGradeOf(quality: string | null | undefined): number {
    return CUT_QUALITIES.indexOf((quality ?? '') as typeof CUT_QUALITIES[number])
}

/** 'Polished Garnet' (grade 1) -> 'Bright Garnet'. The gem's own word follows the grade word. */
export function chargedNameFor(cutName: string, grade: number): string {
    const gem = cutName.split(' ').slice(1).join(' ')
    return `${CHARGED_PREFIXES[grade]} ${gem}`
}

import { apiFetch } from './api'

/**
 * Fighting, as the client sees it (server: services/combatFights.ts).
 *
 * Every number here comes from the server: HP, the creature's HP, when it
 * closes in, what each swing did. The client draws them and never works one
 * out for itself.
 */

export interface Hp {
    current: number
    max: number
}

/** A place to fight, from the location payload (routes/location.ts). */
export interface FightingSpot {
    id: number
    key: string
    name: string
    /** 'drawn': the next creature is drawn for you. 'chosen': you pick it. */
    kind: 'drawn' | 'chosen'
    description: string | null
    creatures: { id: number; key: string; name: string; level: number }[]
}

export interface FightState {
    spot: { id: number; key: string; name: string; kind: string }
    creature: { id: number; name: string; level: number }
    enemyHp: number
    enemyMaxHp: number
    /** When the current creature closes in; in the future while it approaches. */
    engageAt: string
    kills: number
    /** Waiting on a bot check, between kills. */
    frozen: boolean
    weapon: string
    /** What it is weak to and shrugs off, once the Bestiary tells it (10 kills). */
    stances: Stances | null
}

export type DamageType = 'pierce' | 'slash' | 'crush'

export interface Stances {
    weak: DamageType[]
    resists: DamageType[]
}

/** One creature in the player's Bestiary, told as far as their kills allow (server: services/bestiary.ts). */
export interface BestiaryEntry {
    id: number
    kills: number
    /** The next step that tells more, or null once mastered. */
    next: number | null
    name: string
    level: number
    description: string | null
    places: string[]
    stances: Stances | null
    drops: { name: string; where?: string }[] | null
    allDrops: boolean
    lore: string | null
    mastered: boolean
}

export interface BestiaryData {
    entries: BestiaryEntry[]
    undiscovered: number
    steps: { found: number; stances: number; commonDrops: number; allDrops: number; mastery: number }
}

export function fetchBestiary() {
    return apiFetch<BestiaryData>('/api/combat/bestiary')
}

/** Open the Bestiary from anywhere (GameLayout listens), at a creature if given. */
export function openBestiary(creatureId?: number) {
    window.dispatchEvent(new CustomEvent<{ creatureId?: number }>('talaran:open-bestiary', { detail: { creatureId } }))
}

export interface FightFood {
    itemId: number
    name: string
    quantity: number
    heal: number
}

export interface FightSwing {
    at: string
    by: 'player' | 'enemy'
    hit: boolean
    damage: number
    absorbed: number
    creature: string
}

/** The server's push after every settle (combat_update). */
export interface CombatUpdate {
    events: FightSwing[]
    kills: { creature: string; xp: { melee: number; defense: number; constitution: number }; broken?: string[] }[]
    hp: Hp
    fight: FightState | null
    ended: 'died' | 'fled' | 'disconnected' | 'absent' | 'replaced' | 'broke' | null
}

/** The fight as it stands, settled to now, and the food the player could eat. */
export function fetchFightState() {
    return apiFetch<{ fight: FightState | null; hp: Hp; food: FightFood[] }>('/api/combat/state')
}

/**
 * Live HP for anything that shows it (the equipment panel's bar), without
 * each one listening to the socket. GameView owns the socket listeners and
 * removes them by event name on unmount, which would take a second
 * listener's handler with them.
 */
export function announceHp(hp: Hp) {
    window.dispatchEvent(new CustomEvent<Hp>('talaran:hp', { detail: hp }))
}

/** One swing as a line in the fight log. */
export function describeSwing(s: FightSwing): string {
    if (s.by === 'player') {
        return s.hit ? `You hit the ${s.creature} for ${s.damage}.` : `You miss the ${s.creature}.`
    }
    if (!s.hit) return `The ${s.creature} misses you.`
    const turned = s.absorbed > 0 ? ` Your armour takes ${s.absorbed}.` : ''
    return `The ${s.creature} hits you for ${s.damage}.${turned}`
}

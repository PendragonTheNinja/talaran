/**
 * The timer bell (forum, 2026-11): a sound when a countdown ends, so a player
 * can look away from the screen and still know when to act.
 *
 * Three modes, toggled by the bell beside the bot-check button (BellButton.tsx):
 *   off     silent
 *   once    rings at the next end of a countdown, then turns itself off
 *   always  rings at every one (a 20-second rock pings every 20 seconds;
 *           that is the player's choice)
 *
 * Everything here is per device, in this browser's storage: the same player
 * may want sound on a phone at night and none at a desk. The built-in sounds
 * are drawn with Web Audio, so there are no files to ship. A player with the
 * Custom Sound perk may load a short file of their own; it stays on this
 * device (IndexedDB) and is never uploaded, so nobody else ever hears it.
 *
 * A browser only plays sound once the page has had a tap or a click, and a
 * phone with its screen off or the browser in the background may not play it
 * at all. That limit is the browser's, not ours.
 */

export type BellMode = 'off' | 'once' | 'always'
export type BellSound = 'ping' | 'chime' | 'bell' | 'knock' | 'custom'

export const BELL_SOUNDS: { id: BellSound; label: string }[] = [
    { id: 'ping', label: 'Ping' },
    { id: 'chime', label: 'Chime' },
    { id: 'bell', label: 'Bell' },
    { id: 'knock', label: 'Knock' },
    { id: 'custom', label: 'Your own sound' },
]

/** Largest custom file accepted, and the longest it may play. */
export const CUSTOM_MAX_BYTES = 200 * 1024
export const CUSTOM_MAX_SECONDS = 3

const MODE_KEY = 'talaran-bell-mode'
const SOUND_KEY = 'talaran-bell-sound'
const VOLUME_KEY = 'talaran-bell-volume'
const DB_NAME = 'talaran-bell'
const DB_STORE = 'sounds'
const CUSTOM_ID = 'custom'

function read(key: string): string | null {
    try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, value: string) {
    try { localStorage.setItem(key, value) } catch { /* private mode: lasts this visit */ }
}

// ── Mode, with listeners so the button and Settings stay in step ────────────

let mode: BellMode = (['off', 'once', 'always'] as const).find(m => m === read(MODE_KEY)) ?? 'off'
// "Once" is for the countdown in front of you now; it never survives a reload.
if (mode === 'once') mode = 'off'
const listeners = new Set<(m: BellMode) => void>()

export function bellMode(): BellMode { return mode }

export function setBellMode(next: BellMode) {
    mode = next
    write(MODE_KEY, next === 'once' ? 'off' : next)
    if (next !== 'off') unlockAudio()
    listeners.forEach(fn => fn(next))
}

export function onBellMode(fn: (m: BellMode) => void): () => void {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
}

export function bellSound(): BellSound {
    return BELL_SOUNDS.find(s => s.id === read(SOUND_KEY))?.id ?? 'chime'
}
export function setBellSound(s: BellSound) { write(SOUND_KEY, s) }

/** 0 to 1. */
export function bellVolume(): number {
    const v = Number(read(VOLUME_KEY))
    return read(VOLUME_KEY) !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.6
}
export function setBellVolume(v: number) { write(VOLUME_KEY, String(Math.min(1, Math.max(0, v)))) }

// ── Audio ───────────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
    if (ctx) return ctx
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    return ctx
}

/**
 * Browsers start audio suspended until the page is touched. Called from the
 * bell's own tap, and once on the first tap anywhere if the bell was left on.
 */
export function unlockAudio() {
    const a = audio()
    if (a && a.state === 'suspended') a.resume().catch(() => { })
}

if (typeof window !== 'undefined' && mode !== 'off') {
    const first = () => { unlockAudio(); window.removeEventListener('pointerdown', first) }
    window.addEventListener('pointerdown', first)
}

/** One decaying sine partial: the building block of every built-in sound. */
function partial(a: AudioContext, out: AudioNode, freq: number, start: number, gain: number, decay: number, type: OscillatorType = 'sine') {
    const osc = a.createOscillator()
    const g = a.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(gain, start + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, start + decay)
    osc.connect(g).connect(out)
    osc.start(start)
    osc.stop(start + decay + 0.05)
}

function playBuiltIn(a: AudioContext, out: AudioNode, sound: Exclude<BellSound, 'custom'>) {
    const t = a.currentTime + 0.02
    switch (sound) {
        case 'ping':
            partial(a, out, 1320, t, 0.5, 0.35)
            break
        case 'chime':
            // Two notes a fifth apart, the second a breath later.
            partial(a, out, 784, t, 0.4, 1.1)
            partial(a, out, 1568, t, 0.12, 0.8)
            partial(a, out, 1175, t + 0.16, 0.35, 1.3)
            partial(a, out, 2350, t + 0.16, 0.1, 0.9)
            break
        case 'bell':
            // A small hand bell: inharmonic partials, long ring.
            partial(a, out, 520, t, 0.45, 2.2)
            partial(a, out, 1040 * 1.19, t, 0.18, 1.4)
            partial(a, out, 520 * 2.76, t, 0.12, 0.9)
            partial(a, out, 520 * 5.4, t, 0.06, 0.4)
            break
        case 'knock':
            // Two raps on a wooden door.
            partial(a, out, 190, t, 0.7, 0.12, 'triangle')
            partial(a, out, 380, t, 0.25, 0.06, 'triangle')
            partial(a, out, 180, t + 0.17, 0.6, 0.12, 'triangle')
            partial(a, out, 360, t + 0.17, 0.2, 0.06, 'triangle')
            break
    }
}

// ── The custom sound: kept on this device only ──────────────────────────────

let customBuffer: AudioBuffer | null = null
let customLoaded = false

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => { req.result.createObjectStore(DB_STORE) }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

async function dbGet(): Promise<{ name: string; data: ArrayBuffer } | null> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(CUSTOM_ID)
        req.onsuccess = () => resolve(req.result ?? null)
        req.onerror = () => reject(req.error)
    })
}

async function dbPut(value: { name: string; data: ArrayBuffer } | null): Promise<void> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite')
        const store = tx.objectStore(DB_STORE)
        if (value) store.put(value, CUSTOM_ID)
        else store.delete(CUSTOM_ID)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

async function loadCustom(): Promise<AudioBuffer | null> {
    if (customLoaded) return customBuffer
    customLoaded = true
    try {
        const a = audio()
        const saved = await dbGet()
        if (a && saved) customBuffer = await a.decodeAudioData(saved.data.slice(0))
    } catch { customBuffer = null }
    return customBuffer
}

/** The name of this device's custom sound, or null when none is loaded. */
export async function customSoundName(): Promise<string | null> {
    try { return (await dbGet())?.name ?? null } catch { return null }
}

/**
 * Keep a file as this device's custom sound. Refuses anything too large, too
 * long, or that is not audio the browser can play, with a sentence saying why.
 */
export async function saveCustomSound(file: File): Promise<{ ok: true } | { ok: false; error: string }> {
    if (file.size > CUSTOM_MAX_BYTES) return { ok: false, error: `That file is too large. Keep it under ${CUSTOM_MAX_BYTES / 1024} KB.` }
    const a = audio()
    if (!a) return { ok: false, error: 'This browser cannot play sounds.' }
    const data = await file.arrayBuffer()
    let buffer: AudioBuffer
    try {
        buffer = await a.decodeAudioData(data.slice(0))
    } catch {
        return { ok: false, error: 'That file is not a sound this browser can play. Try an MP3, OGG or WAV.' }
    }
    if (buffer.duration > CUSTOM_MAX_SECONDS + 0.05) {
        return { ok: false, error: `That sound is ${buffer.duration.toFixed(1)} seconds long. Keep it to ${CUSTOM_MAX_SECONDS}.` }
    }
    try {
        await dbPut({ name: file.name, data })
    } catch {
        return { ok: false, error: 'This browser would not keep the file. Private windows often refuse.' }
    }
    customBuffer = buffer
    customLoaded = true
    return { ok: true }
}

export async function clearCustomSound() {
    customBuffer = null
    customLoaded = true
    try { await dbPut(null) } catch { /* nothing kept */ }
    if (bellSound() === 'custom') setBellSound('chime')
}

// ── Ringing ─────────────────────────────────────────────────────────────────

/** Play the chosen sound now, whatever the mode (the Test button). */
export async function playBell(sound: BellSound = bellSound(), volume = bellVolume()) {
    const a = audio()
    if (!a) return
    if (a.state === 'suspended') await a.resume().catch(() => { })
    const out = a.createGain()
    out.gain.value = volume
    out.connect(a.destination)
    if (sound === 'custom') {
        const buf = await loadCustom()
        if (buf) {
            const src = a.createBufferSource()
            src.buffer = buf
            src.connect(out)
            src.start()
            src.stop(a.currentTime + CUSTOM_MAX_SECONDS)
            return
        }
        // No file on this device (cleared, or another browser): the default.
        playBuiltIn(a, out, 'chime')
        return
    }
    playBuiltIn(a, out, sound)
}

// ── What rings it ───────────────────────────────────────────────────────────

/**
 * The moments the bell can ring for, chosen by the player (forum, 2026-11-11:
 * not every countdown, and a bot check while the game sits in the background).
 * The bell button stays the switch: off, the next one, or every one. These say
 * which moments count. All are on until a player chooses, which is how the
 * bell behaved before, plus falling in a fight.
 */
export type BellEvent = 'countdown' | 'stopped' | 'botcheck' | 'fallen' | 'arrived'

export const BELL_EVENTS: { id: BellEvent; label: string; hint: string }[] = [
    { id: 'countdown', label: 'Every countdown', hint: 'Each log, ore, catch or craft' },
    { id: 'stopped', label: 'Work stops', hint: 'Out of materials, a limit reached, a vein run dry, a fight over' },
    { id: 'botcheck', label: 'Bot check', hint: 'The game asks if you are there' },
    { id: 'fallen', label: 'Fallen in a fight', hint: 'You were carried back to Talador' },
    { id: 'arrived', label: 'Journey\'s end', hint: 'You arrive somewhere' },
]

const EVENTS_KEY = 'talaran-bell-events'
const ALL_EVENTS = BELL_EVENTS.map(e => e.id)

function readEvents(): Set<BellEvent> {
    const raw = read(EVENTS_KEY)
    if (raw === null) return new Set(ALL_EVENTS)
    try {
        const list = JSON.parse(raw)
        return new Set(Array.isArray(list) ? ALL_EVENTS.filter(e => list.includes(e)) : ALL_EVENTS)
    } catch {
        return new Set(ALL_EVENTS)
    }
}

const events = readEvents()
const eventListeners = new Set<(e: BellEvent[]) => void>()

export function bellEvents(): BellEvent[] { return ALL_EVENTS.filter(e => events.has(e)) }

export function setBellEvent(event: BellEvent, on: boolean) {
    if (on) events.add(event); else events.delete(event)
    write(EVENTS_KEY, JSON.stringify(bellEvents()))
    for (const fn of eventListeners) fn(bellEvents())
}

export function onBellEvents(fn: (e: BellEvent[]) => void): () => void {
    eventListeners.add(fn)
    return () => { eventListeners.delete(fn) }
}

/**
 * Something happened that the bell may ring for. Rings if the bell is on and
 * the player chose this moment, and spends a "once". GameView calls this.
 */
let lastRang = 0

export function ringFor(event: BellEvent) {
    if (mode === 'off' || !events.has(event)) return
    // One moment often arrives as two events (the last harvest completes,
    // then the action stops): ring once for both.
    const now = Date.now()
    if (now - lastRang < 1500) return
    lastRang = now
    playBell().catch(() => { })
    if (mode === 'once') setBellMode('off')
}

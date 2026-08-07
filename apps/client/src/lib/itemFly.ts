import { getItemIcon } from './items'

// The little flight an item makes from the result card into your pack.
//
// Deliberately restrained: no bounce, no particles, one easing family throughout.
// A first-ever find turns once on its vertical axis as it grows, then settles.
// Everything else just fades up, holds a beat, and flies.
//
// Works for every skill because it hooks the result card, which every skill fills.

const FLYER_SIZE = 76

// Player preference, mirrored here from settings so the gate lives beside the
// reduced-motion check rather than being repeated at every call site. Any future
// caller of flyItemToPack inherits it for free.
let animationEnabled = true

export function setItemAnimationEnabled(enabled: boolean): void {
    animationEnabled = enabled
}

function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

function findPackSlot(itemName: string): HTMLElement | null {
    const grid = document.querySelector<HTMLElement>('.inventory-grid')
    const exact = document.querySelector<HTMLElement>(`[data-item-name="${CSS.escape(itemName)}"]`)

    if (!exact) return grid
    if (!grid) return exact

    // .inventory-grid is a fixed four-row box with overflow-y: auto, so a stack
    // sitting in row seven has a real bounding rect BELOW the visible grid,
    // outside the panel. Aiming at it sent the flyer off to the bottom-left of
    // the screen. Foraging hit this hardest because it fills a pack with many
    // distinct stacks quickly, pushing the newest find out of view.
    const slot = exact.getBoundingClientRect()
    const box = grid.getBoundingClientRect()
    const withinView = slot.bottom > box.top && slot.top < box.bottom

    return withinView ? exact : grid
}

const STACK_OFFSET = 11
const FLYER_BASE_Z = 4000

export function flyItemToPack(opts: {
    itemName: string
    fromEl: HTMLElement | null
    firstTime?: boolean
    /** Position in the pile: each one sits slightly above and in front of the last. */
    stackIndex?: number
    /** How long to sit in the pile before flying. Lets the caller unload top-first. */
    holdMs?: number
}): void {
    const { itemName, fromEl, firstTime, stackIndex = 0, holdMs } = opts
    if (!fromEl || !animationEnabled || prefersReducedMotion()) return

    const target = findPackSlot(itemName)
    if (!target) return

    const from = fromEl.getBoundingClientRect()
    const to = target.getBoundingClientRect()

    const startX = from.left + from.width / 2 - FLYER_SIZE / 2
    // Each new item lands a little above the last, so a multi-drop reads as a
    // pile being built rather than three things in the same place.
    const startY = from.top - FLYER_SIZE - 8 - stackIndex * STACK_OFFSET

    const flyer = document.createElement('div')
    flyer.className = 'item-flyer'
    flyer.style.left = `${startX}px`
    flyer.style.top = `${startY}px`
    flyer.style.width = `${FLYER_SIZE}px`
    flyer.style.height = `${FLYER_SIZE}px`
    // Later arrivals sit in front, so the top of the pile is the one you see.
    flyer.style.zIndex = String(FLYER_BASE_Z + stackIndex)

    const glow = document.createElement('div')
    glow.className = 'item-flyer-glow'

    const img = document.createElement('img')
    img.src = getItemIcon(itemName)
    img.alt = itemName
    img.className = 'item-flyer-icon'
    // No art yet for a lot of items: fall back to a plain plaque rather than a
    // broken image.
    img.onerror = () => {
        img.style.display = 'none'
        const label = document.createElement('span')
        label.className = 'item-flyer-fallback'
        label.textContent = itemName
        flyer.appendChild(label)
    }

    flyer.appendChild(glow)
    flyer.appendChild(img)
    document.body.appendChild(flyer)

    const finish = () => flyer.remove()

    const flight = () => {
        const dx = (to.left + to.width / 2 - FLYER_SIZE / 2) - startX
        const dy = (to.top + to.height / 2 - FLYER_SIZE / 2) - startY
        const arc = Math.min(70, Math.abs(dx) * 0.18)

        const anim = flyer.animate([
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - arc}px) scale(.82)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${dx}px, ${dy}px) scale(.46)`, opacity: 0.15 },
        ], { duration: 620, easing: 'cubic-bezier(.42,0,.35,1)', fill: 'forwards' })

        anim.finished.then(() => {
            finish()
            const slot = findPackSlot(itemName)
            if (slot && slot.classList.contains('inventory-slot')) {
                slot.classList.add('slot-landed')
                setTimeout(() => slot.classList.remove('slot-landed'), 500)
            }
        }).catch(finish)
    }

    if (firstTime) {
        glow.animate(
            [{ opacity: 0 }, { opacity: 0.9 }, { opacity: 0 }],
            { duration: 1000, easing: 'ease-out', fill: 'forwards' },
        )
        flyer.animate([
            { opacity: 0, transform: 'scale(.55) rotateY(0deg)' },
            { opacity: 1, transform: 'scale(1.16) rotateY(340deg)', offset: 0.72 },
            { opacity: 1, transform: 'scale(1) rotateY(360deg)' },
        ], { duration: 980, easing: 'cubic-bezier(.25,.6,.3,1)', fill: 'forwards' })
            .finished.then(() => setTimeout(flight, holdMs ?? 380)).catch(finish)
    } else {
        flyer.animate([
            { opacity: 0, transform: 'scale(.78) translateY(6px)' },
            { opacity: 1, transform: 'scale(1) translateY(0)' },
        ], { duration: 220, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' })
            .finished.then(() => setTimeout(flight, holdMs ?? 420)).catch(finish)
    }
}

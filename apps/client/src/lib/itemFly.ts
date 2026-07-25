import { getItemIcon } from './items'

// The little flight an item makes from the result card into your pack.
//
// Deliberately restrained: no bounce, no particles, one easing family throughout.
// A first-ever find turns once on its vertical axis as it grows, then settles.
// Everything else just fades up, holds a beat, and flies.
//
// Works for every skill because it hooks the result card, which every skill fills.

const FLYER_SIZE = 76

function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

function findPackSlot(itemName: string): HTMLElement | null {
    const exact = document.querySelector<HTMLElement>(`[data-item-name="${CSS.escape(itemName)}"]`)
    if (exact) return exact
    // Not in the pack yet (or off-screen): aim at the grid itself.
    return document.querySelector<HTMLElement>('.inventory-grid')
}

export function flyItemToPack(opts: {
    itemName: string
    fromEl: HTMLElement | null
    firstTime?: boolean
}): void {
    const { itemName, fromEl, firstTime } = opts
    if (!fromEl || prefersReducedMotion()) return

    const target = findPackSlot(itemName)
    if (!target) return

    const from = fromEl.getBoundingClientRect()
    const to = target.getBoundingClientRect()

    const startX = from.left + from.width / 2 - FLYER_SIZE / 2
    const startY = from.top - FLYER_SIZE - 8

    const flyer = document.createElement('div')
    flyer.className = 'item-flyer'
    flyer.style.left = `${startX}px`
    flyer.style.top = `${startY}px`
    flyer.style.width = `${FLYER_SIZE}px`
    flyer.style.height = `${FLYER_SIZE}px`

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
            .finished.then(() => setTimeout(flight, 380)).catch(finish)
    } else {
        flyer.animate([
            { opacity: 0, transform: 'scale(.78) translateY(6px)' },
            { opacity: 1, transform: 'scale(1) translateY(0)' },
        ], { duration: 220, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' })
            .finished.then(() => setTimeout(flight, 420)).catch(finish)
    }
}

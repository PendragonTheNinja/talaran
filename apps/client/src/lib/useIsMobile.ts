import { useState, useEffect } from 'react'

const MOBILE_BREAKPOINT = 768

/**
 * Below this the desktop layout stacks the place panel on top of the right
 * column instead of beside the scene. Three columns plus the place panel need
 * about 1,060px at the 1440 breakpoint's sizes; half of a 1920 screen is ~950,
 * and it used to scroll sideways there.
 */
export const SIDE_STACK_BREAKPOINT = 1100

/** True while the window is narrower than `px`, kept up to date on resize. */
export function useWidthBelow(px: number): boolean {
    const [below, setBelow] = useState(
        typeof window !== 'undefined' ? window.innerWidth < px : false
    )

    useEffect(() => {
        const onResize = () => setBelow(window.innerWidth < px)
        onResize()
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [px])

    return below
}

export function useIsMobile(): boolean {
    return useWidthBelow(MOBILE_BREAKPOINT)
}

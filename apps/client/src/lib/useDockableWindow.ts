import { useState, useEffect, useCallback } from 'react'

export interface DockState {
    isPopped: boolean
    isPinned: boolean
    x: number
    y: number
    width: number
    height: number
}

const DEFAULTS = { x: 140, y: 90, width: 760, height: 560 }

export function useDockableWindow(key: string) {
    const storageKey = `dock:${key}`

    const [state, setState] = useState<DockState>(() => {
        try {
            const saved = localStorage.getItem(storageKey)
            if (saved) {
                const p = JSON.parse(saved)
                return {
                    isPopped: !!p.isPopped,
                    isPinned: !!p.isPinned,
                    x: typeof p.x === 'number' ? p.x : DEFAULTS.x,
                    y: typeof p.y === 'number' ? p.y : DEFAULTS.y,
                    width: typeof p.width === 'number' ? p.width : DEFAULTS.width,
                    height: typeof p.height === 'number' ? p.height : DEFAULTS.height,
                }
            }
        } catch { /* ignore */ }
        return { isPopped: false, isPinned: false, ...DEFAULTS }
    })

    useEffect(() => {
        try { localStorage.setItem(storageKey, JSON.stringify(state)) } catch { /* ignore */ }
    }, [storageKey, state])

    const togglePop = useCallback(() => setState(s => ({ ...s, isPopped: !s.isPopped })), [])
    const togglePin = useCallback(() => setState(s => ({ ...s, isPinned: !s.isPinned })), [])
    const setPosition = useCallback((x: number, y: number) => setState(s => ({ ...s, x, y })), [])
    const setSize = useCallback((width: number, height: number, x: number, y: number) =>
        setState(s => ({ ...s, width, height, x, y })), [])

    return { ...state, togglePop, togglePin, setPosition, setSize }
}

export type DockApi = ReturnType<typeof useDockableWindow>
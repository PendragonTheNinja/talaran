import { useEffect, useRef, type CSSProperties } from 'react'

/**
 * A pop-up's error or result line, scrolled into view whenever its message changes.
 *
 * Errors sat at the top of their pop-up, so a player scrolled down to a button
 * (casting Kindle where nothing can be gathered, milking without a pail) saw
 * nothing happen and had to scroll up to learn why (forum, 2026-11-09). Each
 * keeps its own class, so it looks as it did in every theme.
 */
export default function ErrorLine({ message, className, style, as = 'p' }: {
    message: string | null | undefined
    className: string
    style?: CSSProperties
    as?: 'p' | 'div'
}) {
    const pRef = useRef<HTMLParagraphElement>(null)
    const divRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (message) (pRef.current ?? divRef.current)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, [message])
    if (!message) return null
    return as === 'div'
        ? <div ref={divRef} className={className} style={style} role="alert">{message}</div>
        : <p ref={pRef} className={className} style={style} role="alert">{message}</p>
}

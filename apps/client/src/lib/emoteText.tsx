import type { ReactNode } from 'react'
import { Emote } from '../components/Cosmetics'

/**
 * Splits text on :key: for the keys this line may draw (fixed by the server
 * when it was sent, from what the sender owned), leaving everything else as
 * text for `rest` to render.
 */
export function withEmotes(text: string, emotes: string[] | null | undefined, rest: (t: string, k: string) => ReactNode[]): ReactNode[] {
    if (!emotes?.length) return rest(text, 'e')
    const allowed = new Set(emotes)
    const out: ReactNode[] = []
    const re = /:([a-z0-9-]{2,30}):/g
    let last = 0, n = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
        if (!allowed.has(m[1])) continue
        if (m.index > last) out.push(...rest(text.slice(last, m.index), `e${n}`))
        out.push(<Emote key={`em-${n++}-${m.index}`} name={m[1]} />)
        last = re.lastIndex
    }
    if (last < text.length) out.push(...rest(text.slice(last), `e${n}`))
    return out
}

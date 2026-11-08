import { useState } from 'react'

/**
 * The rest of a guild ballad under its line in the book (server
 * services/chronicleBallads.ts): the page prints the first stanza, and this
 * sings the others on a tap. Used by the tavern book and the public page.
 */
export default function BalladRest({ stanzas }: { stanzas: string[] }) {
    const [open, setOpen] = useState(false)
    if (stanzas.length < 2) return null
    return (
        <div className="tavern-ballad-rest">
            {open && stanzas.slice(1).map((st, i) => <p key={i} className="tavern-line tavern-ballad-stanza">{st}</p>)}
            <button type="button" className="tavern-day-link" onClick={() => setOpen(o => !o)}>
                {open ? 'That will do' : 'Hear the whole ballad'}
            </button>
        </div>
    )
}

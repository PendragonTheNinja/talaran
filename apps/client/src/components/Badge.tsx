import { useState } from 'react'

interface BadgeProps {
    /** Stable key, and the image filename. */
    badgeKey: string | null | undefined
    /** The character to draw when no image exists for that key yet. */
    glyph?: string | null
    /** Roughly a capital letter in chat, larger in a picker. */
    size?: number
    title?: string
}

/**
 * A feat badge.
 *
 * Tries /images/badges/{key}.png and falls back to the glyph when it is
 * missing. That is the whole point: art can arrive one badge at a time with
 * nothing to coordinate. Drop in master-smith.png and that badge becomes a
 * picture while the others keep their characters until their turn comes.
 *
 * The fallback is state rather than a CSS trick because a broken img leaves a
 * gap even when hidden, and a badge sits inline in a chat line where a gap
 * shows.
 */
export default function Badge({ badgeKey, glyph, size = 14, title }: BadgeProps) {
    const [failed, setFailed] = useState(false)

    if (!badgeKey) return null

    // The art 404'd, so draw the character instead. No glyph either means the
    // badge does not render at all, which beats an empty box.
    if (failed) {
        return glyph ? <span className="name-badge" title={title}>{glyph}</span> : null
    }

    return (
        <img
            className="name-badge-img"
            src={`/images/badges/${badgeKey}.png`}
            alt={title ?? ''}
            title={title}
            width={size}
            height={size}
            onError={() => setFailed(true)}
        />
    )
}

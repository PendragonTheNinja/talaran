import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Configure marked
marked.setOptions({
    breaks: true,    // line breaks become <br>
    gfm: true,       // GitHub flavored markdown
})

// Configure DOMPurify to allow safe tags only
const ALLOWED_TAGS = [
    'p', 'br', 'strong', 'em', 'u', 's',
    'h1', 'h2', 'h3', 'h4',
    'ul', 'ol', 'li',
    'blockquote', 'code', 'pre',
    'a', 'hr',
]

const ALLOWED_ATTR = ['href', 'target', 'rel']

export function renderMarkdown(text: string): string {
    if (!text) return ''
    const html = marked.parse(text) as string
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        // Force links to open in new tab safely
        FORCE_BODY: true,
    })
}

export function addLinkTargets(html: string): string {
    // Make all links open in new tab with noopener
    return html.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ')
}

/**
 * Patch-note tags (docs/patch-notes-template.md): `[Feature]`, `[Fix]`,
 * `[Balance]`, `[UI]`, `[Content]` or `[Event]` becomes a small coloured label.
 * Done AFTER sanitizing, on a fixed list of words, so the only markup added is
 * our own span; never inside code. Markdown leaves `[Word]` as plain text
 * because it is not a link.
 */
const TAGS: Record<string, string> = {
    feature: 'Feature', fix: 'Fix', bug: 'Fix', balance: 'Balance', ui: 'UI', content: 'Content', event: 'Event',
}

export function renderTags(html: string): string {
    return html.split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>)/g).map((part, i) => {
        if (i % 2 === 1) return part
        return part.replace(/\[(Feature|Fix|Bug|Balance|UI|Content|Event)\]/gi, (_m, word: string) => {
            const label = TAGS[word.toLowerCase()]
            return `<span class="md-tag md-tag-${label.toLowerCase()}">${label}</span>`
        })
    }).join('')
}

export function safeRenderMarkdown(text: string): string {
    return renderTags(addLinkTargets(renderMarkdown(text)))
}
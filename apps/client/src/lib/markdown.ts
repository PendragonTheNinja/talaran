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

export function safeRenderMarkdown(text: string): string {
    return addLinkTargets(renderMarkdown(text))
}
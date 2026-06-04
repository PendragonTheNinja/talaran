import { safeRenderMarkdown } from '../lib/markdown'
import './MarkdownRenderer.css'

interface MarkdownRendererProps {
    content: string
    className?: string
}

export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
    return (
        <div
            className={`markdown-content ${className || ''}`}
            dangerouslySetInnerHTML={{ __html: safeRenderMarkdown(content) }}
        />
    )
}
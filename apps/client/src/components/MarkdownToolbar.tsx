interface MarkdownToolbarProps {
    onInsert: (before: string, after: string, placeholder: string) => void
}

const tools = [
    { label: 'B', before: '**', after: '**', placeholder: 'bold text', title: 'Bold' },
    { label: 'I', before: '*', after: '*', placeholder: 'italic text', title: 'Italic' },
    { label: 'H2', before: '## ', after: '', placeholder: 'Heading', title: 'Heading' },
    { label: '❝', before: '> ', after: '', placeholder: 'quote', title: 'Blockquote' },
    { label: '•', before: '- ', after: '', placeholder: 'list item', title: 'List' },
    { label: '</>', before: '`', after: '`', placeholder: 'code', title: 'Code' },
    { label: '—', before: '\n---\n', after: '', placeholder: '', title: 'Divider' },
]

export default function MarkdownToolbar({ onInsert }: MarkdownToolbarProps) {
    return (
        <div className="markdown-toolbar">
            {tools.map(tool => (
                <button
                    key={tool.label}
                    type="button"
                    className="markdown-tool-btn"
                    title={tool.title}
                    onClick={() => onInsert(tool.before, tool.after, tool.placeholder)}
                >
                    {tool.label}
                </button>
            ))}
        </div>
    )
}
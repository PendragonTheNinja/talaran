import { useRef } from 'react'

export function useMarkdownEditor(
    value: string,
    onChange: (val: string) => void
) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const insertMarkdown = (before: string, after: string, placeholder: string) => {
        const textarea = textareaRef.current
        if (!textarea) return

        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const selected = value.substring(start, end) || placeholder

        const newValue =
            value.substring(0, start) +
            before +
            selected +
            after +
            value.substring(end)

        onChange(newValue)

        // Restore cursor position
        setTimeout(() => {
            textarea.focus()
            const newStart = start + before.length
            const newEnd = newStart + selected.length
            textarea.setSelectionRange(newStart, newEnd)
        }, 0)
    }

    return { textareaRef, insertMarkdown }
}
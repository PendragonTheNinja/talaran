// A list in words, with the Oxford comma (Nathan, 2026-11-13): "A", "A and B",
// "A, B, and C". Every list the game builds goes through this, so none is
// written without it. The server and the client each hold a copy
// (server/src/lib/listWords.ts, client/src/lib/listWords.ts); keep them alike.

export function listWords(items: readonly string[], conjunction: 'and' | 'or' = 'and'): string {
    if (items.length <= 1) return items.join('')
    if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`
    return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`
}

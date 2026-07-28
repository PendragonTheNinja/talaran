// Minimal ZIP writer, no dependencies.
//
// Written by hand rather than pulling in JSZip because the only consumer is an
// admin-only export of a handful of small markdown files. A zip library would
// ship ~100KB to every player's bundle to serve one button.
//
// Entries are STORED (method 0, no compression). Markdown compresses well, but
// implementing DEFLATE to save a few kilobytes on an occasional admin download
// would be a poor trade against the risk of getting it subtly wrong.
//
// Verified against real `unzip -t` and `unzip -l` before shipping.

export interface ZipEntry {
    /** Path inside the archive, e.g. apps/client/public/manual/skills/mining.md */
    path: string
    content: string
}

// ── CRC-32 ──────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
    const table = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
        let c = i
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        }
        table[i] = c >>> 0
    }
    return table
})()

function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff
    for (let i = 0; i < bytes.length; i++) {
        c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
    }
    return (c ^ 0xffffffff) >>> 0
}

// ── little-endian writers ───────────────────────────────────────────────────

function u16(n: number): number[] {
    return [n & 0xff, (n >>> 8) & 0xff]
}

function u32(n: number): number[] {
    return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
}

/** MS-DOS packed date and time, which is what the format wants. */
function dosDateTime(d: Date): { time: number; date: number } {
    const time = ((d.getHours() & 0x1f) << 11)
        | ((d.getMinutes() & 0x3f) << 5)
        | ((Math.floor(d.getSeconds() / 2)) & 0x1f)

    const date = (((d.getFullYear() - 1980) & 0x7f) << 9)
        | (((d.getMonth() + 1) & 0x0f) << 5)
        | (d.getDate() & 0x1f)

    return { time, date }
}

// ── archive ─────────────────────────────────────────────────────────────────

export function createZip(entries: ZipEntry[], now: Date = new Date()): Blob {
    const encoder = new TextEncoder()
    const { time, date } = dosDateTime(now)

    const chunks: Uint8Array[] = []
    const central: number[] = []
    let offset = 0

    for (const entry of entries) {
        const nameBytes = encoder.encode(entry.path)
        const dataBytes = encoder.encode(entry.content)
        const crc = crc32(dataBytes)

        // Bit 11 marks the filename as UTF-8, which matters for any path that
        // is not plain ASCII.
        const flags = 0x0800

        const localHeader = [
            ...u32(0x04034b50),      // local file header signature
            ...u16(20),              // version needed
            ...u16(flags),
            ...u16(0),               // method: stored
            ...u16(time),
            ...u16(date),
            ...u32(crc),
            ...u32(dataBytes.length),
            ...u32(dataBytes.length),
            ...u16(nameBytes.length),
            ...u16(0),               // extra field length
        ]

        chunks.push(new Uint8Array(localHeader), nameBytes, dataBytes)

        central.push(
            ...u32(0x02014b50),      // central directory header signature
            ...u16(20),              // version made by
            ...u16(20),              // version needed
            ...u16(flags),
            ...u16(0),               // method: stored
            ...u16(time),
            ...u16(date),
            ...u32(crc),
            ...u32(dataBytes.length),
            ...u32(dataBytes.length),
            ...u16(nameBytes.length),
            ...u16(0),               // extra field length
            ...u16(0),               // comment length
            ...u16(0),               // disk number start
            ...u16(0),               // internal attributes
            ...u32(0),               // external attributes
            ...u32(offset),          // offset of local header
            ...Array.from(nameBytes),
        )

        offset += localHeader.length + nameBytes.length + dataBytes.length
    }

    const centralBytes = new Uint8Array(central)

    const end = new Uint8Array([
        ...u32(0x06054b50),          // end of central directory signature
        ...u16(0),                   // this disk
        ...u16(0),                   // disk with central directory
        ...u16(entries.length),      // entries on this disk
        ...u16(entries.length),      // total entries
        ...u32(centralBytes.length),
        ...u32(offset),              // central directory offset
        ...u16(0),                   // comment length
    ])

    // Concatenated into one buffer rather than handed to Blob as a list of views:
    // TS's DOM lib will not accept Uint8Array<ArrayBufferLike> as a BlobPart, and a
    // single contiguous allocation is the cleaner thing to hand over anyway.
    const parts = [...chunks, centralBytes, end]
    let total = 0
    for (const part of parts) total += part.length

    const out = new Uint8Array(total)
    let cursor = 0
    for (const part of parts) {
        out.set(part, cursor)
        cursor += part.length
    }

    return new Blob([out], { type: 'application/zip' })
}

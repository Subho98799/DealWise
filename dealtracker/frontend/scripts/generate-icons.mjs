// Generates simple placeholder PNG icons with no dependencies (zlib + a tiny PNG encoder).
// Run: yarn icons   -> writes public/icons/*.png
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
const BG = [0x0f, 0x5c, 0x4d]
const RING = [0xf4, 0xf1, 0xea]
const DOT = [0xf2, 0xb8, 0x4b]

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5)
      const i = y * (size * 4 + 1) + 1 + x * 4
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Ring + dot logo. `scale` shrinks the mark (maskable icons keep it inside the 80% safe zone).
function icon(size, { rounded, scale }) {
  const c = size / 2
  const corner = rounded ? size * 0.22 : 0
  return png(size, (x, y) => {
    if (rounded) {
      const dx = Math.max(corner - x, 0, x - (size - corner))
      const dy = Math.max(corner - y, 0, y - (size - corner))
      if (dx * dx + dy * dy > corner * corner) return [0, 0, 0, 0]
    }
    const d = Math.hypot(x - c, y - c) / size / scale
    if (d < 0.075) return [...DOT, 255]
    if (d > 0.2 && d < 0.3) return [...RING, 255]
    return [...BG, 255]
  })
}

mkdirSync(OUT, { recursive: true })
const files = {
  'icon-192.png': icon(192, { rounded: true, scale: 1 }),
  'icon-512.png': icon(512, { rounded: true, scale: 1 }),
  'maskable-512.png': icon(512, { rounded: false, scale: 0.8 }),
  'apple-touch-icon-180.png': icon(180, { rounded: false, scale: 0.9 }),
}
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(OUT, name), data)
  console.log('wrote', name, data.length, 'bytes')
}

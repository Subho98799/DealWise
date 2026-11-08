import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tokenFile = resolve(frontend, 'src/styles/tokens.css')
const sourceExtensions = new Set(['.css', '.html', '.js', '.jsx', '.json', '.mjs', '.svg', '.ts', '.tsx'])
const hash = String.fromCharCode(35)
const colorPattern = new RegExp(`${hash}(?:[\\da-fA-F]{3}|[\\da-fA-F]{4}|[\\da-fA-F]{6}|[\\da-fA-F]{8})\\b`, 'g')
const violations = []

async function scan(path) {
  const info = await readdir(path, { withFileTypes: true }).catch(() => null)
  if (info) {
    for (const entry of info) {
      if (entry.isDirectory()) {
        if (!['dist', 'node_modules', 'coverage', '.vite'].includes(entry.name)) await scan(join(path, entry.name))
      } else if (sourceExtensions.has(extname(entry.name).toLowerCase())) {
        await inspect(join(path, entry.name))
      }
    }
    return
  }
  await inspect(path)
}

async function inspect(path) {
  if (resolve(path) === tokenFile) return
  const source = await readFile(path, 'utf8').catch(() => null)
  if (source === null) return
  for (const match of source.matchAll(colorPattern)) {
    const line = source.slice(0, match.index).split('\n').length
    violations.push(`${relative(frontend, path)}:${line}: ${match[0]}`)
  }
}

for (const target of [join(frontend, 'src'), join(frontend, 'scripts'), join(frontend, 'public'), join(frontend, 'index.html'), join(frontend, 'vite.config.ts'), join(frontend, 'tailwind.config.js')]) {
  await scan(target)
}

if (violations.length) {
  console.error(`Raw color values belong in src/styles/tokens.css:\n${violations.map((item) => `  ${item}`).join('\n')}`)
  process.exitCode = 1
} else {
  console.log('Color tokens check passed.')
}

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

// Vite emits SFC scoped styles as scoped.css; the host loads ./styles.css
// (referenced by plugin.json), so rename the artifact.
const root = fileURLToPath(new URL('.', import.meta.url))
const scopedCss = readFileSync(`${root}scoped.css`, 'utf8')
writeFileSync(`${root}styles.css`, scopedCss)

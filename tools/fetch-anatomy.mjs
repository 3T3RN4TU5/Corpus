// Downloads the raw anatomy datasets into .assets-raw/, which Git ignores.
// Safe to re-run: files that are already complete are skipped.
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const ROOT = resolve(import.meta.dirname, '..', '.assets-raw')
const MAX_ATTEMPTS = 8
const REPO = 'hubmapconsortium/ccf-3d-reference-object-library'
const HRA_VERSIONS = ['VH_Female/v1.2/', 'VH_Male/v1.2/']
const BP3D_BASE = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/'
const BP3D_FILES = ['isa_BP3D_4.0_obj_99.zip', 'partof_BP3D_4.0_obj_99.zip']
const CONCURRENCY = 6
const HEADERS = { 'User-Agent': 'corpus-asset-pipeline' }

const sizeOf = (path) => (existsSync(path) ? statSync(path).size : 0)

/** Downloads with resume and retries, because the BodyParts3D server drops long transfers. */
async function download(url, target, knownSize) {
  let wanted = knownSize
  if (wanted === undefined) {
    const head = await fetch(url, { method: 'HEAD', headers: HEADERS })
    if (!head.ok) throw new Error(`${head.status} for ${url}`)
    wanted = Number(head.headers.get('content-length'))
    if (!wanted) throw new Error(`No size reported for ${url}`)
  }
  if (sizeOf(target) === wanted) return 'skipped'
  mkdirSync(dirname(target), { recursive: true })

  let lastError
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const have = sizeOf(target)
    try {
      const headers = have ? { ...HEADERS, Range: `bytes=${have}-` } : HEADERS
      const response = await fetch(url, { headers })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      // A server that ignores the range sends the whole file, so start again rather than append.
      const append = have > 0 && response.status === 206
      await pipeline(Readable.fromWeb(response.body), createWriteStream(target, { flags: append ? 'a' : 'w' }))
      if (sizeOf(target) === wanted) return 'downloaded'
      lastError = new Error(`incomplete: ${sizeOf(target)} of ${wanted} bytes`)
    } catch (error) {
      lastError = error
    }
    console.log(`retry ${attempt}: ${target} at ${sizeOf(target)} of ${wanted} bytes (${lastError.message})`)
  }
  throw lastError
}

async function runAll(jobs) {
  let next = 0
  const failures = []
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++]
        try {
          console.log(`${await job.run()}: ${job.name}`)
        } catch (error) {
          failures.push(`${job.name}: ${error.message}`)
        }
      }
    }),
  )
  return failures
}

const treeResponse = await fetch(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`, {
  headers: { ...HEADERS, Accept: 'application/vnd.github+json' },
})
if (!treeResponse.ok) throw new Error(`GitHub tree request failed: ${treeResponse.status}`)
const { tree, truncated } = await treeResponse.json()
if (truncated) throw new Error('GitHub returned a truncated file list')

const hraFiles = tree.filter(
  (item) =>
    item.type === 'blob' &&
    /\.glb$/i.test(item.path) &&
    !/Extraction/i.test(item.path) &&
    HRA_VERSIONS.some((prefix) => item.path.startsWith(prefix)),
)

const jobs = [
  ...hraFiles.map((item) => ({
    name: item.path,
    target: join(ROOT, 'hra', item.path),
    run() {
      const url = `https://raw.githubusercontent.com/${REPO}/main/${item.path.split('/').map(encodeURIComponent).join('/')}`
      return download(url, this.target, item.size)
    },
  })),
  ...BP3D_FILES.map((file) => ({
    name: file,
    target: join(ROOT, 'bp3d', file),
    run() {
      return download(BP3D_BASE + file, this.target)
    },
  })),
]

const failures = await runAll(jobs)
if (failures.length) {
  console.error(`FAILED (${failures.length}):\n${failures.join('\n')}`)
  process.exit(1)
}

const manifest = jobs.map(({ name, target }) => {
  const bytes = readFileSync(target)
  return { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
})
writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2))
const total = manifest.reduce((sum, item) => sum + item.bytes, 0)
console.log(`DONE: ${manifest.length} files, ${(total / 1e6).toFixed(1)} MB`)

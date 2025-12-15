const fs = require('fs')
const path = require('path')

const srcDir = path.resolve(__dirname, '..', 'node_modules', '@mediapipe', 'holistic')
const outDir = path.resolve(__dirname, '..', 'dist', 'mediapipe')

// default config
const defaultConfig = {
  excludes: ['pose_landmark_heavy.tflite'],
  maxSizeMB: 25
}

// try read config file scripts/copy_mediapipe.config.json
let config = defaultConfig
try {
  const cfgPath = path.resolve(__dirname, 'copy_mediapipe.config.json')
  if (fs.existsSync(cfgPath)) {
    const raw = fs.readFileSync(cfgPath, 'utf8')
    const parsed = JSON.parse(raw)
    config = Object.assign({}, defaultConfig, parsed)
    console.log('[copy_mediapipe] using config file', cfgPath)
  } else if (process.env.COPY_MEDIAPIPE_EXCLUDES || process.env.COPY_MEDIAPIPE_MAX_MB) {
    // allow env overrides: COPY_MEDIAPIPE_EXCLUDES (comma separated), COPY_MEDIAPIPE_MAX_MB
    config = Object.assign({}, defaultConfig)
    if (process.env.COPY_MEDIAPIPE_EXCLUDES) {
      config.excludes = process.env.COPY_MEDIAPIPE_EXCLUDES.split(',').map(s => s.trim()).filter(Boolean)
    }
    if (process.env.COPY_MEDIAPIPE_MAX_MB) {
      const m = Number(process.env.COPY_MEDIAPIPE_MAX_MB)
      if (!Number.isNaN(m)) config.maxSizeMB = m
    }
    console.log('[copy_mediapipe] using config from env')
  } else {
    console.log('[copy_mediapipe] using default config')
  }
} catch (err) {
  console.error('[copy_mediapipe] failed to read config, using defaults', err)
}

const excludesSet = new Set(config.excludes || [])
const maxBytes = (config.maxSizeMB || 25) * 1024 * 1024

async function ensureDir(d) {
  await fs.promises.mkdir(d, { recursive: true })
}

let oversizeFound = false

async function copyFiltered() {
  await ensureDir(outDir)
  const items = await fs.promises.readdir(srcDir)
  for (const f of items) {
    // exclude by exact name or prefix pattern
    if (excludesSet.has(f) || f.startsWith('pose_landmark_heavy')) {
      console.log('[copy_mediapipe] excluded', f)
      continue
    }
    const src = path.join(srcDir, f)
    const dest = path.join(outDir, f)
    const stat = await fs.promises.stat(src)
    if (!stat.isFile()) continue

    if (stat.size > maxBytes) {
      console.error(`[copy_mediapipe] ERROR: ${f} is ${(stat.size/1024/1024).toFixed(2)} MiB > ${(maxBytes/1024/1024).toFixed(2)} MiB`)
      oversizeFound = true
      // do not copy oversized files
      continue
    }

    await fs.promises.copyFile(src, dest)
    console.log('[copy_mediapipe] copied', f)
  }
}

copyFiltered().then(() => {
  if (oversizeFound) {
    console.error('[copy_mediapipe] Oversize files detected — failing build')
    process.exit(2)
  }
  console.log('[copy_mediapipe] copy completed successfully')
}).catch(err => {
  console.error(err)
  process.exit(1)
})

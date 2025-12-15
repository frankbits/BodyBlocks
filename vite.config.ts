import { defineConfig } from 'vite'

export default defineConfig({
  // No static-copy plugin here; copying of mediapipe assets is handled by scripts/copy_mediapipe.cjs during the build.
})

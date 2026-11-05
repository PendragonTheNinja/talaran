import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Every production build gets a stamp: baked into the code as __TALARAN_BUILD__,
// and written beside it as version.json. A tab compares the two (UpdateBar.tsx)
// and offers a refresh when the site has been rebuilt since it loaded, so a tab
// left open across a deploy does not run the old game against the new server.
// The dev server has no version.json and its stamp is 'dev', which never checks.
export default defineConfig(({ command }) => {
  const build = command === 'build' ? String(Date.now()) : 'dev'
  return {
    plugins: [
      react(),
      {
        name: 'talaran-build-stamp',
        apply: 'build',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build }) })
        },
      },
    ],
    define: {
      __TALARAN_BUILD__: JSON.stringify(build),
    },
    server: {
      watch: {
        usePolling: true,
        interval: 400,
      },
    },
  }
})

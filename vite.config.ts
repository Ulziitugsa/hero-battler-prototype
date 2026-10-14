import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Moves the app's bundled stylesheet from <head> to just after the static boot screen in <body>. A stylesheet in the
 * head holds back the first paint of the whole page until it has downloaded (hundreds of KB on a cold start); in the
 * body it only holds back what comes after it, so the boot screen (styled inline in index.html) paints at once and
 * the app script, which follows it, still never runs before its styles have arrived. Production builds only: in dev,
 * styles are injected by script.
 */
function bootScreenFirst(): Plugin {
  return {
    name: 'moonwater-boot-screen-first',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const links: string[] = []
        const head = html.replace(/[ \t]*<link rel="stylesheet"[^>]*href="[^"]*\.css"[^>]*>\r?\n?/g, (tag) => {
          links.push(tag.trim())
          return ''
        })
        return links.length ? head.replace('</body>', `  ${links.join('\n    ')}\n  </body>`) : html
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), bootScreenFirst()],
})

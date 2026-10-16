import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const PRELOAD_HELPER_ID = '\0vite/preload-helper.js'
const PRELOAD_APPEND = 'document.head.appendChild(link)'

/**
 * Moves the app's bundled stylesheets from <head> to just after the static boot screen in <body>. A stylesheet in the
 * head holds back the first paint of the whole page until it has downloaded (hundreds of KB on a cold start); in the
 * body it only holds back what comes after it, so the boot screen (styled inline in index.html) paints at once and
 * the app script still never runs before its styles have arrived. The moved links keep their order.
 *
 * Stylesheets of lazily-loaded screens are added later by Vite's preload helper, which appends them to <head>. Left
 * alone, that would put them before the main stylesheet and flip the cascade (they used to come after it), so the
 * helper appends to <body> instead, after the moved links. Production builds only: in dev, styles are injected by script.
 */
function bootScreenFirst(): Plugin {
  return {
    name: 'moonwater-boot-screen-first',
    apply: 'build',
    transform: {
      filter: { id: /^\0vite\/preload-helper\.js$/ },
      handler(code, id) {
        if (id !== PRELOAD_HELPER_ID) return null
        if (!code.includes(PRELOAD_APPEND)) {
          this.error(`bootScreenFirst: Vite's preload helper no longer contains "${PRELOAD_APPEND}"; lazy stylesheets would land before the main one.`)
        }
        return code.replace(PRELOAD_APPEND, 'document.body.appendChild(link)')
      },
    },
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

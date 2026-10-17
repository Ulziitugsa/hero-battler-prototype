import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

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

/**
 * The Card Discovery Lab (src/lab, docs/design/CARD-DISCOVERY-LAB.md) is built in only for the development server, a test
 * build asked for with VITE_CARD_LAB=1, or a Vercel preview deployment (VERCEL_ENV=preview; previews sit behind Vercel's
 * login). VITE_CARD_LAB=0 turns it off anywhere. Everywhere else __CARD_LAB__ is the constant false, and the bundler
 * drops the lab, its chunk and its ?lab entry from the build.
 */
function cardLabEnabled(command: 'build' | 'serve', env: Record<string, string | undefined>): boolean {
  if (env.VITE_CARD_LAB === '0') return false
  return command === 'serve' || env.VITE_CARD_LAB === '1' || env.VERCEL_ENV === 'preview'
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => ({
  plugins: [react(), bootScreenFirst()],
  define: {
    __CARD_LAB__: JSON.stringify(mode !== 'test' && cardLabEnabled(command, { ...loadEnv(mode, process.cwd(), 'VITE_'), VERCEL_ENV: process.env.VERCEL_ENV })),
  },
}))

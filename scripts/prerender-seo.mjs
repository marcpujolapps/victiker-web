import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createServer } from 'vite'
import { pageMetadata } from '../src/lib/seo.js'

const output = new URL('../dist/client/', import.meta.url)
const template = await readFile(new URL('index.html', output), 'utf8')
const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const server = await createServer({ server: { middlewareMode: true, warmup: { clientFiles: [] } }, appType: 'custom' })
try {
  const { render } = await server.ssrLoadModule('/src/entry-seo.jsx')
  // Catalog data stays live in the browser; business and legal pages are static HTML.
  for (const [path, metadata] of Object.entries(pageMetadata)) {
    if (path === '/admin' || path === '/catalogo') continue
    const canonical = `https://victiker.com${path}`
    let html = template.replace(/<title>.*?<\/title>/s, `<title>${escape(metadata.title)}</title>`)
    for (const [key, value] of Object.entries({ description: metadata.description, 'og:title': metadata.title, 'og:description': metadata.description, 'og:url': canonical, 'twitter:title': metadata.title, 'twitter:description': metadata.description })) {
      html = html.replace(new RegExp(`(<meta (?:name|property)="${key}" content=")[^"]*("\\s*/?>)`), (_, before, after) => before + escape(value) + after)
    }
    html = html.replace(/(<link rel="canonical" href=")[^"]*("\s*\/?>)/, (_, before, after) => before + canonical + after)
    html = html.replace('<div id="root"></div>', () => `<div id="root">${render(path)}</div>`)
    const directory = new URL(path === '/' ? './' : `.${path}/`, output)
    await mkdir(directory, { recursive: true })
    await writeFile(new URL('index.html', directory), html)
    // Clean-URL static hosts resolve /servicios to /servicios.html.
    if (path !== '/') await writeFile(new URL(`.${path}.html`, output), html)
    console.log(`Prerendered ${path}`)
  }
} finally {
  await server.close()
}

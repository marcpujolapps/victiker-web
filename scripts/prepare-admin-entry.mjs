import { readFile, writeFile } from 'node:fs/promises'

const output = new URL('../dist/client/', import.meta.url)
let html = await readFile(new URL('index.html', output), 'utf8')
html = html.replace(/<title>.*?<\/title>/s, '<title>Administración | Victiker</title>')
html = html.replace('<head>', '<head><meta name="robots" content="noindex,nofollow" />')
html = html.replace(/<div id="root">[\s\S]*?<\/div>/, '<div id="root"><main class="admin-login"><p>Cargando administración…</p><noscript>Activa JavaScript para acceder a la administración de Victiker.</noscript></main></div>')
await writeFile(new URL('admin.html', output), html)

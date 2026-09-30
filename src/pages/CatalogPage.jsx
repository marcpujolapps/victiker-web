import { ArrowRight, Boat, CaretLeft, CaretRight, CheckCircle, Funnel, ImageSquare, List, MagnifyingGlass, Motorcycle, Plus, ShoppingBag, SquaresFour, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getCatalogCount, getCatalogPage, getTaxonomies, searchCatalogByEmbedding, slugifyCatalogCategory } from '../lib/catalog'
import { rankCatalogResults } from '../lib/catalogRanking'
import { firebaseConfigured } from '../lib/firebase'

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

function ProductImage({ product }) {
  const [failed, setFailed] = useState(false)
  if (!product.imageUrl || failed) return <span className="catalog-product-image catalog-product-image--empty"><ImageSquare size={22} /></span>
  return <span className="catalog-product-image"><img src={product.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} /></span>
}

export function CatalogPage({ addToCart, cart, itemCount, openRequest, navigate, path = window.location.pathname }) {
  const routeCategory = path.match(/^\/repuestos\/(moto|barco)(?:\/([^/]+))?(?:\/([^/]+))?$/)
  const [category, setCategory] = useState(() => routeCategory?.[1] || new URLSearchParams(window.location.search).get('tipo') || 'moto')
  const [viewMode, setViewMode] = useState(() => ['list', 'grid'].includes(window.localStorage.getItem('victiker-catalog-view')) ? window.localStorage.getItem('victiker-catalog-view') : 'list')
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('buscar') || ''); const [categoryId, setCategoryId] = useState(''); const [page, setPage] = useState({ items: [], cursor: null, history: [] }); const [total, setTotal] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [taxonomies, setTaxonomies] = useState([]); const [filterOpen, setFilterOpen] = useState(false); const [sort, setSort] = useState(() => new URLSearchParams(window.location.search).has('buscar') ? 'relevance' : 'reference')
  const [debouncedQuery, setDebouncedQuery] = useState(query); const [semanticPending, setSemanticPending] = useState(false)
  const requestId = useRef(0)
  const searchingByEmbedding = debouncedQuery.trim().length >= 2
  const browseSort = searchingByEmbedding ? 'relevance' : sort
  const categories = useMemo(() => taxonomies.filter((entry) => !entry.parentId && entry.active && (category === 'all' || entry.vehicleType === category)), [taxonomies, category])
  const selectedTaxonomy = taxonomies.find((entry) => entry.id === categoryId)
  useEffect(() => {
    const selected = taxonomies.find((entry) => entry.id === categoryId)
    const vehicleLabel = category === 'barco' ? 'embarcación' : 'moto'
    const title = selected ? `${selected.name} para ${vehicleLabel} | Repuestos Victiker` : `Repuestos para ${vehicleLabel} | Victiker`
    document.title = title
    const description = selected ? `Consulta repuestos de ${selected.name.toLocaleLowerCase('es')} para ${vehicleLabel}. Filtra el catálogo Victiker y solicita confirmación de compatibilidad.` : `Catálogo de repuestos para ${vehicleLabel}. Busca por referencia, explora categorías y solicita confirmación a Victiker.`
    const meta = document.head.querySelector('meta[name="description"]')
    meta?.setAttribute('content', description)
    document.head.querySelector('link[rel="canonical"]')?.setAttribute('href', `https://victiker.com${path}`)
  }, [category, categoryId, path, taxonomies])
  const visibleItems = useMemo(() => [...page.items].sort((a, b) => sort === 'price-asc' ? Number(a.price) - Number(b.price) : sort === 'price-desc' ? Number(b.price) - Number(a.price) : sort === 'name' ? (a.description || '').localeCompare(b.description || '', 'es') : sort === 'relevance' && searchingByEmbedding ? Number(b._searchScore || 0) - Number(a._searchScore || 0) : (a.reference || '').localeCompare(b.reference || '', 'es')), [page.items, sort, searchingByEmbedding])
  const countFor = (id) => cart.find((item) => item.id === id)?.quantity || 0
  async function load(cursor = null, reset = false) {
    if (!firebaseConfigured) { setLoading(false); return }
    const currentRequest = ++requestId.current
    const isCurrent = () => currentRequest === requestId.current
    setLoading(true); setError(''); setSemanticPending(searchingByEmbedding)
    if (reset) { setPage({ items: [], cursor: null, history: [] }); setTotal(null) }
    try {
      if (searchingByEmbedding) {
        const semanticPromise = searchCatalogByEmbedding(debouncedQuery, 40).then((result) => ({ result })).catch((error) => ({ error }))
        let lexicalItems = []
        try {
          const lexical = await getCatalogPage({ vehicleType: category, categoryId, term: debouncedQuery })
          if (!isCurrent()) return
          lexicalItems = lexical.items
          setPage({ items: rankCatalogResults(debouncedQuery, lexicalItems), cursor: null, history: [] })
          setTotal(null)
          if (lexicalItems.length) setLoading(false)
        } catch { /* Semantic search remains available if the prefix index is unavailable. */ }
        const { result: semantic, error: searchError } = await semanticPromise
        if (!isCurrent()) return
        if (searchError) { if (!lexicalItems.length) throw searchError; return }
        const similar = semantic.items.filter((item) => (category === 'all' || item.vehicleType === category) && (!categoryId || item.categoryId === categoryId || item.subcategoryId === categoryId))
        const items = rankCatalogResults(debouncedQuery, lexicalItems, similar)
        setPage({ items, cursor: null, history: [] })
        setTotal(items.length)
        return
      }
      let result
      try { result = await getCatalogPage({ vehicleType: category, categoryId, term: debouncedQuery, cursor, sort: sort.startsWith('price-') ? 'price' : sort === 'name' ? 'name' : 'reference', direction: sort === 'price-desc' ? 'desc' : 'asc' }) }
      catch (sortError) {
        if (sort === 'reference' || !/index|failed-precondition|requires an index/i.test(sortError.message)) throw sortError
        result = await getCatalogPage({ vehicleType: category, categoryId, term: debouncedQuery, cursor })
      }
      if (!isCurrent()) return
      setPage((current) => ({ items: result.items, cursor: result.nextCursor, history: reset ? [] : current.history }))
      if (reset) {
        try { const count = await getCatalogCount({ vehicleType: category, categoryId, term: debouncedQuery }); if (isCurrent()) setTotal(count) }
        catch { if (isCurrent()) setTotal(null) }
      }
    } catch (requestError) { if (isCurrent()) setError(requestError.message) }
    finally { if (isCurrent()) { setLoading(false); setSemanticPending(false) } }
  }
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query), 350); return () => window.clearTimeout(timer) }, [query])
  useEffect(() => { load(null, true); return () => { requestId.current += 1 } }, [category, categoryId, debouncedQuery, browseSort])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (routeCategory) setCategory(routeCategory[1])
    else { setCategory(params.get('tipo') || 'moto'); setQuery(params.get('buscar') || '') }
    if (!firebaseConfigured) return
    getTaxonomies().then((items) => {
      setTaxonomies(items)
      if (!routeCategory?.[2]) { setCategoryId(''); return }
      const slug = decodeURIComponent(routeCategory[3] || routeCategory[2])
      const parentSlug = routeCategory[3] ? decodeURIComponent(routeCategory[2]) : null
      const found = items.find((entry) => entry.active && entry.vehicleType === routeCategory[1] && slugifyCatalogCategory(entry.name) === slug && (!parentSlug || entry.parentId && slugifyCatalogCategory(items.find((parent) => parent.id === entry.parentId)?.name) === parentSlug))
      if (found) setCategoryId(found.id)
    }).catch(() => {})
  }, [path])
  function chooseCategory(value) { setCategory(value); setCategoryId(''); navigate?.(value === 'all' ? `/catalogo?tipo=all${debouncedQuery ? `&buscar=${encodeURIComponent(debouncedQuery)}` : ''}` : `/repuestos/${value}`) }
  function chooseTaxonomy(entry) { setCategory(entry.vehicleType); setCategoryId(entry.id); const parent = entry.parentId ? taxonomies.find((item) => item.id === entry.parentId) : null; navigate?.(`/repuestos/${entry.vehicleType}/${parent ? `${slugifyCatalogCategory(parent.name)}/` : ''}${slugifyCatalogCategory(entry.name)}`) }
  function next() { setPage((current) => ({ ...current, history: [...current.history, { items: current.items, cursor: current.cursor }] })); load(page.cursor) }
  function previous() { setPage((current) => { const history = [...current.history]; const previous = history.pop(); return { ...current, items: previous.items, cursor: previous.cursor, history } }) }
  function changeViewMode(mode) { setViewMode(mode); window.localStorage.setItem('victiker-catalog-view', mode) }
  return <>
    <nav className="breadcrumbs" aria-label="Migas de pan"><button onClick={() => navigate?.('/')}>Inicio</button><span>/</span><button onClick={() => navigate?.('/catalogo')}>Repuestos</button><span>/</span><button onClick={() => chooseCategory(category)}>{category === 'barco' ? 'Embarcación' : 'Moto'}</button>{selectedTaxonomy && <><span>/</span>{selectedTaxonomy.parentId && <><button onClick={() => chooseTaxonomy(taxonomies.find((entry) => entry.id === selectedTaxonomy.parentId))}>{taxonomies.find((entry) => entry.id === selectedTaxonomy.parentId)?.name}</button><span>/</span></>}<span>{selectedTaxonomy.name}</span></>}</nav>
    <section className="catalog-intro"><div><p className="section-eyebrow">Repuestos para {category === 'barco' ? 'embarcación' : 'moto'}</p><h1>{category === 'barco' ? 'Encuentra repuestos para tu embarcación.' : 'Encuentra la pieza que necesitas.'}</h1></div><button className="button button--dark" onClick={openRequest}><ShoppingBag size={19} /> Mi solicitud {cart.length > 0 && `(${cart.length})`}</button></section>
    <section className={`catalog-layout${filterOpen ? ' catalog-layout--filters-open' : ''}`}><aside className="catalog-filters"><div className="mobile-filter-heading"><strong>Filtros</strong><button onClick={() => setFilterOpen(false)} aria-label="Cerrar filtros"><X size={21} /></button></div><p>Tipo de vehículo</p><button className={category === 'all' ? 'is-active' : ''} onClick={() => chooseCategory('all')}>Todos los vehículos</button><button className={category === 'moto' ? 'is-active' : ''} onClick={() => chooseCategory('moto')}><Motorcycle size={19} /> Moto</button><button className={category === 'barco' ? 'is-active' : ''} onClick={() => chooseCategory('barco')}><Boat size={19} /> Embarcación</button><p>Categoría</p><button className={!categoryId ? 'is-active' : ''} onClick={() => { setCategoryId(''); navigate?.(category === 'all' ? '/catalogo?tipo=all' : `/repuestos/${category}`) }}>Todas</button>{categories.map((entry) => <div className="catalog-filter-group" key={entry.id}><button className={categoryId === entry.id ? 'is-active' : ''} onClick={() => chooseTaxonomy(entry)}>{entry.name}</button>{taxonomies.filter((child) => child.active && child.parentId === entry.id).map((child) => <button className={`catalog-filter-subcategory${categoryId === child.id ? ' is-active' : ''}`} key={child.id} onClick={() => chooseTaxonomy(child)}>{child.name}</button>)}</div>)}</aside>
      <div className="catalog-results"><div className="catalog-toolbar"><label className="search-field"><MagnifyingGlass size={20} /><input value={query} onChange={(event) => { setQuery(event.target.value); if (event.target.value.trim()) setSort('relevance') }} placeholder="Buscar por nombre o referencia" /></label><button className="mobile-filter-button" onClick={() => setFilterOpen(true)}><Funnel size={17} /> Filtros{categoryId ? ' · 1' : ''}</button><label className="catalog-sort">Ordenar<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="relevance">Relevancia</option><option value="reference">Referencia</option><option value="name">Nombre</option><option value="price-asc">Precio: menor primero</option><option value="price-desc">Precio: mayor primero</option></select></label><div className="catalog-toolbar__meta"><span>{searchingByEmbedding ? `${page.items.length} resultados` : total === null ? '…' : `${total} referencias`}</span><div className="catalog-view-toggle" role="group" aria-label="Modo de visualización"><button className={viewMode === 'list' ? 'is-active' : ''} type="button" aria-label="Ver en listado" aria-pressed={viewMode === 'list'} onClick={() => changeViewMode('list')}><List size={18} /></button><button className={viewMode === 'grid' ? 'is-active' : ''} type="button" aria-label="Ver en cuadrícula" aria-pressed={viewMode === 'grid'} onClick={() => changeViewMode('grid')}><SquaresFour size={18} /></button></div></div></div>
      {semanticPending && <div className="catalog-search-progress" role="status"><span className="search-progress__spinner" aria-hidden="true" /><span>Buscando también productos similares…</span></div>}
      {!firebaseConfigured ? <div className="empty-results">El catálogo estará disponible cuando se configure Firebase.</div> : error ? <div className="empty-results">{error}</div> : <><div className={`catalog-table catalog-table--${viewMode}`}><div className="catalog-table__head"><span>Imagen</span><span>Referencia</span><span>Producto</span><span>Categoría</span><span>Precio</span><span /></div>{visibleItems.map((product) => <article key={product.id}><button className="catalog-product-open" onClick={() => navigate?.(`/producto/${encodeURIComponent(product.id)}`)} aria-label={`Ver ficha de ${product.description}`}><ProductImage product={product} /></button><span>{product.reference}</span><div><button className="catalog-product-title" onClick={() => navigate?.(`/producto/${encodeURIComponent(product.id)}`)}>{product.description}</button><small>{product.brand ? `${product.brand} · ` : ''}{product.vehicleType === 'barco' ? 'Embarcación' : product.vehicleType === 'moto' ? 'Moto' : 'Sin clasificar'}{product.stockLevel ? ` · ${product.stockLevel === 'InStock' ? 'Disponible' : product.stockLevel === 'Short' ? 'Pocas unidades' : 'Sin stock'}` : ''}</small></div><span>{taxonomies.find((entry) => entry.id === product.categoryId)?.name || product.sourceCategory || 'Sin categoría'}</span><strong>{money.format(product.price)}</strong><button className="add-product-button" onClick={() => addToCart({ ...product, title: product.description })} aria-label={`Añadir ${product.description}`}><Plus size={18} /><span>Añadir</span></button></article>)}</div>{!loading && page.items.length === 0 && <div className="empty-results">No encontramos resultados. Prueba con otra búsqueda o categoría.</div>}<nav className="pagination" aria-label="Paginación del catálogo"><button disabled={!page.history.length} onClick={previous} aria-label="Página anterior"><CaretLeft size={18} /></button><span>{loading ? 'Cargando…' : `Página ${page.history.length + 1}`}</span><button disabled={!page.cursor} onClick={next} aria-label="Página siguiente"><CaretRight size={18} /></button></nav></>}</div>
    </section>
    {itemCount > 0 && <aside className="catalog-request-bar" aria-label="Solicitud en curso"><div><ShoppingBag size={22} weight="fill" /><span><strong>{itemCount} {itemCount === 1 ? 'repuesto añadido' : 'repuestos añadidos'}</strong><small>Tu solicitud está lista para revisar cuando quieras.</small></span></div><button className="button button--small" onClick={openRequest}>Revisar y enviar <ArrowRight size={17} /></button></aside>}
  </>
}

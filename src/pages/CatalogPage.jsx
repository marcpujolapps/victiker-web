import { ArrowRight, Boat, CaretLeft, CaretRight, CheckCircle, Funnel, MagnifyingGlass, Motorcycle, Plus, ShoppingBag } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { getCatalogCount, getCatalogPage, getTaxonomies } from '../lib/catalog'
import { firebaseConfigured } from '../lib/firebase'

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export function CatalogPage({ addToCart, cart, itemCount, openRequest }) {
  const [category, setCategory] = useState(() => new URLSearchParams(window.location.search).get('tipo') || 'moto')
  const [query, setQuery] = useState(''); const [categoryId, setCategoryId] = useState(''); const [page, setPage] = useState({ items: [], cursor: null, history: [] }); const [total, setTotal] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [taxonomies, setTaxonomies] = useState([])
  const categories = useMemo(() => taxonomies.filter((entry) => !entry.parentId && entry.active && entry.vehicleType === category), [taxonomies, category])
  const countFor = (id) => cart.find((item) => item.id === id)?.quantity || 0
  async function load(cursor = null, reset = false) {
    if (!firebaseConfigured) { setLoading(false); return }
    setLoading(true); setError('')
    try { const result = await getCatalogPage({ vehicleType: category, categoryId, term: query, cursor }); setPage((current) => ({ items: result.items, cursor: result.nextCursor, history: reset ? [] : current.history })); if (reset) setTotal(await getCatalogCount({ vehicleType: category, categoryId })) } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }
  useEffect(() => { load(null, true); getTaxonomies().then(setTaxonomies).catch(() => {}) }, [category, categoryId, query])
  function chooseCategory(value) { setCategory(value); setCategoryId(''); window.history.replaceState({}, '', `/catalogo?tipo=${value}`) }
  function next() { setPage((current) => ({ ...current, history: [...current.history, { items: current.items, cursor: current.cursor }] })); load(page.cursor) }
  function previous() { setPage((current) => { const history = [...current.history]; const previous = history.pop(); return { ...current, items: previous.items, cursor: previous.cursor, history } }) }
  return <>
    <section className="catalog-intro"><div><p className="section-eyebrow">Piezas y repuestos</p><h1>Encuentra la pieza<br />que necesitas.</h1><p>Busca por referencia, filtra por categoría y prepara una solicitud. Confirmaremos compatibilidad y disponibilidad antes de cualquier compra.</p></div><button className="button button--dark" onClick={openRequest}><ShoppingBag size={19} /> Mi solicitud {cart.length > 0 && `(${cart.length})`}</button></section>
    <section className="catalog-layout"><aside className="catalog-filters"><p>Tipo de vehículo</p><button className={category === 'moto' ? 'is-active' : ''} onClick={() => chooseCategory('moto')}><Motorcycle size={19} /> Moto</button><button className={category === 'barco' ? 'is-active' : ''} onClick={() => chooseCategory('barco')}><Boat size={19} /> Embarcación</button><p>Categoría</p><button className={!categoryId ? 'is-active' : ''} onClick={() => setCategoryId('')}>Todas</button>{categories.map((entry) => <button key={entry.id} className={categoryId === entry.id ? 'is-active' : ''} onClick={() => setCategoryId(entry.id)}>{entry.name}</button>)}</aside>
      <div className="catalog-results"><div className="catalog-toolbar"><label className="search-field"><MagnifyingGlass size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o referencia" /></label><span><Funnel size={17} /> {total === null ? '…' : `${total} referencias`}</span></div>
      {!firebaseConfigured ? <div className="empty-results">El catálogo estará disponible cuando se configure Firebase.</div> : error ? <div className="empty-results">{error}</div> : <><div className="catalog-table"><div className="catalog-table__head"><span>Referencia</span><span>Producto</span><span>Categoría</span><span>Precio</span><span /></div>{page.items.map((product) => <article key={product.id}><span>{product.reference}</span><div><strong>{product.description}</strong><small>{product.vehicleType === 'barco' ? 'Embarcación' : product.vehicleType === 'moto' ? 'Moto' : 'Sin clasificar'}</small></div><span>{categories.find((entry) => entry.id === product.categoryId)?.name || 'Sin categoría'}</span><strong>{money.format(product.price)}</strong><button onClick={() => addToCart({ ...product, title: product.description })} aria-label={`Añadir ${product.description}`}>{countFor(product.id) ? <CheckCircle size={20} weight="fill" /> : <Plus size={20} />}</button></article>)}</div>{!loading && page.items.length === 0 && <div className="empty-results">No encontramos resultados. Prueba con otra búsqueda o categoría.</div>}<nav className="pagination" aria-label="Paginación del catálogo"><button disabled={!page.history.length} onClick={previous} aria-label="Página anterior"><CaretLeft size={18} /></button><span>{loading ? 'Cargando…' : `Página ${page.history.length + 1}`}</span><button disabled={!page.cursor} onClick={next} aria-label="Página siguiente"><CaretRight size={18} /></button></nav></>}</div>
    </section>
    {itemCount > 0 && <aside className="catalog-request-bar" aria-label="Solicitud en curso"><div><ShoppingBag size={22} weight="fill" /><span><strong>{itemCount} {itemCount === 1 ? 'repuesto añadido' : 'repuestos añadidos'}</strong><small>Tu solicitud está lista para revisar cuando quieras.</small></span></div><button className="button button--small" onClick={openRequest}>Revisar y enviar <ArrowRight size={17} /></button></aside>}
  </>
}

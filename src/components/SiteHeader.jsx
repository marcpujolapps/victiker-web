import { List, MagnifyingGlass, ShoppingBag, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { getCatalogSuggestions, getTaxonomies, searchCatalogByEmbedding, slugifyCatalogCategory } from '../lib/catalog'
import { rankCatalogResults } from '../lib/catalogRanking'
import { firebaseConfigured } from '../lib/firebase'

const links = [
  ['/servicios', 'Servicios'],
  ['/taller-movil', 'Taller móvil'],
  ['/contacto', 'Contacto'],
]

export function SiteHeader({ path, itemCount, navigate, openRequest }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [categories, setCategories] = useState([])
  const [categoriesOpen, setCategoriesOpen] = useState('')
  useEffect(() => { if (firebaseConfigured) getTaxonomies().then((items) => setCategories(items.filter((item) => item.active))).catch(() => {}) }, [])
  useEffect(() => {
    const value = term.trim()
    if (value.length < 2) { setSuggestions([]); setSearching(false); setSearchError(false); return undefined }
    let current = true
    setSuggestions([])
    setSearching(true)
    setSearchError(false)
    const timer = window.setTimeout(async () => {
      const semanticPromise = searchCatalogByEmbedding(value, 8).then((result) => result.items || []).catch(() => null)
      const direct = await getCatalogSuggestions(value).catch(() => [])
      if (!current) return
      setSuggestions(rankCatalogResults(value, direct, [], 8))
      setSuggestionsOpen(true)
      const similar = await semanticPromise
      if (!current) return
      setSuggestions(rankCatalogResults(value, direct, similar || [], 8))
      setSearchError(similar === null && direct.length === 0)
      setSearching(false)
    }, 200)
    return () => { current = false; window.clearTimeout(timer) }
  }, [term])
  function goTo(nextPath) { navigate(nextPath); setMenuOpen(false) }
  function submitSearch(event) { event.preventDefault(); setSuggestionsOpen(false); goTo(`/catalogo?tipo=all&buscar=${encodeURIComponent(term.trim())}`) }
  function categoryName(value) { return value.replace(/^\s*>\s*/, '') }
  function renderPartsMenu(vehicleType, label) {
    const roots = categories.filter((entry) => entry.vehicleType === vehicleType && !entry.parentId)
      .sort((a, b) => categoryName(a.name).localeCompare(categoryName(b.name), 'es'))
    return <div className="parts-nav" key={vehicleType} onMouseEnter={() => setCategoriesOpen(vehicleType)} onMouseLeave={() => setCategoriesOpen((open) => open === vehicleType ? '' : open)}>
      <button className={path.startsWith(`/repuestos/${vehicleType}`) ? 'is-current' : ''} aria-expanded={categoriesOpen === vehicleType} onClick={() => { if (window.matchMedia('(max-width: 1100px)').matches) setCategoriesOpen((open) => open === vehicleType ? '' : vehicleType); else goTo(`/repuestos/${vehicleType}`) }}>{label}<span className="parts-nav__chevron" aria-hidden="true">⌄</span></button>
      <div className="category-menu" aria-label={`Categorías de ${label.toLocaleLowerCase('es')}`}>
        <button className="category-menu__all" onClick={() => goTo(`/repuestos/${vehicleType}`)}>Todas las piezas</button>
        {roots.map((entry) => <div className="category-menu__group" key={entry.id}>
          <button onClick={() => goTo(`/repuestos/${vehicleType}/${slugifyCatalogCategory(entry.name)}`)}>{categoryName(entry.name)}</button>
          {categories.filter((child) => child.parentId === entry.id).sort((a, b) => categoryName(a.name).localeCompare(categoryName(b.name), 'es')).map((child) => <button className="category-menu__child" key={child.id} onClick={() => goTo(`/repuestos/${vehicleType}/${slugifyCatalogCategory(entry.name)}/${slugifyCatalogCategory(child.name)}`)}>{categoryName(child.name)}</button>)}
        </div>)}
      </div>
    </div>
  }
  return <header className="site-header">
    <button className="brand" onClick={() => goTo('/')} aria-label="Ir al inicio de Victiker">
      <span className="brand-lockup"><img className="brand-mark" src="/assets/victiker-emblem-v2.webp" alt="" /><img className="brand-wordmark" src="/assets/victiker-wordmark-v2.webp" alt="Victiker" /></span>
    </button>
    <form className="global-search" role="search" onSubmit={submitSearch}>
      <MagnifyingGlass size={21} aria-hidden="true" />
      <input value={term} onFocus={() => setSuggestionsOpen(true)} onKeyDown={(event) => { if (event.key === 'Escape') setSuggestionsOpen(false) }} onChange={(event) => { setTerm(event.target.value); setSuggestionsOpen(true) }} placeholder="Busca en el catálogo de piezas" aria-label="Buscar productos en Victiker" />
      <button className="button button--small" type="submit">Buscar</button>
      {suggestionsOpen && term.trim().length >= 2 && <div className="global-search__suggestions" role="listbox" aria-label="Productos encontrados">{searching && <p className="global-search__state global-search__state--loading" role="status"><span className="search-progress__spinner" aria-hidden="true" />{suggestions.length ? 'Buscando también productos similares…' : 'Buscando productos…'}</p>}{suggestions.map((product) => <button type="button" role="option" aria-selected="false" className="global-search__suggestion" key={product.id} onClick={() => { setSuggestionsOpen(false); goTo(`/producto/${encodeURIComponent(product.id)}`) }}>{product.imageUrl && <img className="global-search__suggestion-image" src={product.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}<span><strong>{product.description || product.reference}</strong><small>{[product.reference, product.brand, product.vehicleType === 'barco' ? 'Embarcación' : product.vehicleType === 'moto' ? 'Moto' : ''].filter(Boolean).join(' · ')}</small></span><MagnifyingGlass size={16} /></button>)}{!searching && suggestions.length === 0 && <p className="global-search__state">{searchError ? 'No se ha podido completar la búsqueda. Inténtalo de nuevo.' : 'No encontramos coincidencias. Prueba con otra referencia o descripción.'}</p>}{suggestions.length > 0 && <button type="submit" className="global-search__all">Ver todos los resultados</button>}</div>}
    </form>
    <nav className={menuOpen ? 'site-nav site-nav--open' : 'site-nav'} aria-label="Navegación principal">
      {renderPartsMenu('moto', 'Piezas moto')}
      {renderPartsMenu('barco', 'Piezas barcos')}
      {links.map(([to, label]) => <button className={path === to ? 'is-current' : ''} onClick={() => goTo(to)} key={to}>{label}</button>)}
    </nav>
    <div className="header-actions">
      <button className="cart-button" onClick={openRequest} aria-label={`Abrir solicitud: ${itemCount} repuestos`}><ShoppingBag size={22} />{itemCount > 0 && <span>{itemCount}</span>}</button>
      <button className="button button--small" onClick={() => goTo('/contacto')}>Pedir cita</button>
      <button className="menu-button" onClick={() => setMenuOpen((value) => !value)} aria-label="Abrir menú">{menuOpen ? <X size={25} /> : <List size={27} />}</button>
    </div>
  </header>
}

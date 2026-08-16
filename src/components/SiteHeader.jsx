import { List, ShoppingBag, X } from '@phosphor-icons/react'
import { useState } from 'react'

const links = [
  ['/servicios', 'Servicios'],
  ['/taller-movil', 'Taller móvil'],
  ['/catalogo', 'Repuestos'],
  ['/contacto', 'Contacto'],
]

export function SiteHeader({ path, itemCount, navigate, openRequest }) {
  const [menuOpen, setMenuOpen] = useState(false)
  function goTo(nextPath) { navigate(nextPath); setMenuOpen(false) }
  return <header className="site-header">
    <button className="brand" onClick={() => goTo('/')} aria-label="Ir al inicio de Victiker">
      <span className="brand-lockup"><img className="brand-mark" src="/assets/victiker-emblem-v2.webp" alt="" /><img className="brand-wordmark" src="/assets/victiker-wordmark-v2.webp" alt="Victiker" /></span>
    </button>
    <nav className={menuOpen ? 'site-nav site-nav--open' : 'site-nav'} aria-label="Navegación principal">
      {links.map(([to, label]) => <button className={path === to ? 'is-current' : ''} onClick={() => goTo(to)} key={to}>{label}</button>)}
    </nav>
    <div className="header-actions">
      <button className="cart-button" onClick={openRequest} aria-label={`Abrir solicitud: ${itemCount} repuestos`}><ShoppingBag size={22} />{itemCount > 0 && <span>{itemCount}</span>}</button>
      <button className="button button--small" onClick={() => goTo('/contacto')}>Pedir cita</button>
      <button className="menu-button" onClick={() => setMenuOpen((value) => !value)} aria-label="Abrir menú">{menuOpen ? <X size={25} /> : <List size={27} />}</button>
    </div>
  </header>
}

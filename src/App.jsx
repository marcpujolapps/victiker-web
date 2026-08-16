import { CheckCircle } from '@phosphor-icons/react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { RequestDrawer } from './components/RequestDrawer'
import { SiteFooter } from './components/SiteFooter'
import { SiteHeader } from './components/SiteHeader'
import { CatalogPage } from './pages/CatalogPage'
import { ContactPage } from './pages/ContactPage'
import { HomePage } from './pages/HomePage'
import { ServicesPage } from './pages/ServicesPage'
import { WorkshopPage } from './pages/WorkshopPage'
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })))

const routes = {
  '/': HomePage,
  '/servicios': ServicesPage,
  '/taller-movil': WorkshopPage,
  '/catalogo': CatalogPage,
  '/contacto': ContactPage,
  '/admin': AdminPage,
}

export function App() {
  const [path, setPath] = useState(() => window.location.pathname)
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [lastAdded, setLastAdded] = useState(null)
  const feedbackTimer = useRef(null)

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.clearTimeout(feedbackTimer.current)
    }
  }, [])

  function navigate(nextPath) {
    if (nextPath === path) return window.scrollTo({ top: 0, behavior: 'smooth' })
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  function addToCart(product) {
    setCart((items) => {
      const previous = items.find((item) => item.id === product.id)
      return previous
        ? items.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...items, { ...product, quantity: 1 }]
    })
    setLastAdded(product)
    window.clearTimeout(feedbackTimer.current)
    feedbackTimer.current = window.setTimeout(() => setLastAdded(null), 3000)
  }

  function updateQuantity(id, amount) {
    setCart((items) => items.flatMap((item) => {
      if (item.id !== id) return [item]
      const quantity = item.quantity + amount
      return quantity > 0 ? [{ ...item, quantity }] : []
    }))
  }

  const Page = routes[path] ?? HomePage
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  if (path === '/admin') return <Suspense fallback={<main className="admin-login"><p>Cargando administración…</p></main>}><AdminPage navigate={navigate} /></Suspense>
  return (
    <div className="site-shell">
      <SiteHeader path={path} itemCount={itemCount} navigate={navigate} openRequest={() => setCartOpen(true)} />
      <main>
        <Page navigate={navigate} addToCart={addToCart} cart={cart} itemCount={itemCount} openRequest={() => setCartOpen(true)} />
      </main>
      <SiteFooter navigate={navigate} />
      <RequestDrawer cart={cart} updateQuantity={updateQuantity} isOpen={cartOpen} onClose={() => setCartOpen(false)} navigate={navigate} />
      {lastAdded && <div className="request-feedback" role="status" aria-live="polite">
        <CheckCircle size={18} weight="fill" />
        <span><strong>Añadido a la solicitud</strong>{lastAdded.title}</span>
      </div>}
    </div>
  )
}

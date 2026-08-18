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

const pageMetadata = {
  '/': {
    title: 'Victiker | Taller móvil para motos y embarcaciones',
    description: 'Reparación, mantenimiento, diagnosis y repuestos para motos y embarcaciones.',
  },
  '/servicios': {
    title: 'Servicios para motos y embarcaciones | Victiker',
    description: 'Reparación, mantenimiento y diagnosis profesional para motos y embarcaciones.',
  },
  '/taller-movil': {
    title: 'Taller móvil con cita previa | Victiker',
    description: 'Servicio técnico móvil para motos y embarcaciones, donde lo necesitas y con cita previa.',
  },
  '/catalogo': {
    title: 'Catálogo de repuestos | Victiker',
    description: 'Consulta repuestos para motos y embarcaciones y envía tu solicitud a Victiker.',
  },
  '/contacto': {
    title: 'Contacto y citas | Victiker',
    description: 'Contacta con Victiker para solicitar asistencia, mantenimiento o repuestos.',
  },
  '/admin': {
    title: 'Administración | Victiker',
    description: 'Área privada de administración de Victiker.',
    noindex: true,
  },
}

function setMeta(name, content, property = false) {
  const attribute = property ? 'property' : 'name'
  let element = document.head.querySelector(`meta[${attribute}="${name}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, name)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
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

  useEffect(() => {
    const metadata = pageMetadata[path] ?? pageMetadata['/']
    const canonicalUrl = `https://victiker.com${path === '/' ? '/' : path}`
    document.title = metadata.title
    setMeta('description', metadata.description)
    setMeta('og:title', metadata.title, true)
    setMeta('og:description', metadata.description, true)
    setMeta('og:url', canonicalUrl, true)
    setMeta('twitter:title', metadata.title)
    setMeta('twitter:description', metadata.description)
    setMeta('robots', metadata.noindex ? 'noindex,nofollow' : 'index,follow')

    const canonical = document.head.querySelector('link[rel="canonical"]')
    canonical?.setAttribute('href', canonicalUrl)
  }, [path])

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

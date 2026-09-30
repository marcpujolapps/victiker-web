import { CheckCircle } from '@phosphor-icons/react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { RequestDrawer } from './components/RequestDrawer'
import { SiteFooter } from './components/SiteFooter'
import { SiteHeader } from './components/SiteHeader'
import { WhatsAppLink } from './components/WhatsAppLink'
import { CatalogPage } from './pages/CatalogPage'
import { ContactPage } from './pages/ContactPage'
import { HomePage } from './pages/HomePage'
import { ServicesPage } from './pages/ServicesPage'
import { WorkshopPage } from './pages/WorkshopPage'
import { ProductPage } from './pages/ProductPage'
import { CookieNotice, LegalPage } from './pages/LegalPage'
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })))

const routes = {
  '/': HomePage,
  '/servicios': ServicesPage,
  '/taller-movil': WorkshopPage,
  '/catalogo': CatalogPage,
  '/contacto': ContactPage,
  '/admin': AdminPage,
  '/aviso-legal': LegalPage, '/privacidad': LegalPage, '/cookies': LegalPage, '/condiciones-de-compra': LegalPage,
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
  '/aviso-legal': { title: 'Aviso legal | Victiker', description: 'Información legal y datos del titular de Victiker.' },
  '/privacidad': { title: 'Política de privacidad | Victiker', description: 'Información sobre el tratamiento de datos personales en Victiker.' },
  '/cookies': { title: 'Política de cookies | Victiker', description: 'Información sobre cookies y almacenamiento técnico de Victiker.' },
  '/condiciones-de-compra': { title: 'Condiciones de compra | Victiker', description: 'Cómo se tramitan las solicitudes y compras de repuestos en Victiker.' },
}

const socialImage = 'https://victiker.com/assets/victiker-hero.png'

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
  const [path, setPath] = useState(() => `${window.location.pathname}${window.location.search}`)
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [lastAdded, setLastAdded] = useState(null)
  const feedbackTimer = useRef(null)

  useEffect(() => {
    const onPopState = () => setPath(`${window.location.pathname}${window.location.search}`)
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.clearTimeout(feedbackTimer.current)
    }
  }, [])

  useEffect(() => {
    const pathname = path.split('?')[0]
    const metadata = pageMetadata[pathname] ?? pageMetadata[pathname.startsWith('/admin/') ? '/admin' : pathname.startsWith('/repuestos/') ? '/catalogo' : '/']
    const canonicalUrl = `https://victiker.com${pathname === '/' ? '/' : pathname}`
    document.title = metadata.title
    setMeta('description', metadata.description)
    setMeta('og:title', metadata.title, true)
    setMeta('og:description', metadata.description, true)
    setMeta('og:url', canonicalUrl, true)
    setMeta('og:image', socialImage, true)
    setMeta('og:image:secure_url', socialImage, true)
    setMeta('twitter:title', metadata.title)
    setMeta('twitter:description', metadata.description)
    setMeta('twitter:image', socialImage)
    setMeta('robots', metadata.noindex ? 'noindex,nofollow' : 'index,follow')

    const canonical = document.head.querySelector('link[rel="canonical"]')
    canonical?.setAttribute('href', canonicalUrl)
  }, [path])

  function navigate(nextPath) {
    if (nextPath === path) return window.scrollTo({ top: 0, behavior: 'smooth' })
    window.history.pushState({}, '', nextPath)
    setPath(`${window.location.pathname}${window.location.search}`)
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

  const pathname = path.split('?')[0]
  const productMatch = pathname.match(/^\/producto\/(.+)$/)
  const Page = routes[pathname] ?? (pathname.startsWith('/repuestos/') ? CatalogPage : HomePage)
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  if (pathname === '/admin' || pathname.startsWith('/admin/producto/')) return <Suspense fallback={<main className="admin-login"><p>Cargando administración…</p></main>}><AdminPage navigate={navigate} path={pathname} /></Suspense>
  return (
    <div className="site-shell">
      <SiteHeader path={pathname} itemCount={itemCount} navigate={navigate} openRequest={() => setCartOpen(true)} />
      <main>
        {productMatch ? <ProductPage key={path} id={decodeURIComponent(productMatch[1])} navigate={navigate} addToCart={addToCart} cart={cart} openRequest={() => setCartOpen(true)} /> : <Page key={path} path={pathname} navigate={navigate} addToCart={addToCart} cart={cart} itemCount={itemCount} openRequest={() => setCartOpen(true)} />}
      </main>
      <SiteFooter navigate={navigate} />
      <WhatsAppLink floating raised={pathname.startsWith('/catalogo') && itemCount > 0} />
      <RequestDrawer cart={cart} updateQuantity={updateQuantity} isOpen={cartOpen} onClose={() => setCartOpen(false)} navigate={navigate} />
      {!cartOpen && <CookieNotice />}
      {lastAdded && <div className="request-feedback" role="status" aria-live="polite">
        <CheckCircle size={18} weight="fill" />
        <span><strong>Añadido a la solicitud</strong>{lastAdded.title}</span>
      </div>}
    </div>
  )
}

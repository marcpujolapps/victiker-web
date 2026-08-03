import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Boat,
  CalendarBlank,
  CaretDown,
  CheckCircle,
  Engine,
  List,
  MagnifyingGlass,
  MapPin,
  Minus,
  Motorcycle,
  Phone,
  Plus,
  ShoppingBag,
  Sparkle,
  Wrench,
  WhatsappLogo,
  X,
} from '@phosphor-icons/react'
import { catalog } from './data/catalog'
import { SectionTitle } from './components/SectionTitle'

const services = [
  { icon: Wrench, name: 'Reparación', copy: 'Intervenciones precisas para que vuelvas a rodar o navegar con tranquilidad.' },
  { icon: Engine, name: 'Mantenimiento', copy: 'Revisiones preventivas para conservar el rendimiento y anticipar averías.' },
  { icon: Sparkle, name: 'Electricidad', copy: 'Instalaciones, fallos electrónicos y componentes eléctricos bajo control.' },
  { icon: MagnifyingGlass, name: 'Diagnosis', copy: 'Tecnología de diagnosis para localizar el origen de cada incidencia.' },
]

const steps = [
  ['01', 'Cuéntanos qué ocurre', 'Indícanos el vehículo, la zona y la necesidad.'],
  ['02', 'Coordinamos la cita', 'Acordamos el mejor momento para atenderte.'],
  ['03', 'Vamos hasta ti', 'Llevamos herramientas y experiencia donde haga falta.'],
]

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export function App() {
  const heroRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [category, setCategory] = useState('moto')
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [requestSent, setRequestSent] = useState(false)

  const products = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return catalog.filter((item) => item.category === category && [item.title, item.reference, item.tag].join(' ').toLowerCase().includes(normalized))
  }, [category, query])

  const countFor = (id) => cart.find((item) => item.id === id)?.quantity ?? 0
  const itemCount = cart.reduce((total, item) => total + item.quantity, 0)

  useEffect(() => {
    const hero = heroRef.current
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!hero || reducedMotion.matches) return undefined

    let frame = 0
    const canTrackCursor = window.matchMedia('(pointer: fine)').matches
    let pointerX = null
    let pointerY = null
    const updateParallax = () => {
      const { top, left, width, height } = hero.getBoundingClientRect()
      const progress = Math.min(1, Math.max(0, -top / Math.max(height, 1)))
      const cursorX = pointerX === null ? 0 : Math.min(.5, Math.max(-.5, (pointerX - left) / width - .5))
      const cursorY = pointerY === null ? 0 : Math.min(.5, Math.max(-.5, (pointerY - top) / height - .5))
      hero.style.setProperty('--boat-parallax-x', `${Math.round(cursorX * 18)}px`)
      hero.style.setProperty('--boat-parallax-y', `${Math.round(progress * -12 + cursorY * 12)}px`)
      hero.style.setProperty('--technician-parallax-x', `${Math.round(cursorX * 42)}px`)
      hero.style.setProperty('--technician-parallax-y', `${Math.round(progress * -26 + cursorY * 28)}px`)
      hero.style.setProperty('--motorcycle-parallax-x', `${Math.round(cursorX * 72)}px`)
      hero.style.setProperty('--motorcycle-parallax-y', `${Math.round(progress * -48 + cursorY * 48)}px`)
      frame = 0
    }
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateParallax)
    }
    const trackPointer = (event) => {
      pointerX = event.clientX
      pointerY = event.clientY
      requestUpdate()
    }
    const resetPointer = () => {
      pointerX = null
      pointerY = null
      requestUpdate()
    }

    updateParallax()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    if (canTrackCursor) {
      hero.addEventListener('pointermove', trackPointer)
      hero.addEventListener('pointerleave', resetPointer)
    }
    return () => {
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
      if (canTrackCursor) {
        hero.removeEventListener('pointermove', trackPointer)
        hero.removeEventListener('pointerleave', resetPointer)
      }
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  function addToCart(product) {
    setCart((current) => {
      const present = current.find((item) => item.id === product.id)
      return present
        ? current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { ...product, quantity: 1 }]
    })
  }

  function updateQuantity(id, change) {
    setCart((current) => current.flatMap((item) => {
      if (item.id !== id) return [item]
      const quantity = item.quantity + change
      return quantity > 0 ? [{ ...item, quantity }] : []
    }))
  }

  function handleRequest(event) {
    event.preventDefault()
    setRequestSent(true)
    setCart([])
  }

  function goTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <button className="brand" onClick={() => goTo('inicio')} aria-label="Ir al inicio de Victiker">
          <span className="brand-lockup" aria-hidden="true">
            <img className="brand-mark" src="/assets/victiker-emblem-v2.webp" alt="" />
            <img className="brand-wordmark" src="/assets/victiker-wordmark-v2.webp" alt="" />
          </span>
        </button>
        <nav className={menuOpen ? 'site-nav site-nav--open' : 'site-nav'} aria-label="Navegación principal">
          <button onClick={() => goTo('servicios')}>Servicios</button>
          <button onClick={() => goTo('movil')}>Taller móvil</button>
          <button onClick={() => goTo('repuestos')}>Repuestos</button>
          <button onClick={() => goTo('contacto')}>Contacto</button>
        </nav>
        <div className="header-actions">
          <button className="cart-button" onClick={() => setCartOpen(true)} aria-label={`Abrir solicitud: ${itemCount} productos`}>
            <ShoppingBag size={22} weight="regular" />
            {itemCount > 0 && <span>{itemCount}</span>}
          </button>
          <button className="button button--small" onClick={() => goTo('contacto')}>Pedir cita</button>
          <button className="menu-button" onClick={() => setMenuOpen((value) => !value)} aria-label="Abrir menú">
            {menuOpen ? <X size={25} /> : <List size={27} />}
          </button>
        </div>
      </header>

      <main>
        <section className="hero" id="inicio" ref={heroRef}>
          <div className="hero-layers" aria-hidden="true">
            <img className="hero-layer hero-layer--background" src="/assets/hero-layers/hero-background-v2.webp" alt="" />
            <div className="hero-layer-stage hero-layer-stage--boat"><img src="/assets/hero-layers/hero-boat-cutout-v3.webp" alt="" /></div>
            <div className="hero-layer-stage hero-layer-stage--technician"><img src="/assets/hero-layers/hero-technician-cutout-v3.webp" alt="" /></div>
            <div className="hero-layer-stage hero-layer-stage--motorcycle"><img src="/assets/hero-layers/hero-motorcycle-cutout-v3.webp" alt="" /></div>
          </div>
          <img className="hero-brand" src="/assets/victiker-emblem-v2.webp" alt="Victiker" />
          <div className="hero-content reveal">
            <p className="hero-mark">Taller móvil · motos y embarcaciones</p>
            <h1>Tu taller,<br />donde lo <em>necesitas.</em></h1>
            <p className="hero-copy">Reparación, mantenimiento y diagnosis para motos y embarcaciones.</p>
            <div className="hero-actions">
              <button className="button" onClick={() => goTo('contacto')}>Pedir cita <ArrowRight size={19} /></button>
              <button className="button button--ghost" onClick={() => goTo('repuestos')}>Ver repuestos</button>
            </div>
          </div>
          <div className="hero-scroll"><span></span> Explora Victiker</div>
        </section>

        <section className="choice-section" aria-label="Elige tu servicio">
          <button className="choice-card choice-card--moto" onClick={() => { setCategory('moto'); goTo('repuestos') }}>
            <span className="choice-icon"><Motorcycle size={30} weight="thin" /></span>
            <strong>Moto</strong>
            <small>Diagnosis, mantenimiento y reparación con atención donde estés.</small>
            <ArrowRight size={25} />
          </button>
          <button className="choice-card choice-card--boat" onClick={() => { setCategory('nautica'); goTo('repuestos') }}>
            <span className="choice-icon"><Boat size={30} weight="thin" /></span>
            <strong>Embarcación</strong>
            <small>Motor, electricidad y puesta a punto para disfrutar sin imprevistos.</small>
            <ArrowRight size={25} />
          </button>
        </section>

        <section className="services-section" id="servicios">
          <SectionTitle eyebrow="Especialistas en movimiento" title="Tecnología, precisión y respuesta." copy="Un servicio técnico cercano para resolver lo que tu moto o embarcación necesita, con las herramientas adecuadas." />
          <div className="services-list">
            {services.map(({ icon: Icon, name, copy }) => (
              <article className="service-row" key={name}>
                <Icon size={33} weight="thin" />
                <h3>{name}</h3>
                <p>{copy}</p>
                <ArrowRight size={24} />
              </article>
            ))}
          </div>
        </section>

        <section className="mobile-section" id="movil">
          <div className="mobile-section__intro">
            <p className="section-eyebrow">Taller móvil</p>
            <h2>Nos movemos<br />para que tú no tengas que hacerlo.</h2>
          </div>
          <div className="steps">
            {steps.map(([number, title, copy]) => (
              <article key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="catalog-section" id="repuestos">
          <div className="catalog-heading">
            <SectionTitle eyebrow="Piezas y repuestos" title="Encuentra la pieza que necesitas." copy="Añade los productos a tu solicitud. Te confirmaremos compatibilidad, disponibilidad y presupuesto antes de cualquier compra." />
            <button className="button button--dark" onClick={() => setCartOpen(true)}>
              <ShoppingBag size={19} /> Mi solicitud {itemCount > 0 && `(${itemCount})`}
            </button>
          </div>
          <div className="catalog-controls">
            <div className="catalog-tabs" role="tablist" aria-label="Tipo de catálogo">
              <button className={category === 'moto' ? 'is-active' : ''} onClick={() => setCategory('moto')} role="tab" aria-selected={category === 'moto'}><Motorcycle size={20} /> Moto</button>
              <button className={category === 'nautica' ? 'is-active' : ''} onClick={() => setCategory('nautica')} role="tab" aria-selected={category === 'nautica'}><Boat size={20} /> Embarcación</button>
            </div>
            <label className="search-field">
              <MagnifyingGlass size={20} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, categoría o referencia" />
            </label>
          </div>
          <div className="product-grid">
            {products.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="product-visual"><span>{product.category === 'moto' ? 'M' : 'N'}</span></div>
                <div className="product-meta"><span>{product.reference}</span><span>{product.tag}</span></div>
                <h3>{product.title}</h3>
                <p>{product.description}</p>
                <div className="product-bottom">
                  <strong>{money.format(product.price)}</strong>
                  <button onClick={() => addToCart(product)} aria-label={`Añadir ${product.title} a la solicitud`}>
                    {countFor(product.id) ? <CheckCircle size={21} weight="fill" /> : <Plus size={21} />}
                    {countFor(product.id) ? 'Añadido' : 'Añadir'}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {products.length === 0 && <div className="empty-results">No encontramos resultados para esa búsqueda. Prueba con otra referencia o categoría.</div>}
        </section>

        <section className="contact-section" id="contacto">
          <div className="contact-copy">
            <p className="section-eyebrow">Pide tu cita</p>
            <h2>Hablemos de lo que necesitas.</h2>
            <p>Cuéntanos qué le ocurre a tu moto o embarcación. Coordinaremos la asistencia que mejor se adapte a ti.</p>
            <a className="contact-phone" href="tel:+34673551065"><Phone size={22} weight="thin" /> 673 551 065</a>
            <a className="contact-whatsapp" href="https://wa.me/34673551065" target="_blank" rel="noreferrer"><WhatsappLogo size={22} weight="thin" /> Escríbenos por WhatsApp</a>
            <p className="contact-note"><MapPin size={18} weight="thin" /> Servicio móvil con cita previa</p>
          </div>
          <form className="contact-form" onSubmit={(event) => { event.preventDefault(); event.currentTarget.reset(); alert('Gracias. Hemos recibido tu consulta y te responderemos lo antes posible.') }}>
            <label>Nombre<input required placeholder="Tu nombre" /></label>
            <label>Teléfono<input required type="tel" placeholder="Tu teléfono" /></label>
            <label>¿Qué necesitas?<span className="select-wrap"><select defaultValue=""><option value="" disabled>Selecciona una opción</option><option>Asistencia para moto</option><option>Asistencia para embarcación</option><option>Consulta sobre repuestos</option></select><CaretDown size={17} /></span></label>
            <label>Cuéntanos un poco más<textarea placeholder="Modelo, incidencia o referencia de pieza…" rows="4" /></label>
            <button className="button" type="submit">Enviar consulta <ArrowRight size={19} /></button>
          </form>
        </section>
      </main>

      <footer className="site-footer">
        <img src="/assets/victiker-logo.png" alt="Victiker" />
        <p>Taller móvil de motos y embarcaciones.</p>
        <div className="footer-socials">
          <a href="https://www.instagram.com/victiker/" target="_blank" rel="noreferrer">Instagram</a>
          <a href="https://wa.me/34673551065" target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
      </footer>

      {cartOpen && (
        <div className="drawer-backdrop" onMouseDown={() => setCartOpen(false)}>
          <aside className="request-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="Tu solicitud de repuestos">
            <div className="drawer-header"><div><p>Solicitud de repuestos</p><h2>Tu selección</h2></div><button onClick={() => setCartOpen(false)} aria-label="Cerrar"><X size={24} /></button></div>
            {requestSent ? (
              <div className="success-state"><CheckCircle size={46} weight="fill" /><h3>Solicitud preparada</h3><p>Hemos registrado tu petición de prueba. En la siguiente fase, este resumen se enviará directamente a Victiker.</p><button className="button button--dark" onClick={() => { setRequestSent(false); setCartOpen(false) }}>Cerrar</button></div>
            ) : cart.length === 0 ? (
              <div className="drawer-empty"><ShoppingBag size={42} weight="thin" /><h3>Tu solicitud está vacía</h3><p>Explora el catálogo y añade las piezas que te interesan.</p><button className="button button--dark" onClick={() => setCartOpen(false)}>Ver catálogo</button></div>
            ) : (
              <form onSubmit={handleRequest} className="request-form">
                <div className="drawer-items">
                  {cart.map((item) => <div className="drawer-item" key={item.id}><div><span>{item.reference}</span><h3>{item.title}</h3><strong>{money.format(item.price)}</strong></div><div className="quantity"><button type="button" onClick={() => updateQuantity(item.id, -1)} aria-label="Restar unidad"><Minus size={15} /></button><span>{item.quantity}</span><button type="button" onClick={() => updateQuantity(item.id, 1)} aria-label="Sumar unidad"><Plus size={15} /></button></div></div>)}
                </div>
                <div className="request-fields"><label>Nombre<input required placeholder="Tu nombre" /></label><label>Teléfono<input required type="tel" placeholder="Tu teléfono" /></label><label>Vehículo o embarcación<input placeholder="Marca, modelo y año" /></label><label>Notas<textarea rows="3" placeholder="Añade cualquier detalle útil" /></label></div>
                <button className="button" type="submit">Enviar solicitud <ArrowRight size={19} /></button>
                <p className="drawer-privacy">Sin pago online. Revisaremos tu solicitud antes de confirmar disponibilidad y presupuesto.</p>
              </form>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

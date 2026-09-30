import { ArrowRight, Engine, ImageSquare, MagnifyingGlass, ShieldCheck, Sparkle, Truck, Wrench } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { consultWorkshopAi } from '../lib/workshopAi'

const services = [[Wrench, 'Reparación', 'Intervenciones precisas para volver a rodar o navegar con tranquilidad.'], [Engine, 'Mantenimiento', 'Revisiones preventivas para conservar el rendimiento.'], [Sparkle, 'Electricidad', 'Instalaciones, fallos electrónicos y componentes eléctricos bajo control.'], [MagnifyingGlass, 'Diagnosis', 'Tecnología para localizar el origen de cada incidencia.']]
const loadingMessages = ['Ordenando los detalles de tu consulta', 'Buscando productos que puedan ayudarte', 'Preparando los próximos pasos con Víctor']
const consultationExamples = [
  'Mi moto hace ruido al frenar…',
  'El motor del barco pierde fuerza…',
  'La moto no arranca en frío…',
  'Quiero preparar la moto para un viaje…',
]
const priceFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export function HomePage({ navigate }) {
  const heroRef = useRef(null)
  const [issue, setIssue] = useState('')
  const [consultation, setConsultation] = useState(null)
  const [consulting, setConsulting] = useState(false)
  const [consultError, setConsultError] = useState('')
  const [loadingStep, setLoadingStep] = useState(0)
  const [exampleStep, setExampleStep] = useState(0)
  const [issueFocused, setIssueFocused] = useState(false)

  useEffect(() => {
    if (issue || issueFocused || consulting || consultation || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const timer = window.setInterval(() => setExampleStep((step) => (step + 1) % consultationExamples.length), 4500)
    return () => window.clearInterval(timer)
  }, [issue, issueFocused, consulting, consultation])

  useEffect(() => {
    if (!consulting) return undefined
    setLoadingStep(0)
    const timer = window.setInterval(() => setLoadingStep((step) => (step + 1) % loadingMessages.length), 2600)
    return () => window.clearInterval(timer)
  }, [consulting])

  async function submitConsultation(event) {
    event.preventDefault()
    if (consulting || issue.trim().length < 12) return
    setConsulting(true)
    setConsultError('')
    setConsultation(null)
    try { setConsultation(await consultWorkshopAi(issue.trim())) }
    catch { setConsultError('No hemos podido analizar tu consulta ahora mismo. Inténtalo de nuevo o habla directamente con Víctor.') }
    finally { setConsulting(false) }
  }

  function contactVictor() {
    const orientation = consultation?.orientation
    window.sessionStorage.setItem('victiker-consultation-draft', JSON.stringify({ issue: issue.trim(), summary: orientation?.assessment || '', service: orientation?.service || '' }))
    navigate('/contacto')
  }

  function openRelatedProducts() {
    if (!consultation?.catalogQuery) return
    const vehicle = ['moto', 'barco'].includes(consultation.catalogVehicleType) ? consultation.catalogVehicleType : 'all'
    navigate(`/catalogo?tipo=${vehicle}&buscar=${encodeURIComponent(consultation.catalogQuery)}`)
  }

  useEffect(() => {
    const hero = heroRef.current
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const finePointer = window.matchMedia('(pointer: fine)')
    if (!hero || reducedMotion.matches || !finePointer.matches) return undefined

    let frame = 0
    let pointerX = null
    let pointerY = null

    const updateParallax = () => {
      const { left, top, width, height } = hero.getBoundingClientRect()
      const cursorX = pointerX === null ? 0 : Math.min(.5, Math.max(-.5, (pointerX - left) / width - .5))
      const cursorY = pointerY === null ? 0 : Math.min(.5, Math.max(-.5, (pointerY - top) / height - .5))

      hero.style.setProperty('--boat-parallax-x', `${Math.round(cursorX * 18)}px`)
      hero.style.setProperty('--boat-parallax-y', `${Math.round(cursorY * 12)}px`)
      hero.style.setProperty('--technician-parallax-x', `${Math.round(cursorX * 42)}px`)
      hero.style.setProperty('--technician-parallax-y', `${Math.round(cursorY * 28)}px`)
      hero.style.setProperty('--motorcycle-parallax-x', `${Math.round(cursorX * 72)}px`)
      hero.style.setProperty('--motorcycle-parallax-y', `${Math.round(cursorY * 48)}px`)
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

    hero.addEventListener('pointermove', trackPointer)
    hero.addEventListener('pointerleave', resetPointer)
    return () => {
      hero.removeEventListener('pointermove', trackPointer)
      hero.removeEventListener('pointerleave', resetPointer)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    const images = [...document.querySelectorAll('.home-parallax-image')]
    if (!images.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    let frame = 0
    const updateImages = () => {
      const viewportMiddle = window.innerHeight / 2
      images.forEach((image) => {
        const { top, height } = image.getBoundingClientRect()
        if (top > window.innerHeight || top + height < 0) return
        const distance = viewportMiddle - (top + height / 2)
        const maxOffset = height * 0.055
        const offset = Math.max(-maxOffset, Math.min(maxOffset, distance * 0.11))
        image.style.setProperty('--home-parallax-y', `${offset.toFixed(1)}px`)
      })
      frame = 0
    }
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateImages)
    }

    scheduleUpdate()
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    return () => {
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return <>
    <section className={`hero hero--consult${consulting || consultation ? ' hero--active' : ''}`} ref={heroRef}>
      <div className="hero-layers" aria-hidden="true"><img className="hero-layer hero-layer--background" src="/assets/hero-layers/hero-background-v2.webp" alt="" /><div className="hero-layer-stage hero-layer-stage--boat"><img src="/assets/hero-layers/hero-boat-cutout-v3.webp" alt="" /></div><div className="hero-layer-stage hero-layer-stage--technician"><img src="/assets/hero-layers/hero-technician-cutout-v3.webp" alt="" /></div><div className="hero-layer-stage hero-layer-stage--motorcycle"><img src="/assets/hero-layers/hero-motorcycle-cutout-v3.webp" alt="" /></div></div>
      <img className="hero-brand-mobile" src="/assets/victiker-logo-2.png" alt="Victiker: taller especializado, piezas, reparación de motos y motores de barco" />
      <div className="hero-content">
        <h1>El taller de Víctor,<br /><em>donde lo necesitas.</em></h1>
        <p>Reparación, mantenimiento y diagnosis para motos y embarcaciones.</p>
        <div className="hero-consult" aria-label="Consulta de orientación Victiker">
          {consulting ? <div className="hero-consult__loading" role="status" aria-live="polite">
            <div className="hero-consult__pulse" aria-hidden="true"><span /><span /><span /></div>
            <div className="hero-consult__loading-copy"><strong>Estamos con tu consulta</strong><p key={loadingStep}>{loadingMessages[loadingStep]}</p></div>
            <div className="hero-consult__progress" aria-hidden="true"><span /></div>
            <small>“{issue.trim().slice(0, 105)}{issue.trim().length > 105 ? '…' : ''}”</small>
          </div> : consultation ? <div className="hero-consult__result" aria-live="polite">
            <h2>{consultation.orientation.headline}</h2>
            <p>{consultation.orientation.assessment}</p>
            {consultation.orientation.priority === 'no_usar' && <p className="hero-consult__alert">Por seguridad, evita seguir usándolo hasta recibir una valoración profesional.</p>}
            <p className="hero-consult__next">{consultation.orientation.nextStep}</p>
            {consultation.showParts !== false && consultation.suggestions?.length > 0 && <div className="hero-consult__parts">
              <p>{consultation.orientation.suggestionPurpose === 'safety_equipment' ? 'Opciones para hacerte visible. Consulta tallas y disponibilidad.' : 'Referencias relacionadas. Víctor confirmará la compatibilidad.'}</p>
              <div className="hero-consult__products">{consultation.suggestions.map((product) => <button className="hero-consult__product" key={product.id} type="button" onClick={() => navigate(`/producto/${encodeURIComponent(product.id)}`)}>
                <span className="hero-consult__product-visual"><ImageSquare size={24} aria-hidden="true" />{product.imageUrl && <img src={product.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} />}</span>
                <span className="hero-consult__product-copy"><strong>{product.description}</strong><small>{product.reference}{product.stockLevel && ` · ${product.stockLevel === 'InStock' ? 'Disponible' : product.stockLevel === 'Short' ? 'Pocas unidades' : 'Sin stock'}`}</small>{Number(product.price) > 0 && <b>{priceFormatter.format(Number(product.price))}</b>}</span>
              </button>)}</div>
              {consultation.catalogQuery && <button className="hero-consult__more" type="button" onClick={openRelatedProducts}>Ver más productos <ArrowRight size={16} /></button>}
            </div>}
            <div className="hero-consult__actions"><button className="button hero-consult__contact-button" type="button" onClick={contactVictor}>Hablar con Víctor <ArrowRight size={18} /></button><button className="hero-consult__text-button" type="button" onClick={() => { setConsultation(null); setConsultError('') }}>Hacer otra consulta</button></div>
          </div> : <form onSubmit={submitConsultation}>
            <p className="hero-consult__intro"><strong>¿Qué le ocurre a tu moto o embarcación?</strong><span className="hero-consult__intro-desktop">Cuéntanos el problema y te orientamos con IA.</span></p>
            <div className="hero-consult__composer">
              <span className="hero-consult__intro-mobile"><Sparkle size={15} aria-hidden="true" /> Orientación con IA</span>
              <label className="sr-only" htmlFor="hero-issue">Describe qué le ocurre a tu moto o embarcación</label>
              <textarea id="hero-issue" value={issue} onChange={(event) => setIssue(event.target.value)} onFocus={() => setIssueFocused(true)} onBlur={() => setIssueFocused(false)} maxLength={700} rows={3} placeholder={consultationExamples[exampleStep]} />
              <div className="hero-consult__submit"><span>Incluye el modelo y desde cuándo ocurre.</span><button className="button" type="submit" disabled={issue.trim().length < 12}>Analizar mi caso <ArrowRight size={18} /></button></div>
            </div>
            {consultError && <p className="hero-consult__error" role="alert">{consultError}</p>}
          </form>}
        </div>
        {!consultation && !consulting && <button className="hero-consult__direct" type="button" onClick={() => navigate('/contacto')}>Prefiero hablar directamente con Víctor <ArrowRight size={16} /></button>}
      </div>
    </section>
    <section className="home-workshop" aria-labelledby="home-workshop-title">
      <div className="home-workshop__copy">
        <p className="section-eyebrow">Taller móvil Victiker</p>
        <h2 id="home-workshop-title">El taller va<br />hasta donde estés.</h2>
        <p>Reparación, mantenimiento y diagnosis para motos y embarcaciones, con atención directa de Víctor.</p>
        <button className="button" onClick={() => navigate('/taller-movil')}>Descubrir el taller móvil <ArrowRight size={19} /></button>
      </div>
      <img className="home-workshop__image home-parallax-image" src="/assets/home-workshop.jpg" alt="Víctor trabaja junto a una moto con el taller móvil abierto" loading="lazy" />
    </section>
    <section className="choice-section" aria-label="Explora repuestos por vehículo">
      <button className="choice-card" type="button" onClick={() => navigate('/repuestos/moto')} aria-label="Ver repuestos para moto">
        <img className="home-parallax-image" src="/assets/home-moto.jpg" alt="" loading="lazy" />
        <span className="choice-card__shade" aria-hidden="true" />
        <span className="choice-card__content"><span className="choice-card__eyebrow">Piezas y accesorios</span><span className="choice-card__title">Moto</span><span className="choice-card__action">Ver catálogo <ArrowRight size={19} /></span></span>
      </button>
      <button className="choice-card choice-card--boat" type="button" onClick={() => navigate('/repuestos/barco')} aria-label="Ver repuestos para embarcación">
        <img className="home-parallax-image" src="/assets/home-boat.jpg" alt="" loading="lazy" />
        <span className="choice-card__shade" aria-hidden="true" />
        <span className="choice-card__content"><span className="choice-card__eyebrow">Motor y equipamiento</span><span className="choice-card__title">Embarcación</span><span className="choice-card__action">Ver catálogo <ArrowRight size={19} /></span></span>
      </button>
    </section>
    <section className="home-trust" aria-label="Lo que ofrece Victiker">
      <article><Wrench size={28} weight="regular" aria-hidden="true" /><h3>Reparación y mantenimiento</h3><p>Cuidados para motos y motores marinos.</p></article>
      <article><Truck size={28} weight="regular" aria-hidden="true" /><h3>Taller móvil</h3><p>Atención en el lugar acordado contigo.</p></article>
      <article><MagnifyingGlass size={28} weight="regular" aria-hidden="true" /><h3>Diagnosis precisa</h3><p>Buscamos el origen antes de intervenir.</p></article>
      <article><ShieldCheck size={28} weight="regular" aria-hidden="true" /><h3>Trato directo</h3><p>Hablas con Víctor en cada paso.</p></article>
    </section>
    <section className="home-closing" aria-labelledby="home-closing-title">
      <img src="/assets/home-closing.jpg" alt="Una moto recorre una carretera junto al Mediterráneo" loading="lazy" />
      <div className="home-closing__content"><h2 id="home-closing-title">Más kilómetros.<br />Más historias.</h2><p>Nosotros cuidamos de tu moto o embarcación. Tú eliges el destino.</p><button className="button" onClick={() => navigate('/contacto')}>Hablemos <ArrowRight size={19} /></button></div>
    </section>
  </>
}

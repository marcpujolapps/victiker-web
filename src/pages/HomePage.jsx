import { ArrowRight, Boat, Engine, MagnifyingGlass, Motorcycle, Sparkle, Wrench } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'

const services = [[Wrench, 'Reparación', 'Intervenciones precisas para volver a rodar o navegar con tranquilidad.'], [Engine, 'Mantenimiento', 'Revisiones preventivas para conservar el rendimiento.'], [Sparkle, 'Electricidad', 'Instalaciones, fallos electrónicos y componentes eléctricos bajo control.'], [MagnifyingGlass, 'Diagnosis', 'Tecnología para localizar el origen de cada incidencia.']]

export function HomePage({ navigate }) {
  const heroRef = useRef(null)

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

  return <>
    <section className="hero" ref={heroRef}>
      <div className="hero-layers" aria-hidden="true"><img className="hero-layer hero-layer--background" src="/assets/hero-layers/hero-background-v2.webp" alt="" /><div className="hero-layer-stage hero-layer-stage--boat"><img src="/assets/hero-layers/hero-boat-cutout-v3.webp" alt="" /></div><div className="hero-layer-stage hero-layer-stage--technician"><img src="/assets/hero-layers/hero-technician-cutout-v3.webp" alt="" /></div><div className="hero-layer-stage hero-layer-stage--motorcycle"><img src="/assets/hero-layers/hero-motorcycle-cutout-v3.webp" alt="" /></div></div>
      <img className="hero-brand" src="/assets/victiker-emblem-v2.webp" alt="Victiker" />
      <img className="hero-brand-mobile" src="/assets/victiker-logo.png" alt="Victiker: taller especializado, piezas, reparación de motos y motores de barco" />
      <div className="hero-content"><h1>Tu taller,<br />donde lo <em>necesitas.</em></h1><p>Reparación, mantenimiento y diagnosis para motos y embarcaciones.</p><div className="hero-actions"><button className="button" onClick={() => navigate('/contacto')}>Pedir cita <ArrowRight size={19} /></button><button className="button button--ghost" onClick={() => navigate('/catalogo')}>Ver repuestos</button></div></div>
    </section>
    <section className="choice-section" aria-label="Elige tu servicio"><button className="choice-card" onClick={() => navigate('/catalogo?tipo=moto')}><Motorcycle size={33} weight="thin" /><strong>Moto</strong><small>Diagnosis, mantenimiento y reparación con atención donde estés.</small><ArrowRight size={25} /></button><button className="choice-card choice-card--boat" onClick={() => navigate('/catalogo?tipo=nautica')}><Boat size={33} weight="thin" /><strong>Embarcación</strong><small>Motor, electricidad y puesta a punto para disfrutar sin imprevistos.</small><ArrowRight size={25} /></button></section>
    <section className="preview-section"><div><p className="section-eyebrow">Servicios Victiker</p><h2>El cuidado técnico<br />que te sigue el ritmo.</h2></div><div className="service-preview">{services.map(([Icon, title, copy]) => <article key={title}><Icon size={28} weight="thin" /><h3>{title}</h3><p>{copy}</p></article>)}</div><button className="text-link" onClick={() => navigate('/servicios')}>Conocer todos los servicios <ArrowRight size={19} /></button></section>
    <section className="mobile-banner"><div><p className="section-eyebrow">Taller móvil</p><h2>Nos movemos para que tú no tengas que hacerlo.</h2></div><button className="button button--ghost" onClick={() => navigate('/taller-movil')}>Cómo trabajamos <ArrowRight size={19} /></button></section>
  </>
}

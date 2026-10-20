import { ArrowRight, CaretLeft, CaretRight, Pause, Play } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { firebaseConfigured } from '../lib/firebase'
import { offerColors, safeOfferLink, watchOffers } from '../lib/offers'
import { SiteLink } from './SiteLink'
import './OfferBanner.css'

const ROTATION_MS = 6000

export function OfferBanner({ navigate }) {
  const [offers, setOffers] = useState([])
  useEffect(() => {
    if (!firebaseConfigured) return undefined
    return watchOffers((items, error) => setOffers(error ? [] : items))
  }, [])
  return <OfferCarousel offers={offers} navigate={navigate} />
}

export function OfferCarousel({ offers, navigate }) {
  const [selectedId, setSelectedId] = useState(null)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const selectedIndex = offers.findIndex((offer) => offer.id === selectedId)
  const index = selectedIndex < 0 ? 0 : selectedIndex
  const current = offers[index]
  const multiple = offers.length > 1
  const autoplay = multiple && !paused && !hovered && !focused && !hidden && !reducedMotion

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setReducedMotion(preference.matches)
    const updateVisibility = () => setHidden(document.hidden)
    updatePreference()
    updateVisibility()
    preference.addEventListener('change', updatePreference)
    document.addEventListener('visibilitychange', updateVisibility)
    return () => {
      preference.removeEventListener('change', updatePreference)
      document.removeEventListener('visibilitychange', updateVisibility)
    }
  }, [])

  useEffect(() => {
    if (!autoplay) return undefined
    const timer = window.setTimeout(() => setSelectedId(offers[(index + 1) % offers.length].id), ROTATION_MS)
    return () => window.clearTimeout(timer)
  }, [autoplay, offers, index])

  if (!current) return null
  const colors = offerColors(current)
  return <section className="offer-banner" style={{ '--offer-background': colors.backgroundColor, '--offer-text': colors.textColor }} aria-label="Ofertas de Victiker" aria-roledescription={multiple ? 'carrusel' : undefined}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
    <div className="offer-banner__inner">
      <div className="offer-banner__viewport" aria-live={autoplay ? 'off' : 'polite'} aria-atomic="true">
        {offers.map((offer, offerIndex) => {
          const href = safeOfferLink(offer.linkUrl)
          const visible = offerIndex === index
          const linkContent = <>{offer.linkLabel || 'Ver oferta'}<ArrowRight size={16} aria-hidden="true" /></>
          return <div key={offer.id} className={`offer-banner__slide${visible ? ' is-visible' : ''}`} role="group" aria-roledescription={multiple ? 'diapositiva' : undefined} aria-label={multiple ? `${offerIndex + 1} de ${offers.length}` : undefined} aria-hidden={!visible} inert={!visible}>
            {offer.imageUrl && <div className="offer-banner__image"><img src={offer.imageUrl} alt={offer.title} decoding="async" /></div>}
            <div className="offer-banner__copy">
              <h2>{offer.title}</h2>
              {offer.description && <p>{offer.description}</p>}
              {href && (href.startsWith('/') && !href.includes('#')
                ? <SiteLink className="offer-banner__link" href={href} navigate={navigate}>{linkContent}</SiteLink>
                : <a className="offer-banner__link" href={href}>{linkContent}</a>)}
            </div>
          </div>
        })}
      </div>
      {multiple && <div className="offer-banner__controls" aria-label="Controles de ofertas">
        <button type="button" onClick={() => setSelectedId(offers[(index - 1 + offers.length) % offers.length].id)} aria-label="Oferta anterior"><CaretLeft size={17} /></button>
        <span className="offer-banner__position" aria-hidden="true">{index + 1}<span> / {offers.length}</span></span>
        <button type="button" onClick={() => setSelectedId(offers[(index + 1) % offers.length].id)} aria-label="Oferta siguiente"><CaretRight size={17} /></button>
        <button type="button" className="offer-banner__pause" aria-label={paused || reducedMotion ? 'Reanudar ofertas' : 'Pausar ofertas'} onClick={() => { if (reducedMotion) setReducedMotion(false); setPaused((value) => !reducedMotion && !value) }}>
          {paused || reducedMotion ? <Play size={14} weight="fill" /> : <Pause size={14} weight="fill" />}
        </button>
      </div>}
    </div>
  </section>
}

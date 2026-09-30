import { ArrowRight, MapPin, Phone, WhatsappLogo } from '@phosphor-icons/react'
import { useState } from 'react'
import { createRequest } from '../lib/requests'
export function ContactPage() {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [draft] = useState(() => {
    try { return JSON.parse(window.sessionStorage.getItem('victiker-consultation-draft') || 'null') }
    catch { return null }
  })
  const draftNeed = draft?.service === 'barco' ? 'Asistencia para embarcación' : draft?.service === 'moto' ? 'Asistencia para moto' : draft?.service === 'repuestos' ? 'Consulta sobre repuestos' : ''
  const draftDetails = draft?.issue ? `${draft.issue}${draft.summary ? `\n\nOrientación inicial de la web: ${draft.summary}` : ''}` : ''
  async function submit(event) {
    event.preventDefault()
    const formElement = event.currentTarget
    setStatus('sending')
    setError('')
    const form = new FormData(formElement)
    try {
      await createRequest({ type: 'appointment', name: form.get('name'), phone: form.get('phone'), need: form.get('need'), details: form.get('details') })
      const response = await fetch('/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'appointment', name: form.get('name'), phone: form.get('phone'), need: form.get('need'), details: form.get('details') }) })
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'No se ha podido enviar la petición.')
      window.sessionStorage.removeItem('victiker-consultation-draft')
      formElement.reset()
      setStatus('sent')
    } catch (requestError) { setError(requestError.message); setStatus('idle') }
  }
  return <section className="contact-page"><div className="contact-copy"><p className="section-eyebrow">Contacto</p><h1>Hablemos de lo que necesitas.</h1><p>Cuéntanos qué le ocurre a tu moto o embarcación. Coordinaremos la asistencia que mejor se adapte a ti.</p><a href="tel:+34673551065"><Phone size={22} weight="thin" /> 673 551 065</a><a href="https://wa.me/34673551065" target="_blank" rel="noreferrer"><WhatsappLogo size={22} weight="thin" /> Escríbenos por WhatsApp</a><small><MapPin size={18} weight="thin" /> Servicio móvil con cita previa</small></div><form className="contact-form" onSubmit={submit}>{status === 'sent' ? <p className="form-success" role="status">Gracias. Hemos recibido tu petición de cita y te responderemos lo antes posible.</p> : <><label>Nombre<input required name="name" placeholder="Tu nombre" /></label><label>Teléfono<input required name="phone" type="tel" placeholder="Tu teléfono" /></label><label>¿Qué necesitas?<select required name="need" defaultValue={draftNeed}><option value="" disabled>Selecciona una opción</option><option>Asistencia para moto</option><option>Asistencia para embarcación</option><option>Consulta sobre repuestos</option></select></label><label>Cuéntanos un poco más<textarea name="details" placeholder="Modelo, incidencia o referencia de pieza…" rows="5" defaultValue={draftDetails} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button" type="submit" disabled={status === 'sending'}>{status === 'sending' ? 'Enviando…' : <>Enviar consulta <ArrowRight size={19} /></>}</button></>}</form></section>
}

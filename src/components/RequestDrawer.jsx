import { ArrowRight, CheckCircle, Minus, Plus, ShoppingBag, X } from '@phosphor-icons/react'
import { useState } from 'react'
import { createRequest } from '../lib/requests'
const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export function RequestDrawer({ cart, updateQuantity, isOpen, onClose, navigate }) {
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  if (!isOpen) return null
  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      await createRequest({ type: 'parts', name: form.get('name'), phone: form.get('phone'), vehicle: form.get('vehicle'), items: cart.map(({ id, reference, title, description, price, currency, brand, quantity }) => ({ id, reference, title, description: description || title, price: Number(price) || 0, currency: currency || 'EUR', brand: brand || '', quantity })) })
      const response = await fetch('/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'parts', name: form.get('name'), phone: form.get('phone'), vehicle: form.get('vehicle'), items: cart }) })
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'No s’ha pogut enviar la sol·licitud.')
      setSent(true)
    } catch (requestError) { setError(requestError.message) } finally { setSubmitting(false) }
  }
  function close() { setSent(false); setError(''); onClose() }
  return <div className="drawer-backdrop" onMouseDown={close}>
    <aside className="request-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="Tu solicitud de repuestos">
      <div className="drawer-header"><div><p>Solicitud de repuestos</p><h2>Tu selección</h2></div><button onClick={close} aria-label="Cerrar"><X size={24} /></button></div>
      {sent ? <div className="success-state"><CheckCircle size={46} weight="fill" /><h3>Solicitud preparada</h3><p>Te contactaremos para confirmar compatibilidad, disponibilidad y presupuesto.</p><button className="button button--dark" onClick={close}>Cerrar</button></div>
        : cart.length === 0 ? <div className="drawer-empty"><ShoppingBag size={42} weight="thin" /><h3>Tu solicitud está vacía</h3><p>Explora el catálogo y añade las piezas que te interesan.</p><button className="button button--dark" onClick={() => { onClose(); navigate('/catalogo') }}>Ver catálogo</button></div>
          : <form onSubmit={submit} className="request-form"><div className="drawer-items">{cart.map((item) => <div className="drawer-item" key={item.id}><div><span>{item.reference}</span><h3>{item.title}</h3><strong>{money.format(item.price)}</strong></div><div className="quantity"><button type="button" onClick={() => updateQuantity(item.id, -1)} aria-label="Restar unidad"><Minus size={15} /></button><b>{item.quantity}</b><button type="button" onClick={() => updateQuantity(item.id, 1)} aria-label="Sumar unidad"><Plus size={15} /></button></div></div>)}</div><div className="request-fields"><label>Nombre<input required name="name" placeholder="Tu nombre" /></label><label>Teléfono<input required name="phone" type="tel" placeholder="Tu teléfono" /></label><label>Vehículo o embarcación<input name="vehicle" placeholder="Marca, modelo y año" /></label></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button" type="submit" disabled={submitting}>{submitting ? 'Enviando…' : <>Enviar solicitud <ArrowRight size={19} /></>}</button><p className="drawer-privacy">Sin pago online. Revisaremos la solicitud antes de confirmar el pedido.</p></form>}
    </aside>
  </div>
}

import { ArrowDown, ArrowRight, ArrowUp, ImageSquare, PencilSimple, Plus, Trash, UploadSimple, X } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_OFFER_COLORS, offerColors, optimizeOfferImage, removeOffer, removeOfferImage, reorderOffers, saveOffer, setOfferActive, uploadOfferImage, validateOffer, validateOfferImage, watchOffers } from '../lib/offers'
import './OffersAdmin.css'

const emptyOffer = { title: '', description: '', imageUrl: '', imagePath: '', linkUrl: '', linkLabel: '', active: false, order: 0, ...DEFAULT_OFFER_COLORS }

export function OffersAdmin({ user, setMessage }) {
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [selected, setSelected] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState(false)
  const [revision, setRevision] = useState(0)
  const activeCount = offers.filter((offer) => offer.active).length

  useEffect(() => watchOffers((next, error) => {
    setLoading(false)
    setLoadError(error ? 'No se han podido cargar las ofertas. Comprueba la conexión y vuelve a entrar en esta sección.' : '')
    if (!error) setOffers(next)
  }, { admin: true }), [])

  function selectOffer(offer) {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return
    setActionError('')
    setSelected(offer)
    setDirty(false)
    setRevision((current) => current + 1)
  }

  async function save(value, imageFile, onProgress) {
    const order = value.id ? offers.find((offer) => offer.id === value.id)?.order ?? value.order : Math.min(9999, Math.max(-1, ...offers.map((offer) => offer.order || 0)) + 1)
    const validated = validateOffer({ ...value, order })
    setPending(true)
    setActionError('')
    let uploaded = null
    try {
      if (imageFile) {
        onProgress('Optimizando imagen…')
        const optimized = await optimizeOfferImage(imageFile)
        onProgress('Subiendo imagen…')
        uploaded = await uploadOfferImage(optimized, user.uid, (percent) => onProgress(`Subiendo imagen ${percent} %…`))
      }
      onProgress('Guardando oferta…')
      const saved = { ...validated, imageUrl: uploaded?.url ?? validated.imageUrl, imagePath: uploaded?.path ?? validated.imagePath }
      const id = await saveOffer(value.id || null, saved, user.uid)
      if (selected?.imagePath && selected.imagePath !== saved.imagePath) await removeOfferImage(selected.imagePath).catch(() => {})
      setSelected({ ...saved, id })
      setDirty(false)
      setRevision((current) => current + 1)
      setMessage(value.active ? 'Oferta guardada y publicada.' : 'Oferta guardada como borrador.')
    } catch (error) {
      if (uploaded) await removeOfferImage(uploaded.path).catch(() => {})
      throw error
    } finally { setPending(false) }
  }

  async function runAction(action) {
    if (pending) return
    setPending(true)
    setActionError('')
    try { await action() }
    catch (error) { setActionError(error.message || 'No se ha podido guardar el cambio. Inténtalo de nuevo.') }
    finally { setPending(false) }
  }

  function toggle(offer) {
    if (selected?.id === offer.id && dirty && !window.confirm('Hay cambios sin guardar en esta oferta. ¿Quieres descartarlos y cambiar su publicación?')) return
    runAction(async () => {
      await setOfferActive(offer.id, !offer.active, user.uid)
      if (selected?.id === offer.id) {
        setSelected({ ...selected, active: !offer.active })
        setDirty(false)
        setRevision((current) => current + 1)
      }
      setMessage(offer.active ? 'Oferta retirada de la web.' : 'Oferta publicada.')
    })
  }

  function move(index, direction) {
    const next = [...offers]
    const destination = index + direction
    if (!next[destination]) return
    ;[next[index], next[destination]] = [next[destination], next[index]]
    runAction(async () => {
      await reorderOffers(next.map((offer) => offer.id), user.uid)
      setMessage('Orden de las ofertas guardado.')
    })
  }

  function remove(offer) {
    if (!window.confirm(`¿Quieres eliminar la oferta “${offer.title}”? Se retirará de la web.`)) return
    runAction(async () => {
      await removeOffer(offer.id)
      await removeOfferImage(offer.imagePath).catch(() => {})
      if (selected?.id === offer.id) { setSelected(null); setDirty(false) }
      setMessage('Oferta eliminada.')
    })
  }

  return <section className="offers-admin" aria-label="Gestión de ofertas">
    <header className="admin-header">
      <div><h1>Ofertas</h1><p>Publica banners en la parte superior de la web. Si hay varios, irán pasando automáticamente.</p></div>
      <button className="button" type="button" disabled={pending || loading || Boolean(loadError)} onClick={() => selectOffer({ ...emptyOffer, order: Math.min(9999, Math.max(-1, ...offers.map((offer) => offer.order || 0)) + 1) })}><Plus size={17} aria-hidden="true" /> Añadir oferta</button>
    </header>
    {loadError && <p className="offers-admin__error" role="alert">{loadError}</p>}
    {actionError && <p className="offers-admin__error" role="alert">{actionError}</p>}
    <div className={`offers-admin__workspace${selected ? ' offers-admin__workspace--editing' : ''}`}>
      <section className="offers-admin__list" aria-label="Banners de ofertas" aria-busy={loading || pending}>
        <div className="offers-admin__list-heading"><h2>Banners</h2><span>{loading ? 'Cargando…' : `${activeCount} ${activeCount === 1 ? 'publicado' : 'publicados'}`}</span></div>
        {loading ? <p className="offers-admin__empty" role="status">Cargando ofertas…</p> : !loadError && offers.length === 0 ? <div className="offers-admin__empty"><ImageSquare size={30} aria-hidden="true" /><h3>Tu próxima oferta, aquí</h3><p>Añade una imagen o escribe una oferta para mostrarla a tus clientes.</p><button className="offers-admin__secondary" type="button" disabled={pending} onClick={() => selectOffer({ ...emptyOffer })}><Plus size={15} aria-hidden="true" /> Crear primera oferta</button></div> : offers.map((offer, index) => <article key={offer.id} className={`offers-admin__row${selected?.id === offer.id ? ' is-selected' : ''}`}>
          <button className="offers-admin__select" type="button" disabled={pending} onClick={() => selectOffer(offer)} aria-label={`Editar oferta: ${offer.title}`} aria-pressed={selected?.id === offer.id}>
            <span className="offers-admin__thumbnail">{offer.imageUrl ? <img src={offer.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <ImageSquare size={23} aria-hidden="true" />}</span>
            <span className="offers-admin__summary"><strong>{offer.title}</strong><span>{offer.description || (offer.imageUrl ? 'Banner con imagen' : 'Banner de texto')}</span><small className={offer.active ? 'is-published' : ''}>{offer.active ? 'Publicado' : 'Borrador'}</small></span>
            <PencilSimple className="offers-admin__edit-icon" size={16} aria-hidden="true" />
          </button>
          <div className="offers-admin__row-actions">
            <button className="offers-admin__visibility" type="button" disabled={pending} onClick={() => toggle(offer)}>{offer.active ? 'Retirar' : 'Publicar'}</button>
            <div className="offers-admin__icon-actions"><button type="button" title="Subir posición" aria-label={`Subir ${offer.title}`} disabled={pending || index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} aria-hidden="true" /></button><button type="button" title="Bajar posición" aria-label={`Bajar ${offer.title}`} disabled={pending || index === offers.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} aria-hidden="true" /></button><button className="offers-admin__delete" type="button" title="Eliminar oferta" aria-label={`Eliminar ${offer.title}`} disabled={pending} onClick={() => remove(offer)}><Trash size={16} aria-hidden="true" /></button></div>
          </div>
        </article>)}
        {offers.length > 1 && <p className="offers-admin__order-note">Usa las flechas para cambiar el orden. En la web solo aparecen las ofertas publicadas.</p>}
      </section>
      {selected && <OfferEditor key={`${selected.id || 'new'}-${revision}`} item={selected} pending={pending} onSave={save} onDirty={() => setDirty(true)} onClose={() => selectOffer(null)} />}
    </div>
  </section>
}

function OfferEditor({ item, pending, onSave, onDirty, onClose }) {
  const [value, setValue] = useState({ ...emptyOffer, ...item, ...offerColors(item) })
  const [imageFile, setImageFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const titleRef = useRef(null)
  function update(key, next) {
    setValue((current) => ({ ...current, [key]: next, ...(key === 'linkUrl' && !next.trim() ? { linkLabel: '' } : {}) }))
    onDirty()
  }
  const image = previewUrl || value.imageUrl
  const colors = offerColors(value)

  useEffect(() => { titleRef.current?.focus() }, [])
  useEffect(() => {
    if (!imageFile) { setPreviewUrl(''); return undefined }
    const url = URL.createObjectURL(imageFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  function selectImage(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try { validateOfferImage(file); setImageFile(file); setError(''); onDirty() }
    catch (selectionError) { setError(selectionError.message) }
  }

  async function submit(event) {
    event.preventDefault()
    if (pending) return
    setError('')
    try { await onSave(value, imageFile, setProgress) }
    catch (saveError) { setError(saveError.message || 'No se ha podido guardar la oferta. Inténtalo de nuevo.') }
    finally { setProgress('') }
  }

  return <form className="offers-admin__editor" onSubmit={submit} aria-busy={pending}>
    <div className="offers-admin__editor-heading"><h2>{item.id ? 'Editar oferta' : 'Nueva oferta'}</h2><button type="button" className="offers-admin__close" aria-label="Cerrar editor de oferta" disabled={pending} onClick={onClose}><X size={18} aria-hidden="true" /></button></div>
    <fieldset disabled={pending}>
      <label htmlFor="offer-title">Título *<input ref={titleRef} id="offer-title" value={value.title} onChange={(event) => update('title', event.target.value)} required maxLength={120} placeholder="Ej. Revisión de moto con precio especial" /></label>
      <label htmlFor="offer-description">Texto de la oferta<textarea id="offer-description" value={value.description} onChange={(event) => update('description', event.target.value)} maxLength={280} rows={3} placeholder="Añade los detalles de tu promoción" /><small>Opcional · hasta 280 caracteres.</small></label>
      <div className="offers-admin__image-field"><label htmlFor="offer-image">Imagen del banner</label><label className="offers-admin__upload" htmlFor="offer-image"><UploadSimple size={17} aria-hidden="true" /><span>{image ? 'Cambiar imagen' : 'Subir imagen'}<small>JPG, PNG o WebP · máximo 5 MB</small></span><input id="offer-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} /></label>{imageFile && <small className="offers-admin__file-name">{imageFile.name}</small>}{image && <button type="button" className="offers-admin__text-button" onClick={() => { setImageFile(null); setValue((current) => ({ ...current, imageUrl: '', imagePath: '' })); onDirty() }}>Quitar imagen</button>}<p>Opcional. La imagen se ajusta al banner sin recortarse.</p></div>
      <div className="offers-admin__color-fields"><OfferColorField id="offer-background-color" label="Color del fondo" value={value.backgroundColor} safeValue={colors.backgroundColor} onChange={(next) => update('backgroundColor', next)} /><OfferColorField id="offer-text-color" label="Color del texto" value={value.textColor} safeValue={colors.textColor} onChange={(next) => update('textColor', next)} /></div>
      <label htmlFor="offer-link">Enlace (opcional)<input id="offer-link" value={value.linkUrl} onChange={(event) => update('linkUrl', event.target.value)} maxLength={1000} placeholder="/repuestos/moto o https://…" autoCapitalize="none" spellCheck={false} /><small>Puedes enlazar una página de la web o una dirección https://. Sin enlace, el banner no mostrará ningún botón.</small></label>
      <label htmlFor="offer-link-label">Texto del enlace<input id="offer-link-label" value={value.linkLabel} onChange={(event) => update('linkLabel', event.target.value)} maxLength={40} placeholder="Ver oferta" disabled={!value.linkUrl.trim() || pending} /><small>Si lo dejas vacío, se mostrará «Ver oferta».</small></label>
      <label className="offers-admin__publish"><input type="checkbox" checked={value.active} onChange={(event) => update('active', event.target.checked)} /><span>Publicar en la web<small>{value.active ? 'La oferta aparecerá al guardar.' : 'Se guardará como borrador, visible solo en este panel.'}</small></span></label>
    </fieldset>
    <section className="offers-admin__preview" aria-label="Vista previa del banner"><div className="offers-admin__preview-heading"><h3>Vista previa</h3><span>{value.active ? 'Para publicar' : 'Borrador'}</span></div><div className={`offers-admin__preview-banner${image ? ' offers-admin__preview-banner--image' : ''}`} style={{ backgroundColor: colors.backgroundColor, color: colors.textColor, borderColor: colors.backgroundColor }}>{image && <img src={image} alt={value.title || 'Imagen de la oferta'} referrerPolicy="no-referrer" />}<div><strong>{value.title.trim() || 'Título de tu oferta'}</strong>{value.description.trim() && <p>{value.description}</p>}{value.linkUrl.trim() && <span className="offers-admin__preview-link">{value.linkLabel.trim() || 'Ver oferta'} <ArrowRight size={14} aria-hidden="true" /></span>}</div></div></section>
    {progress && <p className="offers-admin__progress" role="status">{progress}</p>}
    {error && <p className="offers-admin__error" role="alert">{error}</p>}
    <footer><button type="button" className="offers-admin__secondary" disabled={pending} onClick={onClose}>Cancelar</button><button type="submit" className="button" disabled={pending}>{pending ? 'Guardando…' : value.active ? item.id ? 'Guardar cambios' : 'Guardar y publicar' : 'Guardar borrador'}</button></footer>
  </form>
}

function OfferColorField({ id, label, value, safeValue, onChange }) {
  return <div className="offers-admin__color-field"><label htmlFor={id}>{label}</label><div><input id={id} type="color" value={safeValue} onChange={(event) => onChange(event.target.value)} /><input aria-label={`${label} en hexadecimal`} value={value} onChange={(event) => onChange(event.target.value)} maxLength={7} pattern="#[0-9a-fA-F]{6}" title="Introduce un color hexadecimal de seis cifras, por ejemplo #153866." placeholder="#153866" autoCapitalize="none" spellCheck={false} required /></div></div>
}

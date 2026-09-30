import { Archive, ArrowLeft, ArrowSquareOut, CalendarBlank, CaretLeft, CaretRight, ChatText, CloudArrowDown, DownloadSimple, Package, PencilSimple, Plus, SignOut, SquaresFour, Trash, UploadSimple, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { archiveCatalogItem, catalogPayload, getCatalogItem, getCatalogPage, getTaxonomies, normalize, removeCatalogItem, restoreCatalogItem, saveCatalogItem, saveTaxonomy, VEHICLE_TYPES } from '../lib/catalog'
import { optimizeCatalogImage, removeCatalogImage, uploadCatalogImage, validateCatalogImage } from '../lib/catalogImages'
import { firebaseConfigured } from '../lib/firebase'
import { login, logout, startImport, watchAdmin, watchBihrSyncJobs, watchImportJobs } from '../lib/admin'
import { updateRequest, watchRequests } from '../lib/requests'

const emptyItem = { reference: '', description: '', price: '', discount: 0, vehicleType: 'moto', categoryId: '', subcategoryId: '', status: 'active', brand: '', supplierReference: '', barcode: '', sourceCategory: '', replacementReference: '', salesMultiple: 1, imageUrl: '' }
const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export function AdminPage({ navigate, path }) {
  const [session, setSession] = useState({ loading: true, user: null, isAdmin: false })
  useEffect(() => {
    if (!firebaseConfigured) { setSession({ loading: false, user: null, isAdmin: false }); return undefined }
    return watchAdmin((next) => setSession({ ...next, loading: false }))
  }, [])
  if (!firebaseConfigured) return <AdminNotice title="Firebase aún no está configurado" text="Completa las variables VITE_FIREBASE_* para habilitar el panel de administración." />
  if (session.loading) return <AdminNotice title="Comprobando acceso…" text="" />
  if (!session.user) return <Login />
  if (!session.isAdmin) return <AdminNotice title="Acceso no autorizado" text={`El usuario ${session.user.email} no tiene rol de administrador.`} onLogout={logout} />
  return <AdminDashboard navigate={navigate} path={path} user={session.user} />
}

function Login() {
  const [error, setError] = useState(''); const [pending, setPending] = useState(false)
  async function submit(event) { event.preventDefault(); setPending(true); setError(''); const form = new FormData(event.currentTarget); try { await login(form.get('email'), form.get('password')) } catch { setError('No se ha podido iniciar sesión. Revisa tus credenciales.') } finally { setPending(false) } }
  return <main className="admin-login"><form onSubmit={submit}><span className="admin-brand">VICTIKER</span><h1>Administración</h1><p>Accede para gestionar el catálogo.</p><label>Email<input required name="email" type="email" autoComplete="email" /></label><label>Contraseña<input required name="password" type="password" autoComplete="current-password" /></label>{error && <p className="form-error">{error}</p>}<button className="button" disabled={pending}>{pending ? 'Entrando…' : 'Entrar'}</button></form></main>
}

function AdminNotice({ title, text, onLogout }) { return <main className="admin-login"><div><img className="admin-notice-logo" src="/assets/victiker-logo-header.png" alt="Victiker" /><h1>{title}</h1>{text && <p>{text}</p>}{onLogout && <button className="button button--dark" onClick={onLogout}>Cerrar sesión</button>}</div></main> }

function AdminDashboard({ navigate, path, user }) {
  const [section, setSection] = useState('catalog'); const [items, setItems] = useState([]); const [cursor, setCursor] = useState(null); const [history, setHistory] = useState([])
  const [filters, setFilters] = useState({ term: '', vehicleType: 'all', status: 'active' }); const [loading, setLoading] = useState(true); const [taxonomies, setTaxonomies] = useState([]); const [message, setMessage] = useState(''); const [partsRequests, setPartsRequests] = useState([]); const [appointmentRequests, setAppointmentRequests] = useState([])
  const productId = path?.match(/^\/admin\/producto\/(.+)$/)?.[1]
  function showSection(next) { setSection(next); if (productId) navigate('/admin') }
  const [signingOut, setSigningOut] = useState(false)
  async function handleLogout() { setSigningOut(true); try { await logout() } catch { setMessage('No se ha podido cerrar la sesión. Inténtalo de nuevo.'); setSigningOut(false) } }
  const categories = useMemo(() => taxonomies.filter((entry) => !entry.parentId && entry.active), [taxonomies])
  async function load(nextCursor = null, reset = false) { setLoading(true); try { const result = await getCatalogPage({ ...filters, cursor: nextCursor, admin: { status: filters.status } }); setItems(result.items); setCursor(result.nextCursor); if (reset) setHistory([]) } catch (error) { setMessage(error.message) } finally { setLoading(false) } }
  async function loadTaxonomies() { try { setTaxonomies(await getTaxonomies()) } catch (error) { setMessage(error.message) } }
  async function createTaxonomy({ name, vehicleType, parentId = null }) {
    const cleanName = name.trim()
    if (!cleanName) throw new Error('Escribe el nombre de la categoría.')
    const existing = taxonomies.find((entry) => entry.vehicleType === vehicleType && (entry.parentId || null) === parentId && normalize(entry.name) === normalize(cleanName))
    if (existing) {
      if (!existing.active) await saveTaxonomy(existing.id, { ...existing, active: true }, user.uid)
      await loadTaxonomies()
      return existing.id
    }
    const result = await saveTaxonomy(null, { name: cleanName, vehicleType, parentId }, user.uid)
    await loadTaxonomies()
    return result.id
  }
  useEffect(() => { load(null, true); loadTaxonomies() }, [filters.term, filters.vehicleType, filters.status])
  useEffect(() => { const stopParts = watchRequests('parts', (next, error) => { if (error) setMessage(error.message); setPartsRequests(next) }); const stopAppointments = watchRequests('appointment', (next, error) => { if (error) setMessage(error.message); setAppointmentRequests(next) }); return () => { stopParts(); stopAppointments() } }, [])
  async function save(item, imageFile, onProgress, originalItem) {
    catalogPayload(item, user.uid)
    let uploaded = null
    try {
      if (imageFile) {
        onProgress('Optimizando imagen…')
        const optimized = await optimizeCatalogImage(imageFile)
        onProgress('Subiendo imagen…')
        uploaded = await uploadCatalogImage(optimized, user.uid, (percent) => onProgress(`Subiendo imagen ${percent} %…`))
      }
      const savedId = await saveCatalogItem(item.id, {
        ...item,
        imageUrl: uploaded?.url ?? item.imageUrl,
        imagePath: uploaded?.path ?? item.imagePath,
      }, user.uid)
      if (originalItem?.imagePath && originalItem.imagePath !== (uploaded?.path ?? item.imagePath)) {
        await removeCatalogImage(originalItem.imagePath).catch(() => {})
      }
      setMessage('Pieza guardada.')
      load(null, true)
      return savedId
    } catch (error) {
      if (uploaded) await removeCatalogImage(uploaded.path).catch(() => {})
      throw error
    }
  }
  async function action(type, item) { const label = type === 'delete' ? 'borrar definitivamente' : type === 'archive' ? 'archivar' : 'restaurar'; if (!window.confirm(`¿Quieres ${label} “${item.reference}”?`)) return false; try { if (type === 'delete') { await removeCatalogItem(item.id); await removeCatalogImage(item.imagePath).catch(() => {}) } if (type === 'archive') await archiveCatalogItem(item.id, user.uid); if (type === 'restore') await restoreCatalogItem(item.id, user.uid); setMessage('Cambio guardado.'); load(null, true); return true } catch (error) { setMessage(error.message); return false } }
  return <main className="admin-shell"><aside className="admin-sidebar"><button className="admin-brand" onClick={() => navigate('/')}><img src="/assets/victiker-logo-header.png" alt="Victiker" /></button><nav><button className={section === 'catalog' ? 'is-active' : ''} onClick={() => showSection('catalog')}><SquaresFour size={17} weight="duotone" /><span>Catálogo</span></button><button className={section === 'parts' && !productId ? 'is-active' : ''} onClick={() => showSection('parts')}><Package size={17} weight="duotone" /><span>Pedidos</span></button><button className={section === 'appointments' && !productId ? 'is-active' : ''} onClick={() => showSection('appointments')}><CalendarBlank size={17} weight="duotone" /><span>Citas</span></button><button className={section === 'imports' && !productId ? 'is-active' : ''} onClick={() => showSection('imports')}><UploadSimple size={17} weight="duotone" /><span>Importaciones</span></button></nav><button type="button" className="admin-signout" onClick={handleLogout} disabled={signingOut} aria-label={signingOut ? "Cerrando sesión…" : "Cerrar sesión"}><SignOut size={17} aria-hidden="true" /> <span>{signingOut ? "Cerrando sesión…" : "Cerrar sesión"}</span></button></aside><section className="admin-content">
    {message && <div className="admin-message" role="status">{message}<button onClick={() => setMessage('')}><X size={16} /></button></div>}
    {productId ? <ProductDetail key={productId} productId={decodeURIComponent(productId)} categories={categories} taxonomies={taxonomies} navigate={navigate} onSave={save} onAction={action} onCreateTaxonomy={createTaxonomy} /> : <>
      {section === 'catalog' && <CatalogAdmin items={items} filters={filters} setFilters={setFilters} loading={loading} cursor={cursor} history={history} categories={categories} onOpen={(item) => navigate(`/admin/producto/${encodeURIComponent(item.id)}`)} onNext={() => { setHistory([...history, { items, cursor }]); load(cursor) }} onPrevious={() => { const pages = [...history]; const previous = pages.pop(); setHistory(pages); setItems(previous.items); setCursor(previous.cursor) }} onAction={action} onAdd={() => navigate('/admin/producto/nuevo')} />}
      {section === 'parts' && <RequestsAdmin type="parts" requests={partsRequests} setMessage={setMessage} />}
      {section === 'appointments' && <RequestsAdmin type="appointment" requests={appointmentRequests} setMessage={setMessage} />}
      {section === 'imports' && <Imports setMessage={setMessage} />}
    </>}
  </section></main>
}

function RequestsAdmin({ type, requests, setMessage }) {
  const [selected, setSelected] = useState(null)
  async function save(request, notes) { try { await updateRequest(request.id, notes); setSelected({ ...request, notes }); setMessage('Notas guardadas.') } catch (error) { setMessage(error.message) } }
  const isParts = type === 'parts'
  return <><header className="admin-header"><div><h1>{isParts ? 'Pedidos' : 'Citas'}</h1><p>{isParts ? 'Gestiona las solicitudes de repuestos recibidas desde la web.' : 'Gestiona las solicitudes de cita recibidas desde la web.'}</p></div></header><div className="request-workspace"><div className="request-list">{requests.length === 0 ? <p className="admin-loading">No hay {isParts ? 'pedidos' : 'citas'} todavía.</p> : requests.map((request) => <button key={request.id} className={selected?.id === request.id ? 'is-selected' : ''} onClick={() => setSelected(request)}><strong>{request.name}</strong><span>{isParts ? `${request.items?.length || 0} referencias` : request.need}</span><small>{formatJobDate(request.createdAt)}</small></button>)}</div>{selected ? <RequestDetail request={selected} onSave={save} /> : <div className="request-detail request-detail--empty"><ChatText size={36} /><p>Selecciona una solicitud para ver sus datos y añadir notas internas.</p></div>}</div></>
}

function RequestDetail({ request, onSave }) {
  const [notes, setNotes] = useState(request.notes || '')
  useEffect(() => { setNotes(request.notes || '') }, [request.id, request.notes])
  const isParts = request.type === 'parts'
  return <article className="request-detail"><header><div><span className="request-detail__eyebrow">{isParts ? 'Solicitud de repuestos' : 'Solicitud de cita'}</span><h2>{request.name}</h2></div></header><dl><dt>Teléfono</dt><dd>{request.phone}</dd>{isParts ? <><dt>Vehículo</dt><dd>{request.vehicle || 'No especificado'}</dd><dt>Piezas</dt><dd>{request.items?.map((item) => `${item.description || item.title} · ${item.reference} × ${item.quantity}`).join('\n') || '—'}</dd></> : <><dt>Necesidad</dt><dd>{request.need}</dd><dt>Detalles</dt><dd>{request.details || '—'}</dd></>}</dl><label className="request-notes">Notas internas<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Escribe aquí el seguimiento privado…" rows="7" /></label><footer><button className="button" onClick={() => onSave(request, notes)}>Guardar notas</button></footer></article>
}

function CatalogAdmin({ items, filters, setFilters, loading, cursor, history, categories, onOpen, onNext, onPrevious, onAction, onAdd }) {
  return <><header className="admin-header"><div><h1>Catálogo</h1><p>Piezas de moto y barco, añadidas a mano, por CSV o sincronizadas con Bihr.</p></div><button className="button" onClick={onAdd}><Plus size={18} /> Añadir pieza</button></header>
    <div className="admin-toolbar"><input aria-label="Buscar productos" value={filters.term} onChange={(event) => setFilters({ ...filters, term: event.target.value })} placeholder="Buscar por referencia o descripción" /><select aria-label="Filtrar por vehículo" value={filters.vehicleType} onChange={(event) => setFilters({ ...filters, vehicleType: event.target.value })}><option value="all">Todos los vehículos</option>{VEHICLE_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select><select aria-label="Filtrar por estado" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="active">Activas</option><option value="archived">Archivadas</option></select></div>
    <div className="admin-table"><div className="admin-table__head"><span>Referencia</span><span>Descripción</span><span>Clasificación</span><span>Precio</span><span>Estado</span><span /></div>{loading ? <p className="admin-loading">Cargando referencias…</p> : items.length === 0 ? <p className="admin-loading">No hay piezas con estos filtros.</p> : items.map((item) => <article key={item.id}><span>{item.reference}</span><button className="admin-product-name" type="button" onClick={() => onOpen(item)}>{item.description}</button><span className="catalog-classification">{VEHICLE_TYPES.find((type) => type.id === item.vehicleType)?.label || 'Sin clasificar'} · {categories.find((entry) => entry.id === item.categoryId)?.name || 'Sin categoría'}{item.source === 'bihr' && <small className="catalog-source" title="Catálogo Bihr · datos sincronizados automáticamente">Bihr</small>}</span><span>{money.format(item.price || 0)}</span><span className={`catalog-status catalog-status--${item.status}`}>{item.status === 'active' ? 'Activa' : 'Archivada'}</span><div><button type="button" onClick={() => onOpen(item)} title="Ver detalle del producto" aria-label={`Ver detalle de ${item.reference}`}><ArrowSquareOut size={18} /></button>{item.source === 'bihr' ? <span className="catalog-action-tooltip" title="No se puede editar: esta información viene de la API de Bihr y se sincroniza automáticamente."><button type="button" className="catalog-action--unavailable" disabled aria-label="Editar: no disponible para referencias Bihr"><PencilSimple size={18} /></button></span> : <button type="button" onClick={() => onOpen(item)} title="Editar pieza" aria-label={`Editar ${item.reference}`}><PencilSimple size={18} /></button>}{item.status === 'active' ? <button type="button" onClick={() => onAction('archive', item)} title="Archivar pieza" aria-label={`Archivar ${item.reference}`}><Archive size={18} /></button> : <button type="button" onClick={() => onAction('restore', item)} title="Restaurar pieza">Restaurar</button>}<button type="button" onClick={() => onAction('delete', item)} title="Borrar definitivamente" aria-label={`Borrar ${item.reference}`}><Trash size={18} /></button></div></article>)}</div>
    <nav className="pagination"><button disabled={!history.length} onClick={onPrevious} aria-label="Página anterior"><CaretLeft size={18} /></button><span>Página {history.length + 1}</span><button disabled={!cursor} onClick={onNext} aria-label="Página siguiente"><CaretRight size={18} /></button></nav></>
}

function ProductDetail({ productId, categories, taxonomies, navigate, onSave, onAction, onCreateTaxonomy }) {
  const isNew = productId === 'nuevo'
  const [item, setItem] = useState(isNew ? emptyItem : null)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState('')
  useEffect(() => {
    if (isNew) return undefined
    let active = true
    getCatalogItem(productId).then((result) => { if (active) { setItem(result); setLoading(false) } }).catch((loadError) => { if (active) { setError(loadError.message); setLoading(false) } })
    return () => { active = false }
  }, [productId, isNew])
  async function saveProduct(value, imageFile, onProgress) {
    const savedId = await onSave(value, imageFile, onProgress, item)
    if (isNew) navigate(`/admin/producto/${encodeURIComponent(savedId)}`)
    else { setItem(await getCatalogItem(savedId)); setRevision((current) => current + 1) }
  }
  async function actionProduct(type) {
    if (!await onAction(type, item)) return
    if (type === 'delete') navigate('/admin')
    else setItem((current) => ({ ...current, status: type === 'archive' ? 'archived' : 'active' }))
  }
  return <div className="admin-product-page"><button className="admin-back" type="button" onClick={() => navigate('/admin')}><ArrowLeft size={17} /> Volver al catálogo</button>
    {loading ? <p className="admin-loading">Cargando producto…</p> : error || !item ? <p className="form-error" role="alert">{error || 'Este producto ya no existe.'}</p> : <>
      <header className="admin-product-header"><div><span className="admin-product-kicker">{isNew ? 'Nuevo producto' : `Referencia ${item.reference}`}</span><h1>{isNew ? 'Añadir producto' : item.description}</h1><p>{isNew ? 'Elige moto o barco y completa la ficha del producto.' : `${VEHICLE_TYPES.find((type) => type.id === item.vehicleType)?.label || 'Sin clasificar'} · ${item.source === 'bihr' ? 'Sincronizado con Bihr' : 'Producto propio'}`}</p></div>{!isNew && <span className={`catalog-status catalog-status--${item.status}`}>{item.status === 'active' ? 'Activa' : 'Archivada'}</span>}</header>
      {item.source === 'bihr' ? <div className="admin-product-layout"><section className="admin-product-card"><h2>Datos del producto</h2><p className="admin-product-hint">Los datos de Bihr se sincronizan automáticamente y no se pueden editar aquí.</p><dl className="admin-product-facts"><dt>Referencia</dt><dd>{item.reference}</dd><dt>Descripción</dt><dd>{item.description}</dd><dt>Vehículo</dt><dd>Moto</dd><dt>Categoría</dt><dd>{categories.find((entry) => entry.id === item.categoryId)?.name || item.sourceCategory || 'Sin categoría'}</dd><dt>Precio</dt><dd>{money.format(item.price || 0)}</dd>{item.brand && <><dt>Marca</dt><dd>{item.brand}</dd></>}{item.supplierReference && <><dt>Ref. proveedor</dt><dd>{item.supplierReference}</dd></>}{item.bihr?.newPartNumber && <><dt>Referencia sustituta</dt><dd>{item.bihr.newPartNumber}</dd></>}{item.barcode && <><dt>Código de barras</dt><dd>{item.barcode}</dd></>}{item.stockLevel && <><dt>Stock Bihr</dt><dd>{item.stockLevel}{item.stockValue != null ? ` · ${item.stockValue} unidades` : ''}</dd></>}{item.salesMultiple > 1 && <><dt>Múltiplo de venta</dt><dd>{item.salesMultiple}</dd></>}<dt>Origen</dt><dd>Bihr</dd>{item.updatedAt && <><dt>Actualizado</dt><dd>{formatJobDate(item.updatedAt)}</dd></>}</dl></section><aside className="admin-product-card admin-product-preview">{item.imageUrl ? <img src={item.imageUrl} alt={item.description} referrerPolicy="no-referrer" /> : <div className="admin-product-placeholder"><Package size={38} /><span>Sin imagen</span></div>}</aside></div> : <Editor key={revision} item={item} categories={categories} taxonomies={taxonomies} onSave={saveProduct} onCreateTaxonomy={onCreateTaxonomy} />}
      {!isNew && <div className="admin-product-actions"><button type="button" onClick={() => actionProduct(item.status === 'active' ? 'archive' : 'restore')}>{item.status === 'active' ? 'Archivar producto' : 'Restaurar producto'}</button><button type="button" className="admin-product-delete" onClick={() => actionProduct('delete')}>Borrar definitivamente</button></div>}
    </>}
  </div>
}

function Editor({ item, categories, taxonomies, onSave, onCreateTaxonomy }) {
  const [value, setValue] = useState(item)
  const [imageFile, setImageFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [addingTaxonomy, setAddingTaxonomy] = useState(null)
  const [taxonomyName, setTaxonomyName] = useState('')
  const [taxonomyPending, setTaxonomyPending] = useState(false)
  const subcategories = taxonomies.filter((entry) => entry.parentId === value.categoryId && entry.active)
  const update = (key, next) => setValue((current) => ({ ...current, [key]: next, ...(['categoryId', 'vehicleType'].includes(key) ? { subcategoryId: '' } : {}), ...(key === 'vehicleType' ? { categoryId: '' } : {}), ...(key === 'imageUrl' ? { imagePath: next === (item.imageUrl || '') ? item.imagePath || null : null } : {}) }))

  useEffect(() => {
    if (!imageFile) { setPreviewUrl(null); return undefined }
    const url = URL.createObjectURL(imageFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  function selectImage(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      validateCatalogImage(file)
      setImageFile(file)
      setError('')
    } catch (selectionError) { setImageFile(null); setError(selectionError.message) }
  }

  async function createTaxonomy(event) {
    event.preventDefault()
    if (addingTaxonomy === 'subcategory' && !value.categoryId) { setError('Selecciona primero una categoría.'); return }
    setTaxonomyPending(true)
    setError('')
    try {
      const id = await onCreateTaxonomy({ name: taxonomyName, vehicleType: value.vehicleType, parentId: addingTaxonomy === 'subcategory' ? value.categoryId : null })
      update(addingTaxonomy === 'subcategory' ? 'subcategoryId' : 'categoryId', id)
      setAddingTaxonomy(null)
      setTaxonomyName('')
    } catch (createError) { setError(createError.message || 'No se ha podido crear la categoría.') }
    finally { setTaxonomyPending(false) }
  }

  async function submit(event) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    setProgress('Guardando pieza…')
    try { await onSave(value, imageFile, setProgress) }
    catch (saveError) { setError(saveError.message || 'No se ha podido guardar la pieza.') }
    finally { setPending(false); setProgress('') }
  }

  return <div className="admin-editor admin-product-layout" aria-busy={pending}>
    <form onSubmit={submit}>
      <section className="admin-product-card"><h2>Información básica</h2><div className="admin-product-fields"><label>Referencia *<input required readOnly={Boolean(item.id)} value={value.reference} onChange={(event) => update('reference', event.target.value)} />{item.id && <small>La referencia identifica el producto y no se puede cambiar.</small>}</label><label>Tipo de vehículo<select value={value.vehicleType} onChange={(event) => update('vehicleType', event.target.value)}>{VEHICLE_TYPES.filter((type) => type.id !== 'unclassified' || value.vehicleType === 'unclassified').map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label><label className="admin-product-fields__wide">Descripción *<textarea required rows="4" value={value.description} onChange={(event) => update('description', event.target.value)} /></label></div></section>
      <section className="admin-product-card"><h2>Clasificación y precio</h2><div className="admin-product-fields"><div className="admin-taxonomy-field"><label>Categoría<select value={value.categoryId || ''} onChange={(event) => update('categoryId', event.target.value)}><option value="">Sin categoría</option>{categories.filter((entry) => entry.vehicleType === value.vehicleType || entry.vehicleType === 'all').map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><button type="button" onClick={() => { setAddingTaxonomy('category'); setTaxonomyName(''); setError('') }}>+ Nueva categoría</button></div><div className="admin-taxonomy-field"><label>Subcategoría<select value={value.subcategoryId || ''} onChange={(event) => update('subcategoryId', event.target.value)} disabled={!value.categoryId}><option value="">Sin subcategoría</option>{subcategories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><button type="button" disabled={!value.categoryId} onClick={() => { setAddingTaxonomy('subcategory'); setTaxonomyName(''); setError('') }}>+ Nueva subcategoría</button></div>{addingTaxonomy && <div className="admin-taxonomy-create"><label>{addingTaxonomy === 'category' ? 'Nombre de la nueva categoría' : 'Nombre de la nueva subcategoría'}<input autoFocus value={taxonomyName} maxLength={100} onChange={(event) => setTaxonomyName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') createTaxonomy(event) }} placeholder={addingTaxonomy === 'category' ? 'Ej. Accesorios' : 'Ej. Filtros'} /></label><div><button type="button" onClick={createTaxonomy} disabled={taxonomyPending || !taxonomyName.trim()}>{taxonomyPending ? 'Creando…' : 'Crear y seleccionar'}</button><button type="button" onClick={() => { setAddingTaxonomy(null); setTaxonomyName('') }} disabled={taxonomyPending}>Cancelar</button></div></div>}<label>Precio (€) *<input required type="number" min="0" step="0.01" value={value.price} onChange={(event) => update('price', event.target.value)} /></label><label>Descuento (%)<input type="number" min="0" max="100" value={value.discount} onChange={(event) => update('discount', event.target.value)} /></label></div></section>
      <section className="admin-product-card"><h2>Datos de proveedor</h2><p className="admin-product-hint">Opcionales para productos propios, tanto de moto como de barco.</p><div className="admin-product-fields"><label>Marca<input value={value.brand || ''} maxLength={160} onChange={(event) => update('brand', event.target.value)} /></label><label>Referencia del proveedor<input value={value.supplierReference || ''} maxLength={160} onChange={(event) => update('supplierReference', event.target.value)} /></label><label>Código de barras<input value={value.barcode || ''} maxLength={160} onChange={(event) => update('barcode', event.target.value)} inputMode="numeric" /></label><label>Múltiplo de venta<input type="number" min="1" step="1" value={value.salesMultiple ?? 1} onChange={(event) => update('salesMultiple', event.target.value)} /></label><label>Referencia sustituta<input value={value.replacementReference || ''} maxLength={160} onChange={(event) => update('replacementReference', event.target.value)} /></label><label>Categoría de origen del proveedor<input value={value.sourceCategory || ''} maxLength={160} onChange={(event) => update('sourceCategory', event.target.value)} /></label></div></section>
      {progress && <p className="admin-editor__progress" role="status">{progress}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button className="button" type="submit" disabled={pending}>{pending ? 'Guardando…' : item.id ? 'Guardar cambios' : 'Crear producto'}</button></footer>
    </form>
    <aside className="admin-product-card admin-product-media"><h2>Imagen del producto</h2>{(previewUrl || value.imageUrl) ? <div className="admin-editor__photo"><img className="admin-editor__image" src={previewUrl || value.imageUrl} alt="Vista previa de la pieza" referrerPolicy="no-referrer" /><button type="button" onClick={() => { setImageFile(null); setValue((current) => ({ ...current, imageUrl: null, imagePath: null })) }} disabled={pending}>Quitar foto</button></div> : <div className="admin-product-placeholder"><Package size={38} /><span>Sin imagen</span></div>}<label>Subir foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} disabled={pending} /><small>{imageFile ? `Seleccionada: ${imageFile.name}. ` : ''}JPG, PNG o WebP · máximo 5 MB.</small></label><label>O usar una URL de imagen<input type="url" value={value.imageUrl || ''} onChange={(event) => update('imageUrl', event.target.value)} placeholder="https://…" disabled={pending || Boolean(imageFile)} /><small>Si subes una foto, tendrá preferencia sobre la URL.</small></label></aside>
  </div>
}

function formatJobDate(value) { try { return value?.toDate().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) || '—' } catch { return '—' } }
const BIHR_ACTIVE_WINDOW_MS = 35 * 60 * 1000
function isBihrJobActive(job, now = Date.now()) { const startedAt = job?.startedAt?.toMillis?.() || 0; return ['downloading', 'processing'].includes(job?.status) && startedAt > now - BIHR_ACTIVE_WINDOW_MS }
function jobStatus(job, now = Date.now()) { if (['downloading', 'processing'].includes(job?.status) && !isBihrJobActive(job, now)) return 'Interrumpida'; return ({ awaiting_upload: 'Esperando archivo', downloading: 'Descargando', processing: 'Procesando', completed: 'Completada', failed: 'Error' })[job?.status] || job?.status }

function Imports({ setMessage }) {
  const [file, setFile] = useState(null); const [vehicleType, setVehicleType] = useState('moto'); const [pending, setPending] = useState(false); const [progress, setProgress] = useState(0); const [jobs, setJobs] = useState([]); const [bihrJobs, setBihrJobs] = useState([]); const [now, setNow] = useState(Date.now())
  useEffect(() => watchImportJobs(setJobs), []); useEffect(() => watchBihrSyncJobs(setBihrJobs), [])
  useEffect(() => { if (!['downloading', 'processing'].includes(bihrJobs[0]?.status)) return undefined; const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer) }, [bihrJobs])
  async function submit(event) { event.preventDefault(); if (!file) return; const fileInput = event.currentTarget.querySelector('input[type="file"]'); setPending(true); try { const result = await startImport(file, vehicleType, setProgress); setMessage(`Archivo de ${vehicleType === 'moto' ? 'moto' : 'barco'} subido (${result.progress} %). El procesamiento continuará en segundo plano.`); setFile(null); fileInput.value = '' } catch (error) { setMessage(error.message) } finally { setPending(false) } }
  const lastBihrJob = bihrJobs[0]
  return <><header className="admin-header"><div><h1>Importaciones</h1><p>Importa tus propias piezas de moto o barco. Bihr se sincroniza aparte para las referencias de moto.</p></div></header><div className="imports-sections"><section className="import-card import-card--manual"><div className="import-card__header"><div className="import-card__icon"><UploadSimple size={23} /></div><div><span className="import-card__eyebrow">Tus productos</span><h2>Importar CSV</h2><p>Selecciona el vehículo para todo el archivo. La referencia es obligatoria; las categorías y subcategorías se crean automáticamente.</p></div></div><form className="manual-import-form" onSubmit={submit}><label>Tipo de vehículo<select value={vehicleType} disabled={pending} onChange={(event) => setVehicleType(event.target.value)}><option value="moto">Moto</option><option value="barco">Barco</option></select></label><label>Archivo CSV<input required type="file" accept=".csv,text/csv" disabled={pending} onChange={(event) => setFile(event.target.files[0] || null)} /></label><div className="import-card__actions"><a className="button button--secondary" href="/muestra-catalogo.csv" download><DownloadSimple size={18} />Descargar CSV de muestra</a><button className="button" disabled={!file || pending}>{pending ? `Subiendo ${progress} %…` : 'Subir e importar'}</button></div></form>{jobs.length > 0 && <div className="import-jobs"><h3>Importaciones recientes</h3>{jobs.map((job) => <article key={job.id}><strong>{job.fileName}<small>{job.catalogType === 'moto' ? 'Moto' : 'Barco'}</small></strong><span>{jobStatus(job)}</span><small>{job.processed || 0} procesadas · {job.created || 0} nuevas · {job.updated || 0} actualizadas · {job.rejected || 0} rechazadas</small></article>)}</div>}</section><section className="import-card import-card--bihr"><div className="import-card__header"><div className="import-card__icon"><CloudArrowDown size={23} /></div><div><span className="import-card__eyebrow">Proveedor · moto</span><h2>Catálogo Bihr</h2><p>Sincronización automática cada lunes a las 05:30. Las piezas propias de moto conviven con las de Bihr en el catálogo.</p></div></div>{lastBihrJob && <div className="bihr-sync-status"><span><small>Última ejecución</small><strong>{formatJobDate(lastBihrJob.createdAt)}</strong></span><span><small>Estado</small><strong>{jobStatus(lastBihrJob, now)}</strong></span><span><small>Catálogo</small><strong>{lastBihrJob.processed || lastBihrJob.downloaded || 0} piezas</strong></span><span><small>Nuevas / modificadas</small><strong>{lastBihrJob.new || 0} / {lastBihrJob.modified || 0}</strong></span><span><small>Sin cambios</small><strong>{lastBihrJob.unchanged || 0}</strong></span><span><small>Archivadas</small><strong>{lastBihrJob.archived || 0}</strong></span>{lastBihrJob.writesTotal > 0 && <div className="bihr-sync-progress"><progress max={lastBihrJob.writesTotal} value={lastBihrJob.writes || 0} /><small>{lastBihrJob.writes || 0} de {lastBihrJob.writesTotal} cambios aplicados</small></div>}{lastBihrJob.error && <p>{lastBihrJob.error}</p>}</div>}</section></div></>
}

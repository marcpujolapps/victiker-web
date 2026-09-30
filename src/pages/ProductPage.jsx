import { ArrowLeft, CheckCircle, ImageSquare, Plus, ShoppingBag } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { getCatalogItem, getTaxonomies } from '../lib/catalog'
import { firebaseConfigured } from '../lib/firebase'

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export function ProductPage({ id, navigate, addToCart, cart, openRequest }) {
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [failedImage, setFailedImage] = useState(false)
  const [taxonomies, setTaxonomies] = useState([])
  useEffect(() => {
    let active = true
    setLoading(true)
    getCatalogItem(id).then((item) => { if (active) setProduct(item?.status === 'active' ? item : null) }).catch(() => { if (active) setProduct(null) }).finally(() => { if (active) setLoading(false) })
    if (firebaseConfigured) getTaxonomies().then((items) => { if (active) setTaxonomies(items) }).catch(() => {})
    return () => { active = false }
  }, [id])
  const quantity = cart.find((item) => item.id === id)?.quantity || 0
  if (loading) return <section className="product-state"><p>Cargando producto…</p></section>
  if (!firebaseConfigured || !product) return <section className="product-state"><p className="section-eyebrow">Ficha de producto</p><h1>Producto no disponible</h1><p>La referencia puede haberse retirado del catálogo. Busca otra pieza o contacta con Victiker.</p><button className="button button--dark" onClick={() => navigate('/catalogo')}><ArrowLeft size={18} /> Volver al catálogo</button></section>
  const vehicle = product.vehicleType === 'barco' ? 'Embarcación' : product.vehicleType === 'moto' ? 'Moto' : 'Vehículo'
  const categoryLabel = product.sourceCategory || product.categoryName || taxonomies.find((entry) => entry.id === product.categoryId)?.name || ''
  document.title = `${product.description} ${product.reference} | Victiker`
  document.head.querySelector('meta[name="description"]')?.setAttribute('content', `${product.description}, referencia ${product.reference}. Consulta precio y solicita confirmación de compatibilidad y disponibilidad a Victiker.`)
  return <>
    <nav className="breadcrumbs" aria-label="Migas de pan"><button onClick={() => navigate('/')}>Inicio</button><span>/</span><button onClick={() => navigate(`/repuestos/${product.vehicleType || 'moto'}`)}>Repuestos {vehicle.toLocaleLowerCase('es')}</button>{categoryLabel && <><span>/</span><button onClick={() => navigate('/catalogo')}>{categoryLabel}</button></>}<span>/</span><span>{product.reference}</span></nav>
    <article className="product-detail"><div className="product-detail__image">{product.imageUrl && !failedImage ? <img src={product.imageUrl} alt={product.description} onError={() => setFailedImage(true)} /> : <ImageSquare size={54} />}</div><div className="product-detail__copy"><p className="section-eyebrow">{vehicle}{categoryLabel ? ` · ${categoryLabel}` : ''}</p><p className="product-reference">Referencia {product.reference}</p><h1>{product.description}</h1><p className="product-price">{money.format(Number(product.price || 0))} <small>IVA incluido</small></p><p className="product-detail__note">Preparamos una solicitud sin compromiso. Confirmaremos compatibilidad, disponibilidad y precio antes de formalizar la compra.</p><div className="product-actions"><button className="button button--dark" onClick={() => addToCart({ ...product, title: product.description })}>{quantity ? <CheckCircle size={19} weight="fill" /> : <Plus size={19} />} {quantity ? `Añadido (${quantity})` : 'Añadir a mi solicitud'}</button><button className="button button--outline" onClick={openRequest}><ShoppingBag size={18} /> Revisar solicitud</button></div><dl className="product-specs"><div><dt>Referencia</dt><dd>{product.reference}</dd></div><div><dt>Tipo de vehículo</dt><dd>{vehicle}</dd></div>{product.brand && <div><dt>Marca</dt><dd>{product.brand}</dd></div>}{categoryLabel && <div><dt>Categoría</dt><dd>{categoryLabel}</dd></div>}{product.stockLevel && <div><dt>Disponibilidad</dt><dd>{product.stockLevel === 'InStock' ? 'Disponible, pendiente de confirmación' : product.stockLevel === 'Short' ? 'Disponibilidad limitada, pendiente de confirmación' : 'Consultar disponibilidad'}</dd></div>}</dl></div></article>
  </>
}

import { SiteLink } from './SiteLink'
export function SiteFooter({ navigate }) {
  return <footer className="site-footer">
    <img src="/assets/victiker-logo.png" alt="Victiker" />
    <p>Taller móvil de motos y embarcaciones.</p>
    <div className="footer-links"><SiteLink href="/catalogo" navigate={navigate}>Catálogo</SiteLink><a href="https://www.instagram.com/victiker/" target="_blank" rel="noreferrer">Instagram</a><a href="https://wa.me/34673551065" target="_blank" rel="noreferrer">WhatsApp</a></div>
    <nav className="legal-links" aria-label="Información legal"><SiteLink href="/aviso-legal" navigate={navigate}>Aviso legal</SiteLink><SiteLink href="/privacidad" navigate={navigate}>Privacidad</SiteLink><SiteLink href="/cookies" navigate={navigate}>Cookies</SiteLink><SiteLink href="/condiciones-de-compra" navigate={navigate}>Condiciones de compra</SiteLink><button onClick={() => window.dispatchEvent(new Event('victiker:cookie-settings'))}>Configurar cookies</button><SiteLink href="/admin" navigate={navigate}>Acceso administración</SiteLink></nav>
  </footer>
}

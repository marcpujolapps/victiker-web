export function SiteFooter({ navigate }) {
  return <footer className="site-footer">
    <img src="/assets/victiker-logo.png" alt="Victiker" />
    <p>Taller móvil de motos y embarcaciones.</p>
    <div className="footer-links"><button onClick={() => navigate('/catalogo')}>Catálogo</button><a href="https://www.instagram.com/victiker/" target="_blank" rel="noreferrer">Instagram</a><a href="https://wa.me/34673551065" target="_blank" rel="noreferrer">WhatsApp</a></div>
    <nav className="legal-links" aria-label="Información legal"><button onClick={() => navigate('/aviso-legal')}>Aviso legal</button><button onClick={() => navigate('/privacidad')}>Privacidad</button><button onClick={() => navigate('/cookies')}>Cookies</button><button onClick={() => navigate('/condiciones-de-compra')}>Condiciones de compra</button><button onClick={() => window.dispatchEvent(new Event('victiker:cookie-settings'))}>Configurar cookies</button><button onClick={() => navigate('/admin')}>Acceso administración</button></nav>
  </footer>
}

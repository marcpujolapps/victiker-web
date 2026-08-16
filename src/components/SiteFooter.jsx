export function SiteFooter({ navigate }) {
  return <footer className="site-footer">
    <img src="/assets/victiker-logo.png" alt="Victiker" />
    <p>Taller móvil de motos y embarcaciones.</p>
    <div className="footer-links"><button onClick={() => navigate('/catalogo')}>Catálogo</button><a href="https://www.instagram.com/victiker/" target="_blank" rel="noreferrer">Instagram</a><a href="https://wa.me/34673551065" target="_blank" rel="noreferrer">WhatsApp</a></div>
  </footer>
}

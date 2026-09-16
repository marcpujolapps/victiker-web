import { WhatsappLogo } from '@phosphor-icons/react'

export function WhatsAppLink({ floating = false, raised = false }) {
  return <a
    className={floating ? `whatsapp-link whatsapp-link--floating${raised ? ' whatsapp-link--raised' : ''}` : 'whatsapp-link whatsapp-link--header'}
    href="https://wa.me/34673551065"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Escribir a Victiker por WhatsApp (abre en una pestaña nueva)"
    title="Escríbenos por WhatsApp"
  >
    <WhatsappLogo size={floating ? 32 : 24} aria-hidden="true" />
  </a>
}

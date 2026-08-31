import { sendRequestEmail } from '../worker/index.js'

export const config = {
  api: { bodyParser: true },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
  const request = new Request('https://victiker.com/api/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  try {
    const response = await sendRequestEmail(request, {
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    })
    return res.status(response.status).json(await response.json())
  } catch (error) {
    console.error('Vercel request email failed', error)
    return res.status(502).json({ error: 'No se ha podido enviar el correo. Vuelve a intentarlo.' })
  }
}

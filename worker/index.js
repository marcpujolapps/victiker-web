export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/requests") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
      }

      return sendRequestEmail(request, env);
    }

    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};

const NOTIFICATION_EMAIL = "marcpujolapps@gmail.com";

async function sendRequestEmail(request, env) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    return json({ error: "El servicio de correo no está configurado." }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "La solicitud no tiene un formato válido." }, 400);
  }

  const type = payload?.type;
  const name = cleanText(payload?.name, 120);
  const phone = cleanText(payload?.phone, 60);
  if (!name || !phone || !["appointment", "parts"].includes(type)) {
    return json({ error: "Faltan datos obligatorios." }, 400);
  }

  const email = type === "appointment"
    ? appointmentEmail({ name, phone, need: cleanText(payload.need, 160), details: cleanText(payload.details, 2000) })
    : partsEmail({ name, phone, vehicle: cleanText(payload.vehicle, 300), items: sanitizeItems(payload.items) });

  if (type === "parts" && email.items.length === 0) {
    return json({ error: "Añade al menos una pieza a la solicitud." }, 400);
  }

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [NOTIFICATION_EMAIL],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });

  if (!resendResponse.ok) {
    console.error("Resend email failed", resendResponse.status, await resendResponse.text());
    return json({ error: "No se ha podido enviar el correo. Vuelve a intentarlo." }, 502);
  }

  return json({ ok: true });
}

function appointmentEmail({ name, phone, need, details }) {
  const rows = [
    ["Nombre", name],
    ["Teléfono", phone],
    ["Necesidad", need || "No especificada"],
    ["Detalles", details || "No se han indicado detalles"],
  ];
  return emailLayout({
    title: "Nueva solicitud de cita",
    eyebrow: "VICTIKER · TALLER MÓVIL",
    intro: "Se ha recibido una nueva consulta desde el formulario de contacto.",
    content: detailTable(rows),
    text: `NUEVA SOLICITUD DE CITA\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}`,
  });
}

function partsEmail({ name, phone, vehicle, items }) {
  const totalUnits = items.reduce((total, item) => total + item.quantity, 0);
  const details = [
    ["Solicitante", name],
    ["Teléfono", phone],
    ["Vehículo / embarcación", vehicle || "No especificado"],
    ["Piezas solicitadas", `${totalUnits} unidad${totalUnits === 1 ? "" : "es"}`],
  ];
  const itemRows = items.map((item) => `<tr>
    <td valign="top" style="padding:14px 16px;border-bottom:1px solid #e5e9ef;color:#12233f;"><strong style="display:block;">${escapeHtml(item.description)}</strong><span style="display:block;margin-top:5px;color:#526174;font-size:13px;">${escapeHtml(item.reference)}</span>${item.brand ? `<span style="display:block;margin-top:4px;color:#526174;font-size:12px;">Marca: ${escapeHtml(item.brand)}</span>` : ""}</td>
    <td valign="top" align="right" style="padding:14px 16px;border-bottom:1px solid #e5e9ef;color:#12233f;font-size:13px;white-space:nowrap;">${escapeHtml(item.priceLabel)}<br><strong style="display:inline-block;margin-top:6px;">${item.quantity} ud.</strong></td>
  </tr>`).join("");
  const textItems = items.map((item) => [
    `- ${item.description} (${item.reference})`,
    `  Descripción: ${item.description}`,
    item.brand ? `  Marca: ${item.brand}` : null,
    `  Precio orientativo: ${item.priceLabel}`,
    `  Unidades: ${item.quantity}`,
  ].filter(Boolean).join("\n")).join("\n\n");
  return emailLayout({
    title: "Nueva solicitud de piezas",
    eyebrow: "VICTIKER · RECAMBIOS",
    intro: "Hay una nueva selección de piezas pendiente de revisar.",
    content: `${detailTable(details)}<div style="margin-top:28px;"><p style="margin:0 0 10px;color:#12233f;font-size:15px;font-weight:800;">Piezas seleccionadas</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e9ef;border-collapse:separate;border-spacing:0;"><thead><tr style="background:#f4f7fa;"><th align="left" style="padding:11px 16px;color:#526174;font-size:11px;letter-spacing:.08em;text-transform:uppercase;">Pieza y descripción</th><th align="right" style="padding:11px 16px;color:#526174;font-size:11px;letter-spacing:.08em;text-transform:uppercase;">Precio / uds.</th></tr></thead><tbody>${itemRows}</tbody></table></div>`,
    text: `NUEVA SOLICITUD DE PIEZAS\n\n${details.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\nPIEZAS\n${textItems}`,
    items,
  });
}

function emailLayout({ title, eyebrow, intro, content, text, items = [] }) {
  return {
    subject: `[Victiker] ${title}`,
    text,
    items,
    html: `<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#edf1f5;font-family:Arial,sans-serif;color:#12233f;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 16px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;"><tr><td style="padding:30px 34px;background:#092350;"><p style="margin:0 0 16px;color:#f28c28;font-size:11px;font-weight:800;letter-spacing:.13em;">${eyebrow}</p><h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.15;">${title}</h1></td></tr><tr><td style="padding:32px 34px;"><p style="margin:0 0 24px;color:#526174;font-size:16px;line-height:1.55;">${intro}</p>${content}</td></tr><tr><td style="padding:20px 34px;background:#f4f7fa;color:#526174;font-size:12px;line-height:1.5;">Enviado desde la web de Victiker · Este correo es una notificación interna.</td></tr></table></td></tr></table></body></html>`,
  };
}

function detailTable(rows) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${rows.map(([label, value]) => `<tr><td valign="top" style="width:38%;padding:11px 0;border-bottom:1px solid #e5e9ef;color:#526174;font-size:13px;">${escapeHtml(label)}</td><td style="padding:11px 0 11px 16px;border-bottom:1px solid #e5e9ef;color:#12233f;font-size:14px;font-weight:700;white-space:pre-wrap;">${escapeHtml(value)}</td></tr>`).join("")}</table>`;
}

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 50).flatMap((item) => {
    const title = cleanText(item?.title, 250);
    const description = cleanText(item?.description || title, 1000);
    const reference = cleanText(item?.reference, 120);
    const quantity = Number.parseInt(item?.quantity, 10);
    const imageUrl = safeImageUrl(item?.imageUrl);
    const price = Number(item?.price);
    const brand = cleanText(item?.brand, 120);
    return title && description && reference && Number.isInteger(quantity) && quantity > 0 && quantity <= 1000
      ? [{ title, description, reference, quantity, imageUrl, brand, priceLabel: Number.isFinite(price) && price >= 0 ? formatPrice(price, item?.currency) : "Precio a confirmar" }]
      : [];
  });
}

function safeImageUrl(value) {
  const raw = cleanText(value, 2000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function formatPrice(value, currency = "EUR") {
  try { return new Intl.NumberFormat("es-ES", { style: "currency", currency: currency || "EUR" }).format(value); }
  catch { return `${value} ${currency || "EUR"}`; }
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

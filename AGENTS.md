# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

Mobile hero behavior: treat the hero background as a static composition on touch layouts. Do not rely on cursor/parallax interaction there; arrange the motorcycle, technician, and boat as distinct left/center/right background zones, and keep the Victiker emblem large and centered above the hero copy.

Mobile hero preference: hide the three vehicle cutout images and show the complete transparent VICTIKER logo, including the name and service offering, centered above the copy.

Mobile/header contrast preference: avoid navy-on-navy branding; use a light, cool background so the royal-blue logo, orange accent, and text remain clearly readable. Keep the mobile hero as one coherent solid surface, without the photographic base texture, floating logo/content cards, or an eyebrow line over the logo.

Solicitud de repuestos: mientras haya piezas, mantén una barra fija y discreta en el catálogo con acceso claro a revisar y enviar la solicitud. Tras añadir, muestra únicamente una confirmación visual pequeña sobre el botón de la barra durante tres segundos.

Admin console preference: use a restrained, premium product-console language inspired by Vercel/OpenAI. Avoid prominent colored top borders, overly rounded card treatments, decorative color blocks, and other motifs that make the UI feel AI-generated; prefer neutral surfaces, thin borders, precise typography, black primary actions, and limited semantic accents.

Admin catalog preference: keep guidance in the relevant row or control instead of a general instruction box. Show Bihr references as synchronized data and retain a visible, unavailable edit icon with a tooltip explaining that Bihr API data cannot be edited.

Pedidos y citas: no se asignan estados desde el panel; la gestión interna se limita a guardar notas.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

Landing specialties: Moto and Embarcación are photographic, interactive catalogue links to `/repuestos/moto` and `/repuestos/barco`.

Portada comercial: conservar el hero y su consulta con IA. Debajo, ordenar la portada como taller móvil, dos accesos fotográficos interactivos al catálogo (Moto y Embarcación), cuatro columnas con información cierta sobre servicios y trato, y un cierre «Más kilómetros. Más historias». Moto enlaza a `/repuestos/moto` y Embarcación a `/repuestos/barco`. Las imágenes del taller y las categorías pueden llevar un parallax vertical muy leve; desactivarlo con `prefers-reduced-motion`.

Admin navigation: keep Cerrar sesión visible at the bottom of the desktop sidebar, independently of the content length.

WhatsApp: mantener únicamente el acceso circular flotante abajo a la derecha en las páginas públicas, sin tapar la barra de solicitud de repuestos.

Portada: el hero debe ofrecer una consulta con IA moderna y profesional. El usuario describe la incidencia; la web orienta, muestra piezas relacionadas mediante embeddings y facilita el contacto con Víctor para una revisión real. La IA no confirma diagnósticos ni compatibilidad.

Hero IA: la consulta debe sentirse integrada en el hero, no como una tarjeta superpuesta. Mantener escritorio y móvil limpios, con pocas etiquetas; durante la espera, mostrar actividad y contexto útil. Enseñar piezas solo cuando la petición las justifique.

Hero IA en móvil: componer titular, explicación y consulta como una sola pieza compacta. Evitar que la IA parezca una segunda sección o una caja de color independiente; mantener visible y claro el campo de consulta.

Portada: el título principal debe presentar de forma general el taller de Víctor y sus servicios para motos y embarcaciones. La IA es una ayuda dentro del hero; descríbela con lenguaje natural y breve, sin un aviso técnico prominente bajo el formulario.

La consulta de IA debe explicar, antes del campo de texto, qué obtiene el visitante: orientación sobre el problema y piezas relacionadas cuando proceda. El título principal debe hablar del taller y no parecer el título de un catálogo.

Orientación IA: personalizar la respuesta con los detalles concretos y distinguir consultas preventivas de averías actuales. Si alguien pide hacerse visible ante una posible avería nocturna, priorizar consejos de seguridad y ofrecer equipamiento reflectante del catálogo cuando exista; no tratar toda situación de seguridad como prohibición absoluta de mostrar productos. El botón de contacto con Víctor en la respuesta lleva un pulso naranja discreto y respeta movimiento reducido.

Cuando la orientación recomienda artículos que sí existen en el catálogo, enseñarlos dentro de la respuesta como fichas compactas con imagen, nombre, precio y disponibilidad, y ofrecer "Ver más productos" para abrir la búsqueda pertinente. No dejar la respuesta en una promesa de buscar opciones si ya se pueden mostrar resultados.

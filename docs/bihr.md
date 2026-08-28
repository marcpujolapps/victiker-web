# Integración del catálogo Bihr

Victiker utiliza el catálogo oficial `EssentialHardPart` de la API eBihr v2.1. Este catálogo contiene referencias, descripciones, precios con IVA, stock, categorías y la URL completa de la imagen principal.

## Estrategia de datos e imágenes

- Firestore conserva los campos de producto necesarios para búsquedas rápidas y el historial de sincronización.
- `imageUrl` apunta al CDN de Bihr. Las imágenes no se descargan ni se copian a Firebase Storage.
- Si Bihr retira o cambia una imagen, el catálogo muestra un placeholder sin romper la ficha.
- Las piezas que ya no aparecen en un catálogo completo se archivan automáticamente.
- La sincronización crea o actualiza las categorías principales de Bihr con el prefijo `bihr-`.
- La web sigue consultando Firestore; las credenciales y el token temporal de Bihr nunca llegan al navegador.

## Activación

Las credenciales son el código de cliente Bihr (`BIHR_USERNAME`) y la MacKey (`BIHR_PASSWORD`). Se guardan en `functions/.env`, que está excluido de Git y solo se incorpora a la configuración privada de las Functions durante el despliegue:

```dotenv
BIHR_USERNAME=tu_codigo_de_cliente
BIHR_PASSWORD=tu_mackey
```

No uses estas variables con el prefijo `VITE_`: nunca deben llegar al navegador.

Después se despliegan las Functions y la configuración de Firestore:

```sh
npx -y firebase-tools@latest deploy --only functions,firestore:rules,firestore:indexes --project victiker-taller
```

La tarea automática se ejecuta todos los días a las 05:30, hora de Madrid. Un administrador también puede iniciarla en **Administración → Importaciones → Catálogo Bihr** y consultar allí el resultado más reciente.

## Verificación local

```sh
npm --prefix functions test
npm run build
npm run test:sites
```

Las pruebas cubren la conservación de ceros iniciales en las referencias, la lectura del ZIP/CSV y tanto la descarga inmediata como el flujo asíncrono con ticket de Bihr.

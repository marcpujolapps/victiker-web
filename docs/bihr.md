# Integración del catálogo Bihr

Victiker utiliza el catálogo oficial `EssentialHardPart` de la API eBihr v2.1. Este catálogo contiene referencias, descripciones, precios con IVA, stock, categorías y la URL completa de la imagen principal.

## Sincronización incremental

eBihr documenta la generación y descarga del catálogo completo `EssentialHardPart`, pero no ofrece para este catálogo un filtro por fecha, delta, checksum/version reutilizable ni un contrato de `ETag`/`Last-Modified`. Por eso Victiker descarga el catálogo completo y evita el coste de reescribirlo:

- Cada producto se normaliza al modelo actual y se calcula un SHA-256 determinista de sus campos de catálogo. El hash excluye `updatedAt`, `syncId`, `syncedAt` y otros metadatos operativos.
- Tras una ejecución correcta se guarda una manifest comprimida en Cloud Storage, `bihr-sync/manifests/essential-hard-part-v1.json.gz`. Su `schemaVersion` y nombre de catálogo hacen versionable el formato y contiene `referenceNormalized -> { hash, documentId }` más los hashes de taxonomías.
- En la siguiente ejecución se lee esa única manifest, se comparan los hashes en memoria y Firestore recibe solamente altas y modificaciones. Una ejecución con el mismo catálogo hace **0 lecturas de productos y 0 escrituras de productos**; sí hace una lectura de Storage de la manifest y no reescribe taxonomías sin cambios.
- Las referencias ausentes se archivan mediante los identificadores de la manifest, sin recorrer `catalog`. El archivado se cancela si hay filas inválidas, menos de 1.000 referencias, o si desaparece más del 20 % del catálogo anterior.
- La primera ejecución tras activar este sistema es una importación completa: escribe el catálogo y hace una exploración única de los productos Bihr existentes para archivar referencias heredadas ausentes. Las ejecuciones posteriores no realizan esa exploración.
- La manifest solo se reemplaza una vez finalizadas las escrituras y archivados. Si falla el trabajo, la manifest válida anterior se conserva. El bloqueo en `integrations/bihr` impide sincronizaciones concurrentes.
- Las escrituras se envían en lotes de 250 con un máximo de 4 lotes simultáneos (2 para archivados), reintentos con espera exponencial y progreso persistido. Así una carga completa avanza en paralelo sin abrir una cola ilimitada contra Firestore.
- Una ejecución interrumpida libera su bloqueo después de 35 minutos. Al iniciar la siguiente, la ejecución anterior queda marcada como fallida en lugar de bloquear indefinidamente la administración.

En la administración, **Forzar importación completa** mantiene disponible una recuperación manual: reescribe todas las referencias descargadas, pero conserva las mismas protecciones de validez y archivado.

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

La tarea automática se ejecuta cada lunes a las 05:30, hora de Madrid. Un administrador también puede iniciarla en **Administración → Importaciones → Motos · Catálogo Bihr** y consultar allí el resultado y el progreso más recientes.

La importación manual de barco acepta CSV con las columnas `Referencia`, `Descripción`, `Precio`, `Descuento`, `Categoría` y `Subcategoría`. Solo `Referencia` es obligatoria; el tipo se fija a `barco` y las taxonomías se crean automáticamente a partir de las dos últimas columnas. El panel permite descargar `public/muestra-catalogo-barco.csv` como plantilla exacta.

## Verificación local

```sh
npm --prefix functions test
npm run build
npm run test:sites
```

Las pruebas cubren la conservación de ceros iniciales, ZIP/CSV, descarga directa y asíncrona, hashing determinista, clasificación de cambios, importación inicial, imágenes, respuesta incompleta y la segunda sincronización idéntica sin escrituras.

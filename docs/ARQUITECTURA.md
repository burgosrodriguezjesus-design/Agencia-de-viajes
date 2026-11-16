# Arquitectura

## Visión general

```
Navegador ──▶ Next.js 16 (App Router, React 19, TypeScript)
               │
               ├─ Páginas (Server Components) ───────────────┐
               ├─ Server Actions (mutaciones)                │   sesión del usuario
               ├─ Route Handlers                             ├──────────────────────▶ Supabase
               │    /api/agents/chat        (SSE)            │   (Auth · PostgreSQL + RLS · Storage)
               │    /api/trips/:id/generate (SSE)            │
               │    /api/stripe/*  /api/go  /api/account/*   ┘
               │
               └─ lib/agents ──▶ API de Claude (Anthropic)
                    │
                    └─ herramientas ──▶ lib/providers
                                          ├─ Duffel (vuelos)        · requiere token
                                          ├─ LiteAPI (hoteles)      · requiere clave
                                          ├─ Wikipedia / OSM        · lugares y restaurantes
                                          ├─ Open-Meteo             · geocodificación y tiempo
                                          └─ enlaces de reserva     · sin API
```

Decisiones principales:

- **Monolito modular en Next.js.** Un solo despliegue (Vercel u otro) para la primera versión. La lógica de negocio vive en `src/lib`, separada de la interfaz, para poder extraer servicios más adelante sin reescribir.
- **Supabase como backend.** PostgreSQL gestionado, autenticación y almacenamiento, con la seguridad expresada en la base de datos (RLS) en lugar de repartida por el código.
- **La capa `domain` no tiene dependencias.** Precios, presupuesto, rutas y horarios son funciones puras con tests: son las reglas que no pueden fallar.
- **Adaptadores intercambiables.** Cada proveedor externo está detrás de un módulo pequeño de `lib/providers`. Cambiar Duffel por otro proveedor de vuelos es tocar un fichero.

## Base de datos

Esquema en `supabase/migrations/`: `0001_init.sql` (tablas, RLS, funciones) y `0002_privileges.sql` (permisos por columna y supresión de cuenta).

| Tabla | Para qué |
| --- | --- |
| `profiles` | Datos del usuario y plan (`free`/`premium`). Se crea sola al registrarse |
| `subscriptions` | Estado de la suscripción de Stripe |
| `trips` | El viaje: destino, fechas, viajeros, presupuesto, tipo, ritmo, preferencias |
| `trip_members` | Colaboradores con rol `viewer` o `editor` |
| `trip_invites` | Enlaces públicos de solo lectura e invitaciones de colaborador |
| `trip_days` | Título, notas y plan de lluvia de cada día |
| `itinerary_items` | Actividades, comidas y traslados. `day_date` nulo = idea guardada sin programar |
| `trip_options` | Alternativas comparables: vuelos, hoteles, transporte… con su nivel (`cheapest`/`best_value`/`premium`) |
| `budget_suggestions` | Propuestas de ahorro con importe actual, alternativo y base (`verified`/`estimate`) |
| `documents` | Metadatos de billetes y reservas; el fichero está en Storage |
| `chat_messages` | Conversación con el asistente |
| `agent_runs` | Uso de los agentes: límite mensual del plan y consumo de tokens |
| `affiliate_clicks` | Clics de salida a proveedores (proveedor y host, nunca la URL) |

### Procedencia de precios

`itinerary_items` y `trip_options` comparten los campos `price_amount`, `price_currency`, `price_status`, `price_source` y `price_checked_at`. `price_status` es la pieza central de la política de transparencia:

| Valor | Significado | Quién lo escribe |
| --- | --- | --- |
| `verified` | Devuelto por la API de un proveedor | Solo el código del adaptador |
| `user` | Introducido o confirmado por el usuario | Solo el usuario |
| `free` | Gratuito | Usuario o agente |
| `estimate` | Estimación | Agente (etiquetada «Estimación IA») |
| `unknown` | Sin precio | — |

### Seguridad

- **RLS en todas las tablas.** Las funciones `private.can_view_trip` y `private.can_edit_trip` centralizan el permiso; cada tabla hija del viaje las usa.
- **Sin acceso anónimo a tablas.** Lo público pasa por funciones concretas: `get_shared_trip(token)` devuelve solo el itinerario (ni documentos, ni conversación, ni presupuesto).
- **Columnas sensibles protegidas.** Un usuario no puede modificar `profiles.plan`, `stripe_customer_id` ni `trips.owner_id` (permisos por columna). El plan solo cambia desde el webhook de Stripe con la clave secreta.
- **Límites en la base de datos.** El tope de un viaje del plan gratuito es un *trigger*, no solo una comprobación de interfaz. El uso de agentes no se puede borrar ni antedatar.
- **Documentos privados.** Bucket no público, rutas `<trip_id>/<fichero>`, políticas ligadas al permiso sobre el viaje y enlaces firmados de 5 minutos.
- **RGPD.** Exportación completa en JSON (`/api/account/export`) y supresión de cuenta (`delete_my_account`) con borrado en cascada.

## Sistema multiagente

### Agentes

| Agente | Papel | Herramientas principales |
| --- | --- | --- |
| **Asistente personal** | Interlocutor único; hace los cambios directos y delega lo demás | Editar itinerario y viaje, `consultar_especialista` |
| **Experto en vuelos** | Aeropuertos, escalas, equipaje, coste real | `buscar_vuelos`, `guardar_opciones`, `enlaces_reserva` |
| **Experto en hoteles** | Zonas, calidad-precio, distancia, impuestos | `buscar_hoteles`, `buscar_lugares`, `guardar_opciones` |
| **Experto en experiencias** | Selección de planes para ese viajero | `buscar_lugares`, `buscar_restaurantes`, `anadir_actividades` |
| **Arquitecto de itinerarios** | Días que fluyen, a ritmo, con plan de lluvia | `mover_actividades`, `organizar_dia`, `prevision_tiempo` |
| **Optimizador de presupuesto** | Dónde gastar menos, con números | `buscar_vuelos`, `buscar_hoteles`, `proponer_ahorros` |

### Cómo colaboran

Patrón de **pizarra compartida con orquestador**: el viaje en la base de datos es el estado común. Ningún agente pasa su memoria a otro; cada uno lee el estado real con `ver_viaje` y deja su trabajo guardado.

**Generación inicial** (`lib/agents/pipeline.ts`):

```
preparación ─▶ experiencias ─▶ itinerario ─▶ vuelos ∥ hoteles ─▶ presupuesto
(geocodifica)  (guarda ideas)  (reparte y     (en paralelo)     (completa partidas
                                ordena días)                     y propone ahorros)
```

Cada etapa falla de forma aislada: si un agente no termina, el resto continúa y el usuario ve el aviso.

**Conversación** (`lib/agents/orchestrator.ts`): el asistente resuelve por sí mismo lo acotado («quita las actividades caras», «¿cuánto nos queda?») y delega con un encargo autosuficiente lo que requiere criterio de especialista («busca otro hotel más céntrico»). Puede lanzar varios especialistas en paralelo.

**Modo básico (sin clave de IA):** un itinerario algorítmico con lugares de Wikipedia, agrupados por cercanía (`clusterIntoDays`) y ordenados por ruta más corta (`optimizeOrder`). El producto es utilizable sin IA.

### Motor (`lib/agents/runtime.ts`)

- Bucle de uso de herramientas sobre la API de Claude con streaming.
- Entradas validadas con Zod antes de ejecutar; las inválidas vuelven al modelo como error.
- Herramientas de un mismo turno en paralelo; resultados devueltos juntos.
- No se ejecuta nada si la respuesta se cortó por `max_tokens` o el modelo declinó.
- Modelo configurable por variable de entorno (`AGENT_MODEL`, `AGENT_SPECIALIST_MODEL`); por defecto `claude-opus-5-5`, con *fallback* de servidor activado.
- El prompt de sistema de cada agente se cachea (*prompt caching*).

### Garantías que no dependen del prompt

1. Los esquemas de herramientas no admiten `verified` ni `user`.
2. El modelo no escribe URLs de reserva: se generan en `lib/providers/links.ts`.
3. Foto y fuente de un lugar solo se guardan si vienen de una búsqueda real de esa ejecución.
4. No existe herramienta de compra.
5. Las propuestas de ahorro entre dos opciones guardadas toman los importes de la base de datos, no del modelo.
6. Todo se ejecuta con la sesión del usuario: RLS aplica a los agentes.

## Integraciones externas

| Necesidad | Elegido | Estado | Alternativas |
| --- | --- | --- | --- |
| IA | Claude (Anthropic) | Implementado; requiere clave | — |
| Autenticación, BD, ficheros | Supabase | Activo | — |
| Vuelos | Duffel | Adaptador pendiente de validar | Kiwi, Travelpayouts. *Amadeus Self-Service cerró en julio de 2026* |
| Hoteles | LiteAPI (Nuitée) | Adaptador pendiente de validar | Hotelbeds, Expedia Rapid, Booking Demand API |
| Actividades | Enlaces a GetYourGuide y Viator | Activo (enlaces) | Sus APIs de socio, para precios dentro de la app |
| Mapas | Leaflet + OpenStreetMap | Activo | MapTiler, Mapbox, Google Maps |
| Lugares de interés | Wikipedia (+ OSM de reserva) | Activo | Google Places, Geoapify, Foursquare |
| Geocodificación y tiempo | Open-Meteo | Activo | Mapbox, Google |
| Pagos | Stripe | Implementado; requiere claves | — |
| Correo | Supabase Auth | Activo | SMTP propio (Resend, Postmark) |

### Riesgos conocidos de los datos abiertos

- **Wikimedia limita con dureza las peticiones anónimas desde IP de proveedores cloud.** Se comprobó durante el desarrollo. Mitigaciones ya incluidas: caché de 24 h por destino, una sola petición por generación, respeto de `Retry-After`, fuente de reserva en OSM y soporte de `WIKIMEDIA_ACCESS_TOKEN`. Para producción: configurar el token o contratar un proveedor de lugares con SLA.
- **Los teselas de `tile.openstreetmap.org` no admiten uso intensivo.** Antes de escalar, cambiar a un proveedor de teselas (una línea en `components/trip-map.tsx`).
- **Open-Meteo es gratuito solo para uso no comercial.** Con ingresos, pasar a su plan de pago o a otro geocodificador.
- **Overpass (restaurantes)** no se pudo verificar desde el entorno de desarrollo, que lo tenía bloqueado.

## Monetización en la arquitectura

- **Planes** en `lib/billing/plans.ts`: límites y agentes por plan. La comprobación se hace en el servidor (`run-guard.ts`) y, para los viajes, en la base de datos.
- **Suscripción:** Stripe Checkout (mensual/anual) → webhook firmado → `subscriptions` y `profiles.plan`. Portal de cliente para cambios y cancelación.
- **Afiliación:** identificadores por variable de entorno; los enlaces pasan por `/api/go`, que registra el clic y solo redirige a una lista cerrada de hosts.

## Despliegue

1. Proyecto en Vercel (o cualquier plataforma Node) con las variables de `.env.example`.
2. `NEXT_PUBLIC_SITE_URL` con el dominio definitivo, y el mismo valor en Supabase (*Site URL* y *Redirect URLs*).
3. Webhook de Stripe apuntando a `/api/stripe/webhook` con los eventos `checkout.session.completed` y `customer.subscription.*`.
4. Las rutas de agentes declaran `maxDuration = 300`: el plan de la plataforma debe permitir funciones de esa duración.

## Deuda técnica asumida en el MVP

- Limitación de peticiones por IP en las rutas públicas (`/api/places/suggest`).
- Tipos de base de datos escritos a mano (`lib/domain/types.ts`); conviene generarlos con Supabase.
- El reordenado guarda las posiciones fila a fila; con itinerarios muy largos convendría una RPC transaccional.
- Sin colaboración en tiempo real: los cambios de otro editor aparecen al recargar.
- Sin tests de extremo a extremo en el repositorio (se hicieron con Playwright durante el desarrollo).

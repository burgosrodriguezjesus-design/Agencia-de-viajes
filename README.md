# Agencia — agencIA de viajes

> *Tu próximo viaje, al mejor precio. Organizado por IA.*

Plataforma SaaS para planificar un viaje completo desde un único lugar: itinerario día a día, comparación de vuelos y alojamiento, presupuesto con detección de ahorro, documentos y un asistente que coordina a un equipo de agentes especializados.

El nombre («Agencia») y el subtítulo («agencIA de viajes») se cambian en `src/lib/brand.ts`.

## Qué funciona hoy y qué está pendiente

La regla del producto es **no simular nada**: cada integración aparece en la propia app como activa o pendiente (Cuenta → *Estado de las integraciones*).

| Área | Estado | Notas |
| --- | --- | --- |
| Cuentas, sesiones y permisos | ✅ Funciona | Supabase Auth + RLS en todas las tablas |
| Crear, editar, borrar y compartir viajes | ✅ Funciona | Enlace público de solo lectura e invitaciones de colaborador |
| Planificador visual con mapa | ✅ Funciona | Arrastrar y soltar; horarios y trayectos se recalculan; optimización de ruta |
| Itinerario básico con lugares reales | ✅ Funciona | Sin IA: Wikipedia + agrupación geográfica + ruta más corta |
| Comparador y presupuesto | ✅ Funciona | Tres alternativas, diferencias, coste total, ahorro solo con comparación real |
| Documentos del viaje | ✅ Funciona | Almacén privado, enlaces temporales |
| RGPD: exportar y eliminar datos | ✅ Exportar · ⏳ Eliminar | Eliminar la cuenta requiere aplicar `0003_…sql` o configurar `SUPABASE_SECRET_KEY` |
| Enlaces de reserva y afiliación | ✅ Funciona | Enlaces ya rellenados; identificador de afiliado opcional y siempre señalado |
| Los 6 agentes de IA | 🔑 Requiere `ANTHROPIC_API_KEY` | Implementados y con tests; **no ejecutados contra la API real** en el desarrollo por falta de clave |
| Precios de vuelos verificados | 🔑 Requiere `DUFFEL_ACCESS_TOKEN` | Adaptador escrito contra la documentación; pendiente de validar con credenciales |
| Precios de hoteles verificados | 🔑 Requiere `LITEAPI_KEY` | Ídem |
| Suscripción Premium | 🔑 Requiere claves de Stripe | Checkout, portal y webhook implementados; sin claves, el botón avisa de que no hay pagos |
| Seguimiento de precios | ⏳ No implementado | Necesita proveedores de precios activos y una tarea programada |
| Viajes multidestino | ⏳ Parcial | Un destino principal; se pueden añadir días y lugares de otras ciudades al itinerario |

## Despliegue actual

- **Web:** https://agencia-de-viajes-mocha.vercel.app (proyecto `agencia-de-viajes` en Vercel, enlazado a este repositorio: cada *push* a la rama de producción se despliega solo).
- **Base de datos:** proyecto `agencia-de-viajes` en Supabase (región de París).
- Las funciones del servidor se ejecutan en París (`cdg1`), junto a la base de datos.
- La web de producción es pública; las versiones de prueba (*preview*) requieren iniciar sesión en Vercel.

Pendiente en los paneles (no se puede hacer por API):

1. **Supabase → Authentication → URL Configuration:** poner la URL de la web en *Site URL* y añadir `https://agencia-de-viajes-mocha.vercel.app/auth/callback` a *Redirect URLs*. Sin esto, el enlace del correo de confirmación de las cuentas nuevas apunta a `localhost`.
2. **Vercel → Settings → Environment Variables:** añadir `ANTHROPIC_API_KEY` para activar los agentes de IA, y volver a desplegar.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y rellena los valores
npm run dev                  # http://localhost:3000
```

Variables imprescindibles: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `NEXT_PUBLIC_SITE_URL`. El resto activa funciones concretas; están explicadas en `.env.example`.

### Base de datos

El esquema está en `supabase/migrations/`:

1. `0001_init.sql` — tablas, políticas RLS, funciones y almacén de documentos. **Aplicado.**
2. `0002_column_guards.sql` — guardas que impiden a un usuario cambiar su plan, el propietario de un viaje o su registro de uso de IA. **Aplicado y comprobado** contra la base de datos real.
3. `0003_account_erasure_and_hardening.sql` — función de supresión de cuenta y permisos por columna adicionales. **Pendiente**: Supabase exige confirmarlo a mano. Para aplicarlo, pega el fichero en *SQL Editor* del panel de Supabase y pulsa *Run*. Hasta entonces, «Eliminar mi cuenta» solo funciona si el servidor tiene `SUPABASE_SECRET_KEY`.

En el panel de Supabase conviene además:

- **Authentication → URL Configuration:** poner la URL pública en *Site URL* y añadir `https://tu-dominio/auth/callback` a *Redirect URLs*.
- **Authentication → Emails:** configurar un SMTP propio (por ejemplo Resend) antes de producción.

### Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Compilación y servidor de producción |
| `npm test` | Tests (Vitest) |
| `npm run typecheck` | Comprobación de tipos |
| `npm run lint` | ESLint |

## Cómo está organizado

```
src/
  app/
    page.tsx                 Página de inicio
    (auth)/                  Entrar, registro, recuperar contraseña
    app/                     Zona privada: mis viajes, nuevo viaje, cuenta
      viajes/[id]/           Espacio de trabajo: resumen, itinerario, vuelos, hoteles,
                             experiencias, ahorro, documentos, compartir
    compartido/[token]/      Vista pública de solo lectura
    api/                     Agentes (SSE), Stripe, exportación, salida a proveedores
    actions/                 Server Actions (mutaciones)
  components/                Interfaz (planificador, mapa, asistente, comparador…)
  lib/
    domain/                  Lógica pura y probada: precios, presupuesto, rutas, horarios
    agents/                  Motor multiagente, herramientas, definiciones y flujo
    providers/               Adaptadores externos: vuelos, hoteles, lugares, tiempo, enlaces
    billing/                 Planes y Stripe
    supabase/                Clientes de navegador y servidor
supabase/migrations/         Esquema de PostgreSQL
tests/                       Tests de dominio, enlaces y agentes
docs/                        Arquitectura y estrategia de lanzamiento
```

## Principios que el código impone

- **Los precios llevan procedencia.** `verified` (proveedor), `user` (confirmado por el usuario), `free`, `estimate` o `unknown`. La interfaz los pinta distinto y el total separa lo confirmado de lo estimado.
- **El modelo no puede fabricar precios verificados.** Los esquemas de las herramientas de los agentes solo admiten `estimate`, `free` o `unknown`; los verificados los escribe el adaptador del proveedor. Hay un test que lo comprueba.
- **No hay ahorro sin comparación.** `compareSavings` devuelve `null` si falta un precio; solo es «verificado» si los dos lo son.
- **La afiliación no ordena.** La función que elige las tres alternativas no recibe el dato de afiliación.
- **Nadie reserva por el usuario.** No existe ninguna herramienta ni ruta de compra.
- **RLS como autoridad.** Los agentes trabajan con la sesión del usuario: no pueden leer ni escribir lo que él no pueda.

## Documentación

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) — arquitectura, base de datos, colaboración entre agentes, APIs y seguridad.
- [`docs/LANZAMIENTO.md`](docs/LANZAMIENTO.md) — fases del producto, modelo de negocio y plan de salida al mercado.

## Avisos

- Los textos de `/legal/*` son **borradores** y deben revisarse con un profesional antes del lanzamiento. Faltan los datos de la sociedad (`src/lib/brand.ts`).
- Open-Meteo, Wikipedia y OpenStreetMap son datos abiertos con condiciones de uso propias; para tráfico comercial hay que revisar sus licencias y límites (ver `docs/ARQUITECTURA.md`).

# Puesta en marcha: lo que queda por hacer en los paneles

La web está publicada en https://agencia-de-viajes-mocha.vercel.app. Estos son los pasos que requieren tu cuenta o tu identidad y que nadie puede hacer por ti. Están ordenados de más a menos importante; cada uno lleva unos minutos.

Dónde se ponen las claves: **Vercel → proyecto `agencia-de-viajes` → Settings → Environment Variables**. Tras añadir o cambiar una variable hay que volver a desplegar: **Deployments → último despliegue → ⋯ → Redeploy**.

> Nunca pegues una clave secreta en un chat, un correo o el repositorio. Solo en el panel de Vercel.

## 1. Activar los agentes de IA (Claude)

1. Entra en https://console.anthropic.com, crea una cuenta y añade saldo (Billing).
2. **API Keys → Create Key**. Copia la clave (empieza por `sk-ant-`).
3. En Vercel añade la variable `ANTHROPIC_API_KEY` con esa clave (entornos Production y Preview) y vuelve a desplegar.

Hasta entonces la app funciona en «modo básico»: itinerarios con lugares reales, sin asistente ni estimaciones.

## 2. Que funcione el registro de cuentas nuevas

En https://supabase.com/dashboard → proyecto `agencia-de-viajes` → **Authentication → URL Configuration**:

- **Site URL:** `https://agencia-de-viajes-mocha.vercel.app` (o tu dominio, cuando lo tengas).
- **Redirect URLs → Add URL:** `https://agencia-de-viajes-mocha.vercel.app/**`

Sin esto, el enlace del correo de confirmación lleva a `localhost` y no abre.

Para producción, además: **Authentication → Emails → SMTP Settings** con un proveedor propio (por ejemplo Resend), porque el correo de pruebas de Supabase solo permite unos pocos envíos por hora.

## 3. Cobrar la suscripción Premium (Stripe)

El sistema de pagos ya está programado: página de pago segura de Stripe, suscripción mensual o anual, y un portal donde el cliente cambia la tarjeta, descarga facturas o cancela. Stripe guarda los datos de las tarjetas; la web nunca los ve. Solo faltan **dos claves**.

1. Crea tu cuenta en https://dashboard.stripe.com/register. Para cobrar dinero real Stripe te pedirá tus datos fiscales (autónomo o sociedad) y una cuenta bancaria: es obligatorio por ley y solo puedes hacerlo tú.
2. **Clave de Stripe:** en el panel de Stripe, **Desarrolladores → Claves de API → Clave secreta**. Añádela en Vercel como `STRIPE_SECRET_KEY`.
   - Para probar sin dinero real usa primero la clave del *modo de prueba* (empieza por `sk_test_`) y la tarjeta de prueba `4242 4242 4242 4242`.
3. **Clave secreta de Supabase:** en Supabase, **Settings → API Keys → Secret key**. Añádela en Vercel como `SUPABASE_SECRET_KEY`. Es la que permite al servidor activar Premium tras el pago (y también activa el botón «Eliminar mi cuenta»).
4. Vuelve a desplegar. En **Cuenta → Estado de las integraciones** debe aparecer Stripe como «Activa».

Los precios (9,99 €/mes y 79 €/año) se cambian en `src/lib/billing/plans.ts`; no hay que crear productos en Stripe.

Recomendado antes de vender en serio:

- **Webhook**, para que las cancelaciones y renovaciones se reflejen al instante: en Stripe, **Desarrolladores → Webhooks → Añadir destino**, URL `https://TU-WEB/api/stripe/webhook`, eventos `checkout.session.completed` y `customer.subscription.*`. Copia el «secreto de firma» y añádelo en Vercel como `STRIPE_WEBHOOK_SECRET`. Sin webhook, el plan se actualiza cuando el cliente vuelve del pago o abre su página de Cuenta.
- **Portal de cliente:** en Stripe, **Configuración → Facturación → Portal de clientes → Activar**.
- **Impuestos:** revisa con tu gestor el IVA de servicios digitales (Stripe Tax lo puede calcular).

## 4. Poner un dominio propio

Un dominio es la dirección de la web (por ejemplo `agenciadeviajesia.com`). Cuesta entre 10 y 20 € al año para un `.com` o `.es`.

**Opción A — comprarlo en Vercel (lo más sencillo):**

1. Vercel → proyecto → **Settings → Domains → Buy**.
2. Busca el nombre, paga con tarjeta y Vercel lo conecta solo, con certificado de seguridad incluido.

En el momento de escribir esto estaban libres `agenciadeviajesia.com`, `agenciaviajesia.com` y `agenciadeviajesia.es` (puede cambiar en cualquier momento).

**Opción B — ya tienes uno o lo compras en otro sitio (Namecheap, DonDominio, IONOS…):**

1. Vercel → proyecto → **Settings → Domains → Add** y escribe el dominio.
2. Vercel te muestra uno o dos registros DNS. Cópialos en el panel de quien te vendió el dominio (sección «DNS»). Normalmente:
   - registro `A` para `@` apuntando a la IP que indique Vercel, y
   - registro `CNAME` para `www` apuntando al valor que indique Vercel.
3. Espera a que Vercel marque el dominio como válido (de minutos a unas horas).

**Después de conectar el dominio, hay que actualizar tres sitios:**

1. Vercel: variable `NEXT_PUBLIC_SITE_URL` = `https://tudominio.com`, y volver a desplegar.
2. Supabase: *Site URL* y *Redirect URLs* (paso 2 de esta guía) con el nuevo dominio.
3. Stripe: la URL del webhook, si lo configuraste.

## 5. Botón «Eliminar mi cuenta»

Funciona en cuanto exista `SUPABASE_SECRET_KEY` (paso 3). Alternativa sin esa clave: pegar el fichero `supabase/migrations/0003_account_erasure_and_hardening.sql` en **Supabase → SQL Editor → Run**.

## 6. Antes de abrir al público

- Completar la razón social y el correo de contacto en `src/lib/brand.ts` y revisar los textos de `/legal` con un profesional.
- Eliminar el usuario de prueba `prueba-e2e@example.com` (Supabase → Authentication → Users).
- Activar la protección contra contraseñas filtradas (Supabase → Authentication → Passwords).

El resto de opciones (precios reales de vuelos y hoteles, afiliación) está en `.env.example` y en `docs/LANZAMIENTO.md`.

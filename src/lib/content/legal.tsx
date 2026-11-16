import type { ReactNode } from "react";
import { BRAND } from "../brand";
import { PHOTO_CREDITS } from "./credits";

// Textos legales de partida. IMPORTANTE: son borradores redactados para este
// MVP y deben ser revisados por un profesional antes del lanzamiento. Los
// datos entre corchetes están pendientes de completar.

export interface LegalDoc {
  title: string;
  updated: string;
  body: ReactNode;
}

const P = ({ children }: { children: ReactNode }) => <p className="leading-relaxed text-muted">{children}</p>;
const H = ({ children }: { children: ReactNode }) => <h2 className="pt-4 font-display text-2xl font-medium text-ink">{children}</h2>;
const L = ({ items }: { items: ReactNode[] }) => (
  <ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-muted">
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
);

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  privacidad: {
    title: "Política de privacidad",
    updated: "Borrador inicial",
    body: (
      <>
        <H>Quién es el responsable</H>
        <P>
          {BRAND.legalName}, con domicilio en [DOMICILIO] y NIF [NIF]. Contacto para cuestiones de privacidad:{" "}
          {BRAND.contactEmail}.
        </P>
        <H>Qué datos tratamos y para qué</H>
        <L
          items={[
            <><strong className="text-ink">Cuenta:</strong> correo electrónico, contraseña (cifrada, nunca la vemos) y, si lo indicas, tu nombre. Base legal: ejecución del contrato.</>,
            <><strong className="text-ink">Tus viajes:</strong> destinos, fechas, preferencias, itinerarios, opciones guardadas, conversaciones con el asistente y documentos que subas. Base legal: ejecución del contrato.</>,
            <><strong className="text-ink">Uso del servicio:</strong> número de consultas a los agentes de IA y clics en enlaces a proveedores (proveedor y fecha, no la URL completa). Base legal: interés legítimo en medir y prevenir abusos.</>,
            <><strong className="text-ink">Pagos:</strong> los gestiona Stripe. No almacenamos datos de tu tarjeta; solo el identificador de cliente y el estado de la suscripción.</>,
            <><strong className="text-ink">Comunicaciones comerciales:</strong> solo si marcas la casilla correspondiente. Base legal: consentimiento, que puedes retirar en cualquier momento desde tu cuenta.</>,
          ]}
        />
        <H>Inteligencia artificial</H>
        <P>
          Para generar itinerarios y responder en el asistente enviamos el contenido de tu viaje y tus mensajes a
          Anthropic (modelos Claude), que actúa como encargado del tratamiento. No enviamos tu correo ni tus documentos.
          No tomamos decisiones automatizadas con efectos jurídicos sobre ti.
        </P>
        <H>Con quién compartimos datos</H>
        <L
          items={[
            "Supabase (base de datos, autenticación y almacenamiento), con alojamiento en la Unión Europea.",
            "Anthropic (procesamiento de IA).",
            "Stripe (pagos), cuando contratas Premium.",
            "Proveedores de mapas y datos abiertos (OpenStreetMap, Open-Meteo, Wikimedia): reciben las consultas de lugares, no tu identidad.",
          ]}
        />
        <P>
          Cuando sigues un enlace a un proveedor externo (por ejemplo, para reservar), pasas a su web y se aplica su propia
          política. Si alguno de estos proveedores trata datos fuera del Espacio Económico Europeo, lo hace con las
          garantías previstas en el RGPD (cláusulas contractuales tipo). [REVISAR CON LOS CONTRATOS DEFINITIVOS]
        </P>
        <H>Cuánto tiempo los conservamos</H>
        <P>
          Mientras tengas la cuenta abierta. Si la eliminas, borramos tus datos de forma inmediata de los sistemas
          activos y de las copias de seguridad en el plazo de rotación de estas. Los datos de facturación se conservan
          el tiempo que exige la normativa fiscal.
        </P>
        <H>Tus derechos</H>
        <P>
          Acceso, rectificación, supresión, oposición, limitación y portabilidad. Los dos más habituales los ejerces tú
          mismo desde «Tu cuenta»: <strong className="text-ink">descargar todos tus datos</strong> en un archivo y{" "}
          <strong className="text-ink">eliminar la cuenta</strong>. Para cualquier otro, escríbenos a {BRAND.contactEmail}.
          También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).
        </P>
        <H>Seguridad</H>
        <P>
          Conexiones cifradas (HTTPS), control de acceso a nivel de fila en la base de datos (cada usuario solo accede a
          sus viajes y a los que le han compartido), documentos en un almacén privado con enlaces temporales y claves de
          servicio que nunca llegan al navegador.
        </P>
      </>
    ),
  },
  terminos: {
    title: "Términos y condiciones",
    updated: "Borrador inicial",
    body: (
      <>
        <H>Qué es {BRAND.name}</H>
        <P>
          Una herramienta de planificación de viajes asistida por inteligencia artificial, prestada por {BRAND.legalName}.{" "}
          <strong className="text-ink">No es una agencia de viajes ni un intermediario de reservas</strong>: no vende
          vuelos, alojamientos ni actividades, y no realiza reservas ni pagos en tu nombre. Cualquier contratación la
          haces tú directamente con el proveedor, bajo sus condiciones.
        </P>
        <H>Precios e información</H>
        <L
          items={[
            "Los precios marcados como «Precio verificado» proceden del proveedor indicado en el momento de la consulta y pueden cambiar hasta que reserves.",
            "Los precios marcados como «Estimación» son orientativos, calculados por IA para ayudarte a presupuestar. No son ofertas ni garantizan disponibilidad.",
            "Los horarios, trayectos y recomendaciones pueden contener errores. Confirma siempre horarios, entradas, requisitos de visado y condiciones sanitarias en las fuentes oficiales antes de viajar.",
            "Los tiempos de desplazamiento son aproximaciones calculadas por distancia.",
          ]}
        />
        <H>Tu cuenta</H>
        <P>
          Debes ser mayor de edad y facilitar un correo válido. Eres responsable de mantener la confidencialidad de tu
          contraseña y del contenido que subas. No puedes usar el servicio para fines ilícitos ni de forma que lo degrade
          para otros usuarios.
        </P>
        <H>Planes y pagos</H>
        <L
          items={[
            "El plan gratuito no tiene coste ni requiere tarjeta.",
            "Premium es una suscripción mensual o anual que se renueva automáticamente. El precio con impuestos se muestra antes de pagar.",
            "Puedes cancelar cuando quieras desde tu cuenta; conservas Premium hasta el final del periodo pagado.",
            "Como consumidor dispones de 14 días para desistir de la contratación, en los términos de la normativa de consumo. [REVISAR: tratamiento del desistimiento en servicios digitales ya iniciados]",
          ]}
        />
        <H>Enlaces de afiliación</H>
        <P>
          Algunos enlaces a proveedores son de afiliado y están identificados. Consulta la página de transparencia y
          afiliación para más detalle.
        </P>
        <H>Responsabilidad</H>
        <P>
          Prestamos el servicio con la diligencia debida, pero no respondemos de las decisiones de viaje que tomes ni de
          los servicios prestados por terceros (aerolíneas, alojamientos, organizadores de actividades). Nada de lo
          anterior limita los derechos que te reconoce la legislación de consumidores.
        </P>
        <H>Ley aplicable</H>
        <P>Legislación española. Para consumidores, los juzgados de su domicilio. [REVISAR]</P>
      </>
    ),
  },
  afiliacion: {
    title: "Transparencia y afiliación",
    updated: "Borrador inicial",
    body: (
      <>
        <H>Cómo ganamos dinero</H>
        <L
          items={[
            <><strong className="text-ink">Suscripción Premium</strong>, que pagan directamente los usuarios.</>,
            <><strong className="text-ink">Comisiones de afiliación:</strong> si reservas en un proveedor (por ejemplo, un hotel o una actividad) tras seguir un enlace marcado como «Enlace de afiliado», podemos recibir una comisión de ese proveedor. A ti no te cuesta nada más.</>,
          ]}
        />
        <H>Nuestros compromisos</H>
        <L
          items={[
            "Los enlaces de afiliado están siempre identificados como tales junto al propio enlace.",
            "Las comisiones no alteran el orden de las recomendaciones. Las alternativas se ordenan con una función que solo recibe precio y calidad; el dato de afiliación ni siquiera se le pasa. Esta regla está cubierta por pruebas automáticas del código.",
            "Mostramos también proveedores con los que no tenemos ningún acuerdo.",
            "Nunca presentamos una estimación como si fuera un precio real, y solo hablamos de ahorro cuando hay dos precios que comparar.",
            "No reservamos ni pagamos nada en tu nombre.",
          ]}
        />
        <H>Programas con los que la plataforma puede trabajar</H>
        <P>
          Booking.com, GetYourGuide, Viator y Skyscanner. Que un programa esté activo depende de la configuración de cada
          momento; puedes verlo en «Tu cuenta → Estado de las integraciones».
        </P>
      </>
    ),
  },
  cookies: {
    title: "Política de cookies",
    updated: "Borrador inicial",
    body: (
      <>
        <H>Solo cookies necesarias</H>
        <P>
          {BRAND.name} utiliza únicamente cookies técnicas imprescindibles para mantener tu sesión iniciada. No usamos
          cookies publicitarias ni de analítica de terceros, por lo que no mostramos un banner de consentimiento.
        </P>
        <L
          items={[
            <><strong className="text-ink">Sesión (Supabase Auth):</strong> identifica tu sesión para que no tengas que entrar en cada página. Caduca al cerrar sesión o al expirar.</>,
            <><strong className="text-ink">Preferencia de tema:</strong> se guarda en el almacenamiento local de tu navegador (no es una cookie) para recordar el modo claro u oscuro.</>,
          ]}
        />
        <P>
          Si en el futuro añadimos analítica o publicidad, actualizaremos esta página y te pediremos consentimiento antes
          de activar nada. Los mapas cargan imágenes desde OpenStreetMap, que recibe tu dirección IP como cualquier
          servidor web.
        </P>
      </>
    ),
  },
  creditos: {
    title: "Créditos de imágenes y datos",
    updated: "Actualizado con cada versión",
    body: (
      <>
        <H>Fotografías</H>
        <P>
          Las fotografías de la web proceden de Wikimedia Commons y se usan bajo sus respectivas licencias libres. Las
          imágenes de lugares dentro de cada viaje se cargan desde Wikipedia y enlazan a su página de origen.
        </P>
        {PHOTO_CREDITS.length > 0 ? (
          <ul className="space-y-2 text-sm leading-relaxed text-muted">
            {PHOTO_CREDITS.map((c) => (
              <li key={c.file}>
                <a href={c.source} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4">
                  {c.title}
                </a>{" "}
                — {c.author} · {c.license}
              </li>
            ))}
          </ul>
        ) : null}
        <H>Datos</H>
        <L
          items={[
            <>Mapas y restaurantes: © colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4">OpenStreetMap</a> (ODbL).</>,
            <>Lugares de interés y descripciones: <a href="https://www.wikipedia.org" target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4">Wikipedia</a> (CC BY-SA 4.0).</>,
            <>Previsión meteorológica y geocodificación: <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4">Open-Meteo</a> (CC BY 4.0) con datos de GeoNames.</>,
          ]}
        />
      </>
    ),
  },
};

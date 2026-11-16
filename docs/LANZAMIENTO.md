# Estrategia de lanzamiento

## El problema y la apuesta

Organizar un viaje obliga hoy a saltar entre buscadores de vuelos, portales de hoteles, mapas, blogs y hojas de cálculo. El coste real se descubre al final y nadie te dice si estás pagando de más.

La apuesta: **un equipo de especialistas que trabaja sobre un único plan y demuestra cada euro que ahorra**. La ventaja defendible no es «tener IA» (eso ya lo ofrece cualquiera), sino dos cosas difíciles de copiar deprisa:

1. **Confianza.** Precios con procedencia, ahorro solo con comparación y afiliación transparente. En un sector lleno de «ofertas» dudosas, es un posicionamiento.
2. **El viaje como espacio de trabajo.** Itinerario, opciones, presupuesto y documentos en un mismo sitio que se actualiza hablando.

## Fases del producto

### Fase 0 — Cerrar el MVP (antes de enseñarlo)

- [ ] Aplicar la migración de permisos pendiente en Supabase.
- [ ] Configurar `ANTHROPIC_API_KEY` y **probar los agentes de verdad** con 10-15 viajes variados. Ajustar prompts y límites con lo que salga.
- [ ] Medir el coste real por viaje generado (tabla `agent_runs`) antes de fijar precios y límites.
- [ ] Elegir nombre y dominio; completar datos legales; revisión de los textos legales por un profesional.
- [ ] SMTP propio para los correos de cuenta.
- [ ] Token de Wikimedia o proveedor de lugares con garantías.

### Fase 1 — Beta privada (30-50 personas)

Objetivo: comprobar que la gente termina de planificar un viaje real aquí.

- Reclutar a personas con un viaje en los próximos tres meses (círculo cercano, comunidades de viajeros).
- Todo gratis, Premium activado a mano.
- Hablar con cada usuario. Lo que importa: ¿habrían pagado?, ¿qué les hizo desconfiar?, ¿dónde se atascaron?
- Señal de éxito: más de la mitad vuelve al viaje en días distintos y comparte el itinerario con alguien.

### Fase 2 — Precios reales y primer ingreso

- Conectar **un** proveedor de precios verificados y validarlo. Hoteles primero: mejores comisiones y más margen de ahorro demostrable que en vuelos.
- Alta en programas de afiliación (Booking.com, GetYourGuide, Viator).
- Activar Stripe y Premium.
- Sustituir el ejemplo ilustrativo de la página de inicio por un caso real con precios verificados.

### Fase 3 — Crecimiento

- Seguimiento de precios con alertas (la función que más retiene y más justifica Premium).
- Viajes multidestino.
- Modo «durante el viaje»: qué toca ahora, cambios por lluvia, sin conexión.
- Colaboración en tiempo real para grupos.

## Modelo de negocio

| Vía | Cómo | Cuándo |
| --- | --- | --- |
| **Suscripción Premium** | 9,99 €/mes o 79 €/año (provisional, en `lib/billing/plans.ts`) | Fase 2 |
| **Afiliación** | Comisión del proveedor cuando el usuario reserva desde un enlace identificado | Fase 2 |
| **Viaje suelto** (a valorar) | Pago único por desbloquear todos los agentes en un viaje | Si la suscripción convierte mal |

Dos advertencias honestas:

- **La suscripción encaja mal con quien viaja una o dos veces al año**, que es la mayoría. Hay que probar pronto el pago por viaje: el modelo de datos ya lo permite (el plan se comprueba en un solo punto).
- **El precio debe salir del coste medido, no al revés.** Cada generación completa ejecuta cinco agentes. Los modelos se configuran por variable de entorno: si el coste por viaje no cuadra con el precio, los especialistas pueden pasar a un modelo más económico sin tocar código.

### Qué vigilar en los números

- Coste de IA por viaje generado y por usuario activo al mes.
- Activación: de registro a itinerario generado.
- Profundidad: usuarios que eligen vuelo y hotel, que suben documentos, que comparten.
- Conversión a Premium y clics de salida a proveedores por viaje.
- Retención: ¿vuelven para el siguiente viaje?

## Salida al mercado

**A quién primero.** Parejas y grupos pequeños de 28-45 años que organizan ellos mismos viajes de una a dos semanas a destinos con mucho que planificar (Japón, Italia, costa oeste de EE. UU.). Planifican con semanas de antelación, comparan mucho y agradecen el orden. No es el viajero de escapada de fin de semana ni el de paquete cerrado.

**Canales, por orden de esfuerzo:**

1. **El propio producto.** Cada itinerario compartido es una página pública con una llamada a probarlo. Es el canal más barato: cuidar esa página.
2. **Contenido con intención de búsqueda.** Itinerarios reales generados con la herramienta («Kioto en 5 días», «Roma con niños»), cada uno con un botón «adáptalo a tus fechas». Tráfico que llega justo cuando alguien está planificando.
3. **Comunidades de viajeros.** Foros y grupos por destino, aportando itinerarios útiles, no publicidad.
4. **Creadores de viajes pequeños**, con enlaces de afiliación propios hacia la herramienta.
5. **Publicidad de pago:** solo cuando se conozca el valor de un usuario. Antes, es quemar dinero.

**Mensaje.** No «IA que planifica tu viaje», que suena a lo de todos. Mejor: *«Sabes cuánto cuesta tu viaje antes de reservar, y dónde puedes pagar menos»*.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La IA recomienda algo que no existe o está cerrado | Lugares con fuente enlazada; sugerencias sin fuente marcadas «Sin verificar»; aviso de confirmar horarios |
| Coste de IA por encima del ingreso | Límites por plan ya implementados; medir antes de escalar; modelos configurables |
| Dependencia de un proveedor de precios | Adaptadores intercambiables; el producto funciona sin precios verificados |
| Los grandes (buscadores, portales) añaden lo mismo | Competir en confianza e independencia: ellos tienen incentivos para ordenar por comisión |
| Acceso a APIs de viajes cada vez más restringido | Empezar por afiliación con enlaces, que no requiere API |
| Normativa (RGPD, consumo, viajes combinados) | No se venden viajes ni se intermedia en reservas; revisión legal antes de lanzar |

## Lista de comprobación para abrir al público

- [ ] Migración de permisos aplicada y asesores de seguridad de Supabase sin avisos.
- [ ] Agentes probados con viajes reales.
- [ ] Datos de la sociedad y textos legales revisados.
- [ ] Dominio, correo transaccional y URL configurados en Supabase.
- [ ] Stripe en modo real con el webhook verificado de extremo a extremo.
- [ ] Al menos un programa de afiliación activo.
- [ ] Monitorización de errores y de coste de IA.
- [ ] Fotografías de la página de inicio alojadas en el propio dominio.
- [ ] Usuario de prueba `prueba-e2e@example.com` eliminado de la base de datos.

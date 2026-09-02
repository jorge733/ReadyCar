# ReadyCar

Gestión personal de vehículos, documentos y vencimientos. Sitio: https://appreadycar.vercel.app/

## Funciones

- Acceso con correo o Google, recuperación de contraseña, verificación de correo y eliminación de cuenta con autenticación reciente.
- Perfil, garaje y preferencias sincronizados por cuenta. Recuperación explícita del garaje guardado por versiones anteriores en el navegador.
- Alta, edición, archivo, restauración y eliminación de vehículos sin documentos. Control de patentes duplicadas.
- PDF e imágenes de hasta 10 MB, visor, descarga, edición y renovación conservando el documento anterior.
- Carga desde cámara o archivos con nombre, tamaño y progreso. Acceso a cuenta y cierre de sesión desde móvil.
- Acciones directas por vehículo, búsqueda sin distinción de tildes en documentos y notas, y orden por vencimiento, nombre o registro reciente.
- Vencimiento opcional, notas, búsqueda, filtros por vehículo y estado e historial de renovaciones.
- Alertas calculadas con fecha de Chile, preferencias de anticipación y avisos diarios del navegador.
- Exportación de respaldo JSON con archivos, importación como copias y exportación de calendario ICS.
- Enlace NFC fijo al dominio publicado, presentación móvil, manifiesto de instalación y pantalla sin conexión. Los documentos requieren conexión y sesión; no hay una ficha pública anónima.

## Desarrollo

Usar Node 22.13 o superior. Instalar con `npm ci`, completar las variables de `.env.example` en `.env.local` y ejecutar `npm run dev`.

`npm test` ejecuta regresiones de fechas y pruebas del flujo de archivos con un adaptador de almacenamiento simulado. `npm run build` valida la aplicación de producción. Las pruebas no sustituyen la validación de Firebase y Web Push en un navegador autenticado.

## Publicación

El repositorio usa Next.js y está vinculado al proyecto Vercel `appreadycar`. Las variables de Firebase públicas, Firebase Admin, VAPID y `CRON_SECRET` deben existir en Vercel. Los proveedores de acceso y el dominio autorizado deben configurarse en Firebase. Las reglas de `firestore.rules` deben estar publicadas en el proyecto Firebase correspondiente.

La tarea programada de `vercel.json` ejecuta los avisos diarios. Sin las variables privadas o sin la tarea programada activa, las alertas visuales siguen disponibles pero no se enviarán notificaciones automáticas ni funcionará la eliminación de cuenta desde el servidor.

Para una tarjeta NFC, grabar un registro de dirección web con `https://appreadycar.vercel.app/`. Cada visitante debe ingresar a su propia cuenta. No grabar contraseñas, tokens ni enlaces internos a archivos.

## Límites y siguientes etapas

Los respaldos se importan como copias y conservan los datos existentes; una interrupción puede dejar una importación parcial que debe revisarse antes de repetirla. El límite de importación es 100 MB y 200 documentos. Las cargas interrumpidas pueden dejar fragmentos sin referencia en almacenamiento; no reemplazan el archivo anterior y se eliminan al borrar la cuenta.

Pendientes de una integración específica: lectura automática de documentos, WhatsApp/correo para recordatorios, compartir fichas públicas con consentimiento, administración de flotas, consulta de antecedentes y servicios de renovación. No se incluyen como botones simulados.

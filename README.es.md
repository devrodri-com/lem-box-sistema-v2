# 📦 LEM-BOX System V2  
_Sistema de gestión logística y envíos construido con Next.js 15 + Firebase_  
Permite la gestión integral de paquetes, cajas y envíos en el almacén de Miami, con acceso para **Admin/Staff**, **Clientes** y **Partners** (vista multi-cliente).

[![Tests](https://img.shields.io/github/actions/workflow/status/softbmllc/lem-box-sistema-v2/tests.yml?label=Tests&logo=vitest&logoColor=white)]()
[![Firebase](https://img.shields.io/badge/Firebase-secured-orange?logo=firebase)]()
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

## ✨ Destacados
- Portal completo **admin + cliente** (Next.js App Router)  
- Nueva **área Partner** (`/partner/*`) con visibilidad **multi-cliente** (trackings/cajas/envíos/clientes) delimitada a los clientes asignados.
- **Seguridad basada en roles** (Firestore Rules probadas con Emulator)
- Suite **Vitest** con tests de integración, unitarios y de reglas
- **Generación de etiquetas 6×4** (jsPDF) + manejo de **peso dual** (lb/kg)
- **Mobile-first, accesible, listo para bilingüe**

---

## 🚀 Tecnologías principales

- **Next.js 15** (App Router, TypeScript, TailwindCSS)
- **Firebase**  
  - Autenticación (Email/Password)  
  - Base de datos Firestore  
  - Almacenamiento (imágenes de paquetes y documentos)  
- **React Hook Form + Zod** para formularios  
- **ZXing** para escanear códigos de barras de tracking  

## 🧭 Arquitectura (alto nivel)
- **Next.js (App Router)** como frontend + servidor (rutas `/admin/*`, portal cliente bajo `/mi/*`, y área partner bajo `/partner/*`).
- **Firebase Auth** gestiona la sesión (email/password).
- **Firestore** almacena entidades (`users`, `clients`, `inboundPackages`, `boxes`, `shipments`, `trackingAlerts`).
- **Storage** almacena fotos (paquetes/documentos), accedidas vía URL.
- **jsPDF (CDN)** genera PDFs 6×4 para etiquetas.
- **Tailwind** define tokens de color y componentes utilitarios.

### Flujo (resumen)
Recibido → Consolidado (caja) → Enviado → En tránsito → En destino.  
- **Admin/Staff**: ingresa paquetes, construye cajas, crea envíos y cambia estados.  
- **Partner**: gestiona **sus clientes asignados** (crear/editar/activar/desactivar) y ve **trackings/cajas/envíos** de todos los clientes asignados.  
- **Cliente**: ve sus propios trackings/cajas/envíos y edita sus datos.

---

## 🎨 Branding

Paleta oficial:
- Verde primario: `#005f40`
- Naranja secundario: `#eb6619`
- Naranja oscuro (sombra): `#cf6934`
- Blanco para contraste y fondos.

Logo oficial disponible en `/public`. Usar verde como primario y naranja para CTAs.

## 📁 Estructura de carpetas (resumen)
```text
src/
  app/
    admin/
      ingreso/
      preparado/
      estado-envios/
      historial-tracking/
      clientes/
      usuarios/
    mi/
      layout.tsx
      page.tsx        (redirects to /mi/historial)
      historial/
        page.tsx
      cajas/
        page.tsx
      envios/
        page.tsx
      cuenta/
        page.tsx
    partner/
      layout.tsx
      page.tsx
      historial/
        page.tsx
      cajas/
        page.tsx
      envios/
        page.tsx
      clientes/
        page.tsx
        [id]/
          page.tsx
    acceder/
    registro/
  components/
    RequireAuth.tsx
    AdminNav.tsx
    PartnerNav.tsx
    ConditionalNav.tsx
    PartnerContext.tsx
    clients/
      ClientsManager.tsx
      ClientProfile.tsx
    boxes/
      BoxDetailModal.tsx
      useBoxDetailModal.ts
    ui/
      StatusBadge.tsx
      BrandSelect.tsx
      icons.tsx
  lib/
    firebase.ts
    printBoxLabel.ts
    weight.ts
    utils.ts   (chunk helper)
```

---

## ⚙️ Características

### Panel **Admin**
- **Ingreso de paquetes**: tracking (escáner de hardware o manual), selección de cliente, **peso lb↔kg** con conversión automática, **foto** (cámara o archivo) con compresión; listado del mismo día.
- **Preparación de carga**: búsqueda por cliente, construir **cajas** (1 caja = 1 cliente), **exportación CSV**; tabla con **header fijo**, zebra, foco accesible; **peso dual `X lb / Y kg`**.
- **Envíos**: crear envío (guarda **`clientIds`**), cambiar estado (**Open → In transit → At destination → Closed**), expandir cajas, imprimir **etiqueta 6×4**.
- **Historial de tracking**: filtros; modal **BOX: #** con **Type + Apply**, **Reference + Print label**; elementos con **peso dual** y **peso total**.
- **Clientes**: CRUD con diseño de 20 columnas: **Code** (solo lectura), **Name**, **DocType/DocNumber**, **Country/State/City**, **Address/Postal code**, **Phone/Email/Extra email**.

### Área **Partner** (`/partner`)
- **Historial (multi-cliente)**: trackings recibidos de todos los clientes asignados (solo lectura).
- **Cajas (multi-cliente)**: cajas de todos los clientes asignados + modal de detalle.
- **Envíos (multi-cliente)**: envíos derivados de las cajas de los clientes asignados.
- **Clientes**: usa la misma UI de gestión que admin pero **delimitada** y con acciones restringidas.
  - Puede **crear/editar/activar/desactivar** clientes.
  - No puede **eliminar** clientes.
  - No puede **resetear contraseña** ni cambiar **managerUid**.
- La navegación mantiene la barra de navegación Partner en todas las secciones.

### Portal **Cliente** (`/mi`)
- **Historial**: sus **trackings** (fecha, tracking, carrier, **peso `lb/kg`**, estado, foto).
- **Cajas**: sus **cajas** y detalle (elementos con peso dual).
- **Envíos**: sus **envíos** (visibles si su `clientId` ∈ `shipment.clientIds`).
- **Cuenta**: editar **Name, Phone, Country/State/City, Address, Postal code, Extra email, DocType/DocNumber**. **Code** y **Email** son solo lectura.
- **Reportar tracking**: crea un documento en `trackingAlerts` para que admin lo gestione.
- **Vinculación de cuenta**: `/mi` requiere que `users/{uid}.clientId` esté presente. Si el usuario aún no está vinculado, el portal muestra un mensaje de "no vinculado" y bloquea el acceso hasta que el personal vincule la cuenta.
- **Bootstrap masivo (migración)**: los clientes legados importados a Firestore pueden vincularse a Firebase Auth usando las herramientas de superadmin (ver **Data maintenance** abajo).

Internamente, el portal cliente está dividido en rutas anidadas: `/mi/historial`, `/mi/cajas`, `/mi/envios`, y `/mi/cuenta`, todas compartiendo un layout común que gestiona autenticación, header y pestañas.

### Impresión de etiquetas 6×4 (horizontal)
- PDF 6×4 generado con **jsPDF (CDN)** en `src/lib/printBoxLabel.ts`.
- Diseño: **#REFERENCE** arriba (texto grande auto-ajustado), dos columnas abajo **#CLIENT** y **#BOX**. **Sin peso**.

## 🔒 Seguridad y acceso
- **RequireAuth** con `requireAdmin` protege todas las rutas `/admin/*`.
- **Navegación**: `AdminNav` (admin/staff), `PartnerNav` (partner), y un wrapper `ConditionalNav` en el layout raíz para asegurar que los partners nunca vean links `/admin/*`.
- **Reglas de Firestore** (resumen efectivo):
  - `users`: propio o staff.
  - `clients`: cliente lee/actualiza campos básicos **de su propio cliente**; staff completo. `code/email` solo lectura para cliente.
  - `inboundPackages`/`boxes`: cliente solo aquellos con su `clientId`.
  - `shipments`: legible si `clientId` ∈ `shipment.clientIds`.
  - `trackingAlerts`: cliente **crear**, staff leer/gestionar.
- El enrutamiento post-login es basado en roles: **partner_admin → /partner**, **client → /mi**, **staff → /admin/ingreso** (con reconciliación de roles de Firestore para manejar claims obsoletos).
- Alcance Partner: los datos se filtran a los clientes asignados del partner usando `users/{uid}.managedClientIds` y/o `clients.managerUid == uid` (fallback donde sea necesario).

<details>
<summary><strong>Reglas de Firestore (sugeridas)</strong></summary>

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function hasAuth() { return request.auth != null; }
    function userDoc() { return hasAuth() ? get(/databases/$(db)/documents/users/$(request.auth.uid)) : null; }
    function role() { return hasAuth() ? (userDoc().data.role != null ? userDoc().data.role : (request.auth.token.role != null ? request.auth.token.role : null)) : null; }
    function clientId() { return hasAuth() ? (userDoc().data.clientId != null ? userDoc().data.clientId : (request.auth.token.clientId != null ? request.auth.token.clientId : null)) : null; }
    function isSuperAdmin() { return role() == 'superadmin' || request.auth.token.superadmin == true; }
    function isAdmin() { return role() == 'admin' || request.auth.token.admin == true; }
    function isStaff() { return isSuperAdmin() || isAdmin(); }
    function isOwner(cid) { return clientId() != null && clientId() == cid; }

    match /users/{uid} {
      allow read:   if isStaff() || (hasAuth() && (uid == request.auth.uid || resource.data.uid == request.auth.uid));
      allow create: if hasAuth() && (uid == request.auth.uid || request.resource.data.uid == request.auth.uid);
      allow update: if isStaff() || (hasAuth() && (uid == request.auth.uid || resource.data.uid == request.auth.uid));
      allow delete: if isSuperAdmin();
    }
    match /clients/{id} {
      allow read: if isStaff() || isOwner(id) || (hasAuth() && resource.data.email == request.auth.token.email);
      allow update: if isStaff() || ( isOwner(id) && resource.data.diff(request.resource.data).changedKeys().hasOnly(['name','phone','country','state','city','address','emailAlt','postalCode','docType','docNumber']) );
      allow create, delete: if isStaff();
    }
    match /inboundPackages/{inbId} {
      allow read: if isStaff() || isOwner(resource.data.clientId);
      allow create, update, delete: if isStaff();
    }
    match /boxes/{boxId} {
      allow read: if isStaff() || isOwner(resource.data.clientId);
      allow create, update, delete: if isStaff();
    }
    match /shipments/{id} {
      allow read: if isStaff() || (clientId() != null && clientId() in resource.data.clientIds);
      allow write: if isStaff();
    }
    match /trackingAlerts/{id} {
      allow create: if hasAuth() && request.resource.data.uid == request.auth.uid;
      allow read, update, delete: if isStaff();
    }
    match /{document=**} { allow read, write: if false; }
  }
}
```

</details>

## 🧪 Testing y automatización QA

LEM‑BOX V2 incluye una suite completa de testing automatizado para asegurar precisión funcional, integridad de datos y cumplimiento de reglas en todo el sistema.

### Stack de testing
- **Vitest** para tests unitarios, de integración y de componentes UI.
- **Firebase Emulator Suite** para validación de Firestore Rules.
- **Playwright** para automatización de navegador end‑to‑end (E2E).

### Cobertura
- Unitario e integración: servicios (`userService`, utilidades como `formatDate`, `weight`).
- UI: tests visuales y de interacción DOM (`ContactButton`, smoke tests).
- Firestore Rules: verificadas con Emulator (`users`, `clients`, `boxes`, `inboundPackages`, `shipments`).
- E2E: login, acceso al panel admin y flujo del portal cliente.

Todos los tests automatizados actualmente **pasan exitosamente** (`pnpm test:all ✅`).

### Scripts de test
```bash
pnpm test         # Unit / integration / UI
pnpm test:rules   # Firestore rules (Emulator)
pnpm test:all     # Full suite (with Emulator)
pnpm e2e          # Playwright E2E
```

---

## 🧩 Convenciones de UI
- **CTAs**: **naranja** `#eb6619`; secundarios con borde y foco **verde** `#005f40`.
- **Estado**: `StatusBadge` (Recibido/Consolidado; Abierto/En tránsito/En destino/Cerrado).
- **Tablas**: header fijo, zebra sutil, `tabular-nums`, hover claro.
- **Pesos**: siempre **`X lb / Y kg`** (util `fmtWeightPairFromLb`).
- **Accesibilidad**: foco visible, `role="tablist/tab"`, `aria-current` en steppers.
- **Listas grandes**: las páginas de historial usan paginación (ej., 25 por página) y búsqueda basada en tokens para evitar cargar todos los documentos a la vez.

## 🧱 Índices de Firestore
- `inboundPackages`: **compuesto** `clientId ASC, receivedAt DESC` (para `where(clientId) + orderBy(receivedAt)`).
- `inboundPackages`: (búsqueda por tokens) pueden requerirse índices compuestos para:
  - `managerUid ASC, trackingTokens ARRAY_CONTAINS_ANY, receivedAt DESC`
  - `managerUid ASC, clientTokens ARRAY_CONTAINS, receivedAt DESC`
  (crear el índice compuesto exacto sugerido por Firestore cuando se solicite).
- `boxes`: índice simple por `clientId`.
- (Opcional) `shipments`: por `status`/`country`/`type` según necesidades de listado admin.

## 🗃️ Colecciones (resumen)
- **users/{uid}**: `uid`, `email`, `displayName`, `clientId`, `managedClientIds:string[]`, `termsAcceptedAt`, `lang:"es"`, `role:"client"|"admin"|"superadmin"|"partner_admin"`.
- **clients/{id}**: `code`, `name`, `email`, `phone`, `country`, `state`, `city`, `address`, `emailAlt?`, `postalCode?`, `docType?`, `docNumber?`, `activo`, `createdAt`, `managerUid?`.
- **inboundPackages/{id}**: `tracking`, `carrier('UPS'|'FedEx'|'USPS'|'DHL'|'Amazon'|'Other')`, `clientId`, `weightLb:number`, `photoUrl?`, `status('received'|'boxed'|'void')`, `receivedAt`.
- **boxes/{id}**: `code`, `clientId`, `type('COMERCIAL'|'FRANQUICIA')`, `country`, `itemIds:string[]`, `weightLb:number`, `status('open'|'closed')`, `shipmentId?:string|null`, `createdAt?`.
- **shipments/{id}**: `code`, `country`, `type('COMERCIAL'|'FRANQUICIA')`, `status('open'|'shipped'|'arrived'|'closed')`, `boxIds:string[]`, **`clientIds:string[]`**, `openedAt?`, `arrivedAt?`, `closedAt?`.
- **trackingAlerts/{id}**: `uid`, `clientId`, `tracking`, `note?`, `createdAt`.

## 🔑 Roles

- **SuperAdmin**: acceso completo, gestión de usuarios/partners, puede eliminar.
- **Admin**: acceso operacional completo.
- **Operador**: ingreso + construcción de cajas (staff).
- **Partner (partner_admin)**: vista multi-cliente + gestión de clientes para clientes asignados; restringido de módulos solo para staff.
- **Client**: portal de cliente único bajo /mi.

---

## ▶️ Desarrollo local

**Prerrequisitos**
- **pnpm** es recomendado (el repo incluye `pnpm-lock.yaml`).
- **Node.js 18.17+** (o Node 20+) para coincidir con los requisitos de Next.js 15 y los valores por defecto típicos de Vercel.

1. Clonar el repo y entrar a la carpeta:
   ```bash
   cd /Users/lolo/PROYECTOS/lem-box-sistema-v2
   ```

2. Instalar dependencias:
   ```bash
   pnpm install
   ```

3. Crear `.env.local` con credenciales de Firebase:
   ```env
   # Client SDK (required)
   NEXT_PUBLIC_FIREBASE_API_KEY=xxx
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=xxx
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=lem-box-sistema-v2
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=xxx
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=xxx
   NEXT_PUBLIC_FIREBASE_APP_ID=xxx

   # Firebase Admin SDK (required for /api/admin/*)
   FIREBASE_PROJECT_ID=lem-box-sistema-v2
   FIREBASE_CLIENT_EMAIL=xxx@xxx.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

   Notas:
   - `FIREBASE_PRIVATE_KEY` debe preservar saltos de línea (`\n`).
   - Sin las vars del Admin SDK, `/api/admin/*` fallará en deploy.

4. Iniciar el servidor de desarrollo:
   ```bash
   pnpm dev
   ```

5. Abrir [http://localhost:3000](http://localhost:3000).

## 🧪 Scripts útiles
- `pnpm dev` - modo desarrollo
- `pnpm build` - build de producción
- `pnpm start` - iniciar build local
- `pnpm lint` - linter
- `pnpm format` - formateo de código

---

## 📦 Deploy

El proyecto se desplegará en **Vercel**, conectado al repositorio principal.  
Servicios backend gestionados con Firebase (Firestore, Auth, Storage).

---

## 📝 Roadmap

- [x] Login con Firebase Auth.
- [x] Ingreso de paquetes (tracking, peso, foto).
- [x] Construcción de cajas (Box Builder) + exportación CSV.
- [x] Etiquetas PDF **6×4** (jsPDF, CDN).
- [x] Portal cliente (MVP: Historial, Cajas, Envíos, Cuenta, Reportar tracking).
- [x] Seguridad basada en roles (RequireAuth + reglas efectivas de Firestore).
- [ ] Tarifas y reportes.
- [ ] Escáner híbrido (BarcodeDetector + ZXing) con háptica/sonidos.
- [x] Sub‑clientes (managedClientIds) con selector de vista.
- [ ] Telemetría/analytics de uso.
- [ ] Offline‑first para ingreso.

---

## 🧵 Líneas de trabajo

- **A) Panel Admin + Portal cliente**: consolidación, envíos, etiquetas 6×4, UI/UX consistente, peso dual.
- **B) Mantenimiento de datos**: backfill de `shipments.clientIds` (envíos legados) + índices.
- **C) Futuro**: tarifas/reportes, escáner híbrido, sub‑clientes, analytics.

## ✅ Checklist QA (rápido)
- Ingreso: escanear tracking, tomar/subir foto, conversión lb↔kg.
- Preparación: crear caja, agregar paquetes, exportar CSV, etiqueta 6×4.
- Envíos: crear, agregar cajas, cambiar estado, expandir cajas.
- Historial: abrir modal de caja, editar referencia, imprimir etiqueta.
- Portal cliente: pestañas Historial/Cajas/Envíos/Cuenta, editar datos, reportar tracking.
- Acceso: admin no cae en `/mi`; cliente no puede acceder a `/admin/*`.

## 🖨️ Impresión 6×4 - notas
- Impresoras térmicas: orientación **horizontal**, márgenes **None**, escala **100%**.
- Si el PDF se abre en blanco: recargar jsPDF (CDN) o deshabilitar bloqueadores.
- Referencias largas: el tamaño del texto se auto‑ajusta.

## ♿ Accesibilidad (checklist)
- Foco visible en todos los controles.
- `aria-current="step"` en steppers; `role="tablist/tab"` en tabs.
- Objetivos táctiles ≥ 44px en botones y celdas interactivas.

## 🧰 Convenciones de código
- TypeScript con política de lint **core-strict**: `no-explicit-any` es **error** en `src/components/**` y `src/app/partner/**`, y **warn** en áreas legacy (`admin/mi/api/tests/lib`).
- Componentes puros, sin efectos secundarios en render.
- Estilo de commits: **Conventional Commits** (`feat:`, `fix:`, `chore:`…).

## 🧯 Notas operacionales
- Si Next.js build/dev muestra artefactos faltantes `.next`, limpiar caché: `rm -rf .next node_modules/.cache`.
- Partner no requiere impresión de etiquetas; la impresión de etiquetas es para flujos de trabajo de staff.

## 🧯 Mantenimiento de datos (herramientas admin)

- **Bootstrap de clientes legados**: `/api/admin/bootstrap-all-clients` vincula clientes de Firestore `clients` a usuarios de Firebase Auth y crea/actualiza docs `users/{uid}`. Intendido como paso de migración único.
- **Códigos duplicados de clientes**:
  - Detectar: `/api/admin/detect-duplicate-codes`
  - Arreglar (dry-run + aplicar): `/api/admin/fix-duplicate-codes`
  Después de arreglar, toda la creación nueva de clientes pasa por endpoints del servidor que garantizan códigos únicos.
- **Reindexar tokens de búsqueda**: existen utilidades admin para hacer backfill de `trackingTokens` / `clientTokens` para `inboundPackages` legados para que la búsqueda global funcione sin cargar todas las filas a la vez.

## 🚀 Checklist de release
- Reglas de Firestore publicadas.
- `shipments.clientIds` poblado (envíos legados).
- Índices creados (ver sección **Índices de Firestore**).
- Smoke test completo de flujos admin y cliente.

---

## 🌐 Portfolio
Proyecto: [portal.lem-box.com](https://portal.lem-box.com)  
Repositorio: [github.com/devrodri-com/lem-box-sistema-v2](https://github.com/devrodri-com/lem-box-sistema-v2)

LEM-BOX V2 es una plataforma logística moderna construida con rendimiento, accesibilidad y seguridad de datos en mente. 

---

## 📤 Migración de datos (fase final)

- **Origen**: Base de datos MySQL del sistema actual (`tracking.users`).
- **Estado**: Migración diferida hasta el final del sprint de desarrollo.
- **Procedimiento seguro**:
  - Crear un snapshot del Droplet en DigitalOcean.
  - Conectar a la base de datos en modo solo lectura.
  - Exportar tabla `users` a CSV (`/root/users.csv`).
  - Descargar y luego importar a Firestore vía script.
- **Política**: Sin cambios en producción hasta que el nuevo sistema sea validado.
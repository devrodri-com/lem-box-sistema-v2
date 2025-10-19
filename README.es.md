# 📦 LEM-BOX Sistema V2

Sistema web de logística para **LEM-BOX**, desarrollado en **Next.js 15 + Firebase**.  
Permite la gestión completa de paquetes y cajas en el warehouse de Miami, con acceso de administradores, operadores y clientes.

---

## 🚀 Tecnologías principales

- **Next.js 15** (App Router, TypeScript, TailwindCSS)
- **Firebase**  
  - Authentication (Email/Password)  
  - Firestore Database  
  - Storage (imágenes de paquetes y documentos)  
- **React Hook Form + Zod** para formularios  
- **ZXing** para escaneo de códigos de tracking  

## 🧭 Arquitectura (alto nivel)
- **Next.js (App Router)** como frontend + servidor (rutas `/admin/*` y `/mi`).
- **Firebase Auth** gestiona sesión (email/contraseña).
- **Firestore** almacena entidades (`users`, `clients`, `inboundPackages`, `boxes`, `shipments`, `trackingAlerts`).
- **Storage** guarda fotos (paquetes/documentos), accedidas vía URL.
- **jsPDF (CDN)** genera PDF 6×4 para etiquetas.
- **Tailwind** define tokens de color y componentes utilitarios.

### Flujo (resumen)
Recibido → Consolidado (caja) → Enviado → En tránsito → En destino.
- **Admin**: ingresa paquetes, arma cajas, crea embarques y cambia estados.
- **Cliente**: ve sus trackings/cajas/envíos y edita sus datos.

---

## 🎨 Branding

Paleta oficial:
- Verde primario: `#005f40`
- Naranja secundario: `#eb6619`
- Naranja oscuro (sombra): `#cf6934`
- Blanco como color de contraste y fondos.

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
    acceder/
    registro/
  components/
    RequireAuth.tsx
    AdminNav.tsx
    ui/
      StatusBadge.tsx
  lib/
    firebase.ts
    printBoxLabel.ts
    weight.ts
```

---

## ⚙️ Funcionalidades

### Panel **Admin**
- **Ingreso de paquetes**: tracking (escáner físico o manual), selección de cliente, **peso lb↔kg** con conversión automática, **foto** (cámara o archivo) con compresión; listado del día.
- **Preparado de carga**: búsqueda por cliente, armado de **cajas** (1 caja = 1 cliente), **CSV export**; tabla con **header sticky**, zebra, foco accesible; **peso dual `X lb / Y kg`**.
- **Embarques**: crear embarque (guarda **`clientIds`**), cambiar estado (**Abierto → En tránsito → En destino → Cerrado**), expandir cajas, imprimir **etiqueta 6×4**.
- **Historial de tracking**: filtros; modal **CAJA: #** con **Tipo + Aplicar**, **Referencia + Imprimir etiqueta**; items con **peso dual** y **peso total**.
- **Clientes**: ABM con layout 20 columnas: **Código** (read-only), **Nombre**, **DocType/DocNumber**, **País/Estado/Ciudad**, **Dirección/Código postal**, **Teléfono/Email/Email adicional**.

### Portal **Cliente** (`/mi`)
- **Historial**: sus **trackings** (fecha, tracking, carrier, **peso `lb/kg`**, estado, foto).
- **Cajas**: sus **cajas** y detalle (items con peso dual).
- **Envíos**: sus **embarques** (visibles si su `clientId` ∈ `shipment.clientIds`).
- **Cuenta**: edición de **Nombre, Teléfono, País/Estado/Ciudad, Dirección, Código postal, Email adicional, DocType/DocNumber**. **Código** y **Email** son read‑only.
- **Alertar tracking**: crea documento en `trackingAlerts` para que admin lo gestione.
- **Auto‑vinculación**: si falta `users/{uid}`, el sistema intenta asociar por `clients.email == auth.email` y crea el perfil.

### Impresión de etiquetas 6×4 (horizontal)
- PDF 6×4 generado con **jsPDF (CDN)** en `src/lib/printBoxLabel.ts`.
- Layout: **#REFERENCIA** arriba (texto grande auto‑ajuste), abajo dos columnas **#CLIENTE** y **#CAJA**. **Sin peso**.

## 🔒 Seguridad & Accesos
- **RequireAuth** con `requireAdmin` protege todas las rutas `/admin/*`.
- **AdminNav** muestra menú por **rol** (admin ↔ cliente).
- **Reglas Firestore** (resumen efectivo):
  - `users`: propio o staff.
  - `clients`: cliente lee/actualiza campos básicos **de su cliente**; staff total. `code/email` read‑only para cliente.
  - `inboundPackages`/`boxes`: cliente sólo los que tengan su `clientId`.
  - `shipments`: lectura si `clientId` ∈ `shipment.clientIds`.
  - `trackingAlerts`: cliente **create**, staff lectura/gestión.

<details>
<summary><strong>Reglas Firestore (sugeridas)</strong></summary>

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

## 🧩 Convenciones de UI
- **CTAs**: **naranja** `#eb6619`; secundarios con borde y focus **verde** `#005f40`.
- **Estado**: `StatusBadge` (Recibido/Consolidado; Abierto/En tránsito/En destino/Cerrado).
- **Tablas**: header sticky, zebra sutil, `tabular-nums`, hover claro.
- **Pesos**: siempre **`X lb / Y kg`** (util `fmtWeightPairFromLb`).
- **Accesibilidad**: focus visible, `role="tablist/tab"`, `aria-current` en steppers.

## 🧱 Índices Firestore
- `inboundPackages`: **compuesto** `clientId ASC, receivedAt DESC` (para `where(clientId) + orderBy(receivedAt)`).
- `boxes`: índice simple por `clientId`.
- (Opcional) `shipments`: por `status`/`country`/`type` según necesidades de listado admin.

## 🗃️ Colecciones (resumen)
- **users/{uid}**: `uid`, `email`, `displayName`, `clientId`, `managedClientIds:string[]`, `termsAcceptedAt`, `lang:"es"`, `role:"client"|"admin"|"superadmin"`.
- **clients/{id}**: `code`, `name`, `email`, `phone`, `country`, `state`, `city`, `address`, `emailAlt?`, `postalCode?`, `docType?`, `docNumber?`, `activo`, `createdAt`.
- **inboundPackages/{id}**: `tracking`, `carrier('UPS'|'FedEx'|'USPS'|'DHL'|'Amazon'|'Other')`, `clientId`, `weightLb:number`, `photoUrl?`, `status('received'|'boxed'|'void')`, `receivedAt`.
- **boxes/{id}**: `code`, `clientId`, `type('COMERCIAL'|'FRANQUICIA')`, `country`, `itemIds:string[]`, `weightLb:number`, `status('open'|'closed')`, `shipmentId?:string|null`, `createdAt?`.
- **shipments/{id}**: `code`, `country`, `type('COMERCIAL'|'FRANQUICIA')`, `status('open'|'shipped'|'arrived'|'closed')`, `boxIds:string[]`, **`clientIds:string[]`**, `openedAt?`, `arrivedAt?`, `closedAt?`.
- **trackingAlerts/{id}**: `uid`, `clientId`, `tracking`, `note?`, `createdAt`.

## 🔑 Roles

- **Admin**: Acceso completo, gestión de usuarios, cajas, tarifas.
- **Operador**: Ingreso de paquetes, armado de cajas.
- **Cliente**: Lectura de sus propios paquetes y cajas.

---

## ▶️ Desarrollo local

1. Clonar repositorio y entrar a la carpeta:
   ```bash
   cd /Users/lolo/PROYECTOS/lem-box-sistema-v2
   ```

2. Instalar dependencias:
   ```bash
   pnpm install
   ```

3. Crear archivo `.env.local` con credenciales Firebase:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=xxx
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=xxx
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=lem-box-sistema-v2
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=xxx
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=xxx
   NEXT_PUBLIC_FIREBASE_APP_ID=xxx
   ```

4. Levantar servidor:
   ```bash
   pnpm dev
   ```

5. Abrir [http://localhost:3000](http://localhost:3000).

## 🧪 Scripts útiles
- `pnpm dev` – entorno de desarrollo
- `pnpm build` – build de producción
- `pnpm start` – iniciar build local
- `pnpm lint` – linter
- `pnpm format` – formateo del código

---

## 📦 Deploy

El proyecto se desplegará en **Vercel**, conectado al repositorio principal.  
Servicios de backend gestionados con Firebase (Firestore, Auth, Storage).

---

## 📝 Roadmap

- [x] Login con Firebase Auth.
- [x] Ingreso de paquetes (tracking, peso, foto).
- [x] Armado de cajas (Box Builder) + CSV export.
- [x] Etiquetas PDF **6×4** (jsPDF, CDN).
- [x] Portal de clientes (MVP: Historial, Cajas, Envíos, Cuenta, Alertar tracking).
- [x] Seguridad por roles (RequireAuth + reglas Firestore efectivas).
- [ ] Tarifas y reportes.
- [ ] Scanner híbrido (BarcodeDetector + ZXing) con háptica/sonidos.
- [ ] Subclientes (managedClientIds) con selector de vista.
- [ ] Telemetría/analytics de uso.
- [ ] Offline‑first para ingreso.

---

## 🧵 Hilos de trabajo

- **A) Panel admin + Portal cliente**: consolidación, embarques, etiquetas 6×4, UI/UX consistente, peso dual.
- **B) Mantenimiento de datos**: backfill de `shipments.clientIds` (embarques antiguos) + índices.
- **C) Futuro**: tarifas/reportes, scanner híbrido, subclientes, analytics.

## ✅ Checklist de QA (rápido)
- Ingreso: escanear tracking, tomar/capturar foto, conversión lb↔kg.
- Preparado: crear caja, agregar paquetes, CSV export, etiqueta 6×4.
- Embarques: crear, agregar cajas, cambiar estado, expandir cajas.
- Historial: abrir modal de caja, editar referencia, imprimir etiqueta.
- Portal cliente: tabs Historial/Cajas/Envíos/Cuenta, editar datos, alertar tracking.
- Accesos: admin no cae en `/mi`; cliente no accede a `/admin/*`.

## 🖨️ Impresión 6×4 – notas
- Impresoras térmicas: orientación **horizontal**, márgenes **None**, escala **100%**.
- Si el PDF se abre en blanco: recargar jsPDF (CDN) o desactivar bloqueadores.
- Referencias largas: el tamaño del texto se auto‑ajusta.

## ♿ Accesibilidad (checklist)
- Focus visible en todos los controles.
- `aria-current="step"` en steppers; `role="tablist/tab"` en tabs.
- Tamaños de toque ≥ 44px en botones y celdas interactivas.

## 🧰 Convenciones de código
- TypeScript **sin `any`**; utilidades tipadas (e.g., `weight.ts`).
- Componentes puros, sin side‑effects en render.
- Commit style: **Conventional Commits** (`feat:`, `fix:`, `chore:`…).

## 🚀 Release checklist
- Reglas Firestore publicadas.
- `shipments.clientIds` poblado (embarques antiguos).
- Índices creados (ver sección **Índices Firestore**).
- Smoke test de admin y cliente completo.

---

## 👨‍💻 Equipo

- Dirección técnica: **Rodrigo**  
- Desarrollo asistido con **IA + VSCode (OBOE)**  

---

## 📤 Migración de datos (fase final)

- **Origen**: Base de datos MySQL del sistema actual (`tracking.users`).
- **Estado**: Migración diferida hasta el cierre del sprint de desarrollo.
- **Procedimiento seguro**:
  - Crear snapshot del Droplet en DigitalOcean.
  - Conexión a la base en modo solo lectura.
  - Exportación de tabla `users` a CSV (`/root/users.csv`).
  - Descarga y posterior import a Firestore mediante script.
- **Política**: Ningún cambio en producción hasta que el sistema nuevo esté validado.

# 📦 LEM-BOX System V2  
_Logistics & shipping management system built with Next.js 15 + Firebase_
Enables end‑to‑end management of packages and boxes in the Miami warehouse, with access for administrators, operators, and clients.

[![Tests](https://img.shields.io/github/actions/workflow/status/softbmllc/lem-box-sistema-v2/tests.yml?label=Tests&logo=vitest&logoColor=white)]()
[![Firebase](https://img.shields.io/badge/Firebase-secured-orange?logo=firebase)]()
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

## ✨ Highlights
- Full **admin + client** portal (Next.js App Router)
- **Role-based security** (Firestore Rules tested with Emulator)
- **Vitest** suite with integration, unit & rule tests
- **6×4 label generation** (jsPDF) + **dual weight** handling (lb/kg)
- **Mobile-first, accessible, bilingual-ready**

---

## 🚀 Core technologies

- **Next.js 15** (App Router, TypeScript, TailwindCSS)
- **Firebase**  
  - Authentication (Email/Password)  
  - Firestore Database  
  - Storage (package and document images)  
- **React Hook Form + Zod** for forms  
- **ZXing** for scanning tracking barcodes  

## 🧭 Architecture (high level)
- **Next.js (App Router)** as frontend + server (routes `/admin/*` and client portal under `/mi/*`).
- **Firebase Auth** manages the session (email/password).
- **Firestore** stores entities (`users`, `clients`, `inboundPackages`, `boxes`, `shipments`, `trackingAlerts`).
- **Storage** stores photos (packages/documents), accessed via URL.
- **jsPDF (CDN)** generates 6×4 PDFs for labels.
- **Tailwind** defines color tokens and utility components.

### Flow (summary)
Received → Consolidated (box) → Shipped → In transit → At destination.
- **Admin**: enters packages, builds boxes, creates shipments, and changes statuses.
- **Client**: sees their trackings/boxes/shipments and edits their data.

---

## 🎨 Branding

Official palette:
- Primary green: `#005f40`
- Secondary orange: `#eb6619`
- Dark orange (shadow): `#cf6934`
- White for contrast and backgrounds.

Official logo available in `/public`. Use green as primary and orange for CTAs.

## 📁 Folder structure (summary)
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

## ⚙️ Features

### **Admin** panel
- **Package intake**: tracking (hardware scanner or manual), client selection, **weight lb↔kg** with automatic conversion, **photo** (camera or file) with compression; same‑day listing.
- **Load preparation**: search by client, build **boxes** (1 box = 1 client), **CSV export**; table with **sticky header**, zebra, accessible focus; **dual weight `X lb / Y kg`**.
- **Shipments**: create shipment (saves **`clientIds`**), change status (**Open → In transit → At destination → Closed**), expand boxes, print **6×4 label**.
- **Tracking history**: filters; **BOX: #** modal with **Type + Apply**, **Reference + Print label**; items with **dual weight** and **total weight**.
- **Clients**: CRUD with 20‑column layout: **Code** (read‑only), **Name**, **DocType/DocNumber**, **Country/State/City**, **Address/Postal code**, **Phone/Email/Extra email**.

### **Client** portal (`/mi`)
- **History**: their **trackings** (date, tracking, carrier, **weight `lb/kg`**, status, photo).
- **Boxes**: their **boxes** and detail (items with dual weight).
- **Shipments**: their **shipments** (visible if their `clientId` ∈ `shipment.clientIds`).
- **Account**: edit **Name, Phone, Country/State/City, Address, Postal code, Extra email, DocType/DocNumber**. **Code** and **Email** are read‑only.
- **Report tracking**: creates a document in `trackingAlerts` for admin to handle.
- **Auto‑linking**: if `users/{uid}` is missing, the system tries to associate by `clients.email == auth.email` and creates the profile.

Internally, the client portal is split into nested routes: `/mi/historial`, `/mi/cajas`, `/mi/envios`, and `/mi/cuenta`, all sharing a common layout that handles authentication, header, and tabs.

### 6×4 label printing (horizontal)
- 6×4 PDF generated with **jsPDF (CDN)** in `src/lib/printBoxLabel.ts`.
- Layout: **#REFERENCE** at top (large auto‑fit text), two columns below **#CLIENT** and **#BOX**. **No weight**.

## 🔒 Security & access
- **RequireAuth** with `requireAdmin` protects all `/admin/*` routes.
- **AdminNav** shows menu by **role** (admin ↔ client).
- **Firestore rules** (effective summary):
  - `users`: self or staff.
  - `clients`: client reads/updates basic fields **of their own client**; staff full. `code/email` read‑only for client.
  - `inboundPackages`/`boxes`: client only those with their `clientId`.
  - `shipments`: readable if `clientId` ∈ `shipment.clientIds`.
  - `trackingAlerts`: client **create**, staff read/manage.

<details>
<summary><strong>Firestore rules (suggested)</strong></summary>

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

## 🧪 Testing & QA Automation

LEM‑BOX V2 includes a complete automated testing suite to ensure functional accuracy, data integrity, and rule enforcement across the system.

### Testing stack
- **Vitest** for unit, integration, and UI component tests.
- **Firebase Emulator Suite** for Firestore Rules validation.
- **Playwright** for end‑to‑end (E2E) browser automation.

### Coverage
- Unit & integration: services (`userService`, utilities like `formatDate`, `weight`).
- UI: visual and DOM interaction tests (`ContactButton`, smoke tests).
- Firestore Rules: verified with Emulator (`users`, `clients`, `boxes`, `inboundPackages`, `shipments`).
- E2E: login, admin panel access, and client portal flow.

All automated tests currently **pass successfully** (`pnpm test:all ✅`).

### Test scripts
```bash
pnpm test         # Unit / integration / UI
pnpm test:rules   # Firestore rules (Emulator)
pnpm test:all     # Full suite (with Emulator)
pnpm e2e          # Playwright E2E
```

---

## 🧩 UI conventions
- **CTAs**: **orange** `#eb6619`; secondary with border and **green** focus `#005f40`.
- **Status**: `StatusBadge` (Received/Consolidated; Open/In transit/At destination/Closed).
- **Tables**: sticky header, subtle zebra, `tabular-nums`, clear hover.
- **Weights**: always **`X lb / Y kg`** (util `fmtWeightPairFromLb`).
- **Accessibility**: visible focus, `role="tablist/tab"`, `aria-current` in steppers.

## 🧱 Firestore indexes
- `inboundPackages`: **composite** `clientId ASC, receivedAt DESC` (for `where(clientId) + orderBy(receivedAt)`).
- `boxes`: single index by `clientId`.
- (Optional) `shipments`: by `status`/`country`/`type` per admin listing needs.

## 🗃️ Collections (summary)
- **users/{uid}**: `uid`, `email`, `displayName`, `clientId`, `managedClientIds:string[]`, `termsAcceptedAt`, `lang:"es"`, `role:"client"|"admin"|"superadmin"`.
- **clients/{id}**: `code`, `name`, `email`, `phone`, `country`, `state`, `city`, `address`, `emailAlt?`, `postalCode?`, `docType?`, `docNumber?`, `activo`, `createdAt`.
- **inboundPackages/{id}**: `tracking`, `carrier('UPS'|'FedEx'|'USPS'|'DHL'|'Amazon'|'Other')`, `clientId`, `weightLb:number`, `photoUrl?`, `status('received'|'boxed'|'void')`, `receivedAt`.
- **boxes/{id}**: `code`, `clientId`, `type('COMERCIAL'|'FRANQUICIA')`, `country`, `itemIds:string[]`, `weightLb:number`, `status('open'|'closed')`, `shipmentId?:string|null`, `createdAt?`.
- **shipments/{id}**: `code`, `country`, `type('COMERCIAL'|'FRANQUICIA')`, `status('open'|'shipped'|'arrived'|'closed')`, `boxIds:string[]`, **`clientIds:string[]`**, `openedAt?`, `arrivedAt?`, `closedAt?`.
- **trackingAlerts/{id}**: `uid`, `clientId`, `tracking`, `note?`, `createdAt`.

## 🔑 Roles

- **Admin**: Full access, user management, boxes, rates.
- **Operator**: Package intake, box building.
- **Client**: Read their own packages and boxes.

---

## ▶️ Local development

1. Clone the repo and enter the folder:
   ```bash
   cd /Users/lolo/PROYECTOS/lem-box-sistema-v2
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Create `.env.local` with Firebase credentials:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=xxx
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=xxx
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=lem-box-sistema-v2
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=xxx
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=xxx
   NEXT_PUBLIC_FIREBASE_APP_ID=xxx
   ```

4. Start the dev server:
   ```bash
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

## 🧪 Useful scripts
- `pnpm dev` – development mode
- `pnpm build` – production build
- `pnpm start` – start local build
- `pnpm lint` – linter
- `pnpm format` – code formatting

---

## 📦 Deploy

The project will be deployed on **Vercel**, connected to the main repository.  
Backend services managed with Firebase (Firestore, Auth, Storage).

---

## 📝 Roadmap

- [x] Login with Firebase Auth.
- [x] Package intake (tracking, weight, photo).
- [x] Box building (Box Builder) + CSV export.
- [x] **6×4** PDF labels (jsPDF, CDN).
- [x] Client portal (MVP: History, Boxes, Shipments, Account, Report tracking).
- [x] Role‑based security (RequireAuth + effective Firestore rules).
- [ ] Rates and reports.
- [ ] Hybrid scanner (BarcodeDetector + ZXing) with haptics/sounds.
- [ ] Sub‑clients (managedClientIds) with view selector.
- [ ] Usage telemetry/analytics.
- [ ] Offline‑first for intake.

---

## 🧵 Work streams

- **A) Admin panel + Client portal**: consolidation, shipments, 6×4 labels, consistent UI/UX, dual weight.
- **B) Data maintenance**: backfill of `shipments.clientIds` (legacy shipments) + indexes.
- **C) Future**: rates/reports, hybrid scanner, sub‑clients, analytics.

## ✅ QA checklist (quick)
- Intake: scan tracking, take/upload photo, lb↔kg conversion.
- Preparation: create box, add packages, CSV export, 6×4 label.
- Shipments: create, add boxes, change status, expand boxes.
- History: open box modal, edit reference, print label.
- Client portal: tabs History/Boxes/Shipments/Account, edit data, report tracking.
- Access: admin does not fall into `/mi`; client cannot access `/admin/*`.

## 🖨️ 6×4 printing – notes
- Thermal printers: **horizontal** orientation, **None** margins, **100%** scale.
- If the PDF opens blank: reload jsPDF (CDN) or disable blockers.
- Long references: text size auto‑adjusts.

## ♿ Accessibility (checklist)
- Visible focus on all controls.
- `aria-current="step"` in steppers; `role="tablist/tab"` in tabs.
- Touch targets ≥ 44px on buttons and interactive cells.

## 🧰 Code conventions
- TypeScript **without `any`**; typed utilities (e.g., `weight.ts`).
- Pure components, no side‑effects on render.
- Commit style: **Conventional Commits** (`feat:`, `fix:`, `chore:`…).

## 🚀 Release checklist
- Firestore rules published.
- `shipments.clientIds` populated (legacy shipments).
- Indexes created (see **Firestore indexes** section).
- Full smoke test of admin and client flows.

---

## 🌐 Portfolio
Project: [lem-box.com.uy](https://lem-box.com.uy)  
Repository: [github.com/softbmllc/lem-box-sistema-v2](https://github.com/softbmllc/lem-box-sistema-v2)

LEM-BOX V2 is a modern logistics platform built with performance, accessibility, and data security in mind. 

---

## 📤 Data migration (final phase)

- **Source**: Current system MySQL database (`tracking.users`).
- **Status**: Migration deferred until the end of the development sprint.
- **Safe procedure**:
  - Create a snapshot of the Droplet in DigitalOcean.
  - Connect to the database in read‑only mode.
  - Export `users` table to CSV (`/root/users.csv`).
  - Download and then import into Firestore via script.
- **Policy**: No production changes until the new system is validated.

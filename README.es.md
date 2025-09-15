
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

---

## 🎨 Branding

Paleta oficial:
- Verde primario: `#005f40`
- Naranja secundario: `#eb6619`
- Naranja oscuro (sombra): `#cf6934`
- Blanco como color de contraste y fondos.

Logo oficial disponible en `/public`. Usar verde como primario y naranja para CTAs.

---

- **Next.js 15** (App Router, TypeScript, TailwindCSS)
- **Firebase**  
  - Authentication (Email/Password)  
  - Firestore Database  
  - Storage (imágenes de paquetes y documentos)  
- **React Hook Form + Zod** para formularios  
- **ZXing** para escaneo de códigos de tracking  

---


## ⚙️ Funcionalidades

### Fase 1 — Ingreso de paquetes
- Escaneo/ingreso manual de tracking.
- Asignación de cliente.
- Carga de peso.
- Foto de paquete/documento con compresión inteligente (modo **foto** o **doc**).
- Listado de paquetes recibidos en el día.

### Fase 2 — Box Builder (pendiente)
- Agrupar paquetes en una caja.
- Validación: 1 caja = 1 cliente.
- Cálculo de peso total.
- Cierre de caja y generación de etiqueta PDF.

### Fase 3 — Portal cliente (pendiente)
- Ver paquetes recibidos con foto/peso.
- Ver cajas armadas y estados de envío.

---

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

---

## 📦 Deploy

El proyecto se desplegará en **Vercel**, conectado al repositorio principal.  
Servicios de backend gestionados con Firebase (Firestore, Auth, Storage).

---

## 📝 Roadmap

- [x] Login con Firebase Auth.  
- [x] Ingreso de paquetes (tracking, peso, foto).  
- [ ] Armado de cajas (Box Builder).  
- [ ] Etiquetas PDF automáticas.  
- [ ] Portal de clientes.  
- [ ] Control de tarifas y reportes.  

---

## 🧵 Hilos de trabajo

- **A) Desarrollo funcional LEM-BOX V2**: avance en ingreso, Box Builder, etiquetas, portal cliente.
- **B) Migración segura MySQL → Firestore**: se ejecutará al final, con snapshot previo y solo lectura.

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

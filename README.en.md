

# 📦 LEM-BOX System V2

Web-based logistics system for **LEM-BOX**, developed with **Next.js 15 + Firebase**.  
Enables full management of packages and boxes at the Miami warehouse, with access levels for administrators, operators, and clients.

---

## 🚀 Main Technologies

- **Next.js 15** (App Router, TypeScript, TailwindCSS)
- **Firebase**  
  - Authentication (Email/Password)  
  - Firestore Database  
  - Storage (package and document images)  
- **React Hook Form + Zod** for forms  
- **ZXing** for tracking code scanning  

---

## 🎨 Branding

Official **LEM-BOX** color palette:

- Primary green: `#005f40`  
- Secondary orange: `#eb6619`  
- Dark orange (shadow): `#cf6934`  
- White as background and contrast color  

Official logo available in `/public` (to be integrated into the UI).

---

## ⚙️ Features

### Phase 1 — Package intake
- Scan or manually enter tracking numbers.
- Assign client.
- Enter package weight.
- Upload package/document photo with smart compression (**photo** or **doc** mode).
- Daily received package listing.

### Phase 2 — Box Builder (upcoming)
- Group packages into a single box.
- Validation: 1 box = 1 client.
- Calculate total weight.
- Close box and generate PDF label.

### Phase 3 — Client portal (upcoming)
- View received packages with photo/weight.
- View assembled boxes and shipping status.

---

## 🔑 Roles

- **Admin**: Full access, manage users, boxes, and rates.
- **Operator**: Package intake, box assembly.
- **Client**: Read-only access to their own packages and boxes.

---

## ▶️ Local Development

1. Clone repository and enter the project folder:
   ```bash
   cd /Users/lolo/PROYECTOS/lem-box-sistema-v2
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Create `.env.local` file with Firebase credentials:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=xxx
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=xxx
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=lem-box-sistema-v2
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=xxx
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=xxx
   NEXT_PUBLIC_FIREBASE_APP_ID=xxx
   ```

4. Start the development server:
   ```bash
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

---

## 📦 Deployment

The project will be deployed on **Vercel**, connected to the main repository.  
Backend services are managed with Firebase (Firestore, Auth, Storage).

---

## 📝 Roadmap

- [x] Firebase Auth login.  
- [x] Package intake (tracking, weight, photo).  
- [ ] Box Builder.  
- [ ] Automatic PDF labels.  
- [ ] Client portal.  
- [ ] Rate control and reports.  

---

## 👨‍💻 Team

- Technical Direction: **Rodrigo**  
- Development assisted with **AI + VSCode (OBOE)**  
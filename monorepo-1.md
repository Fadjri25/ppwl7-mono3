# Monorepo
- Frontend: bun, vite, react (ts), tailwind, ShadCN
- Backend: bun, elysia

Berikut alur lengkap inisiasi monorepo dari awal hingga selesai:

---

## 1. Bootstrap awal
Command di sini menggunakan basis unix (linux, mac, git bash), ada diberi contoh command yang sama untuk versi cmd. 
> Tips: jika pakai `cmd`, jika command tidak jalan, batalkan dengan `Ctrl+PauseBreak` 
```bash
mkdir monorepo && cd monorepo
```

---

## 2. Init root workspace

```bash
bun init -y
```

Lalu **edit `package.json`** di root menjadi:

```json
{
  "name": "monorepo",
  "private": true,
  "workspaces": ["apps/*", "packages/*"]
}
```

Hapus `index.ts` yang dibuat bun init — root tidak butuh entry point.

```bash
rm index.ts # linux/mac/git bash command
del index.ts # cmd
```

Buat struktur folder (ini adalah perintah unix):

```bash
mkdir -p apps packages/shared # linux/mac/git bash
mkdir apps packages\shared # cmd
```

Kode `-p` menggunakan terminal basis unix (git bash, mac, linux). Jika tidak dapat membuka git bash, ikuti [setup git bash](#setup-git-bash-in-terminal), atau gunakan cmd, atau buat manual.

---

## 3. Init Frontend (apps/frontend)

```bash
cd apps
bunx create-vite frontend --template react-ts # vite beta v8 (No), install with bun & start now (No)
cd frontend && bun install
rm -rf .git # unix: hapus git repo hasil inisiasi template vite react
rmdir /S /Q .git # cmd: /S (hapus juga Subfolder), /Q (Quiet, tanpa konfirmasi)
```

Jika butuh NodeJs versi tertentu, ikuti proses [nvm](#setup-nvm) (untuk mengelola versi NodeJs). 

Jalankan `rm tsconfig.node.json`, kita tidak perlu konfigurasi node backend. hapus juga path reference nya di `tsconfig.json` 

**Install Tailwind v4:**

```bash
bun add tailwindcss @tailwindcss/vite
```

**Edit `vite.config.ts`:**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
  },
});
```
Jika `tailwindcss()` atau module apapun yang error load, ikuti [langkah ini](#fix-bug-load-dependencies).

**Ganti isi `src/index.css`** (hapus semua, ganti dengan):

```css
@import "tailwindcss";
```

**Setup shadcn/ui:**

Shadcn membaca [**`tsconfig.json`**](https://ui.shadcn.com/docs/installation/manual), bukan **`tsconfig.app.json`**. Buka  dan Tambahkan settingan path ini ke dalam **`tsconfig.json`** (dibutuhkan shadcn ketika init) dan **`tsconfig.app.json`** (dibutuhkan Vite React bisa baca path):

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```
Simpan, lalu jalankan:

```bash
bunx --bun shadcn@latest init
```
Ikuti prompt:
- component library → **Radix**
- preset → **Nova**

Setelah init, tambah komponen yang dibutuhkan, kita test pakai:

```bash
bunx --bun shadcn@latest add button
```

Ganti isi `App.tsx` dengan ini:
```typescript
import { Button } from "@/components/ui/button"

function App() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 min-h-screen">
      
      <Button>Default</Button>

      <Button variant="secondary">
        Secondary
      </Button>

      <Button variant="destructive">
        Delete
      </Button>

      <Button variant="outline">
        Outline
      </Button>

      <Button variant="ghost">
        Ghost
      </Button>

      <Button variant="link">
        Link
      </Button>

    </div>
  )
}

export default App
```
Test dengan menjalankan `bun dev`

### fix port in use
Jika dapat error `Error: Port 5173 is already in use`. Jalankan:
```bash
bun add -D kill-port
```
Lalu ubah script dev di `package.json`:
```json
{
  "scripts": {
    "dev": "bunx kill-port 5173 && vite"
  }
}
```

---

## 4. Init Backend (apps/backend)

```bash
cd ../../apps
mkdir backend && cd backend
bun init -y
```

**Edit `package.json`** backend:

```json
{
  "name": "backend",
  "module": "src/index.ts",
  "private": true,
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun",
    "start": "bun dist/index.js"
  }
}
```

Rapikan struktur:

```bash
rm index.ts
mkdir src
```

**Install Elysia + plugin:**
Swagger adalah plugin dokumentasi API berbasis OpenAPI
```bash
bun add elysia @elysiajs/cors @elysiajs/swagger
bun add -d @types/bun
```

Buat **`src/index.ts`:**

```ts
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";

const app = new Elysia()
  .use(cors({ origin: ["http://localhost:5173"] }))
  .use(swagger())
  .get("/", () => ({ status: "ok" }))
  .listen(3000);

console.log(`🦊 Backend → http://localhost:${app.server?.port}`);
console.log(`📖 Swagger → http://localhost:${app.server?.port}/swagger`);

export type App = typeof app;
```

Test server dengan menjalankan `bun dev`

Test **cors** dengan buat file `apps\frontend\src\ApiTest.tsx`:
```typescript
import { useState } from "react"
import { Button } from "@/components/ui/button"

function App() {
  const [response, setResponse] = useState<string>("")

  const handleClick = async () => {
    try {
      const res = await fetch("http://localhost:3000")
      const data = await res.text()

      setResponse(data)
    } catch (error) {
      console.error(error)
      setResponse("Error connecting to server")
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      
      <Button onClick={handleClick}>
        Get Response
      </Button>

      <div className="p-4 border rounded w-96">
        <b>Server Response:</b>
        <p>{response}</p>
      </div>

    </div>
  )
}

export default App
```
Ganti elemen `App.tsx` di `main.tsx` dengan elemen `ApiTest.tsx`:
```typescript
// import App from './App.tsx'
import App from './ApiTest'
```
Jalankan server Backend & Frontend, lalu test trigger button di Frontend.

---
## 5. Setup Shared Package
Berisi shared item atau types yang dapat tiap apps akses.

```bash
cd ../../packages/shared
bun init -y
rm -rf README.md index.ts
```

**Edit `package.json`:**

```json
{
  "name": "shared",
  "private": true,
  "module": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

Buat **`packages/shared/src/index.ts`** berisi shared types:

```ts
export interface HealthCheck {
  status: string
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}
```

---

## 6. Hubungkan workspace dependencies

Kembali ke root:

```bash
cd ../../
```

**Edit `apps/frontend/package.json` & `apps/backend/package.json`** — tambahkan:

```json
{
  "dependencies": {
    "shared": "workspace:*"
  }
}
```

---

## 7. Root `tsconfig.json`

Ganti isi file `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "skipLibCheck": true
  }
}
```

---

## 8. Root scripts

**Edit root `package.json`** tambahkan scripts:

```json
{
  "name": "monorepo",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "bun run --filter '*' dev",
    "dev:frontend": "bun run --filter frontend dev",
    "dev:backend": "bun run --filter backend dev",
    "build": "bun run --filter '*' build"
  }
}
```

---

## 9. Install semua dan jalankan

```bash
bun install
```

Bun akan resolve semua workspace dependencies termasuk `shared` secara otomatis.

> **Tip:** Setelah `bun install` di root, jangan jalankan `bun install` lagi di dalam subfolder. Bun workspace mengelola semua dependencies dari root secara terpusat.
> **Ingat!** `Package.json` di root tidak boleh dependency ataupun devDependency. Jika ingin menambahkan package ke worspace, masuk dulu ke dalam folder workspace nya. cth: menambahkan package `test` ke backend, caranya: `cd apps/backend && bun add test`.

```bash
# Jalankan keduanya
bun dev

# Atau masing-masing
bun dev:frontend   # http://localhost:5173
bun dev:backend    # http://localhost:3000
                   # http://localhost:3000/swagger
```

## 10. Implementasi shared type di Frontend & Backend

pada `backend/src/index.ts`, tambahkan type **ApiResponse**:
```ts
import type { ApiResponse, HealthCheck } from "shared";

const app = new Elysia()
  // ...
  .get("/", (): ApiResponse<HealthCheck> => {
    return {
      data: { status: "ok" },
      message: "server running" 
    }
  })
```

pada `frontend/src/ApiTest.tsx`, modifikasi untuk menggunakan type **ApiResponse**:
```ts
import type { ApiResponse, HealthCheck } from "shared";

function App() {
  const [response, setResponse] = useState<string>("")

  const handleClick = async () => {
    try {
      const res = await fetch("http://localhost:3000")
      const data: ApiResponse<HealthCheck> = await res.json()

      setResponse(data.data.status)
```
coba cek di server frontend (apakah ada response) & backend (cek response API di /swagger) 
---

## Struktur akhir

```
monorepo/
├── apps/
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── components/ui/   ← shadcn components
│   │   │   ├── index.css        ← @import "tailwindcss"
│   │   │   └── ...
│   │   ├── vite.config.ts
│   │   └── components.json      ← shadcn config
│   └── backend/
│       └── src/
│           └── index.ts         ← Elysia entry point
├── packages/
│   └── shared/
│       └── src/index.ts         ← Shared types
├── package.json                 ← workspace root
└── tsconfig.json
```

---



Lanjutan tutorial ada di [**PHASE-2.md**](monorepo-2.md)


## Bug Handling
Mengatasi berbagai masalah yang mungkin terjadi.

### [1] setup Git Bash in terminal
Jika git bash tidak tersedia di menu terminal (di terminal cmd/powershell, ketik `bash` tidak membuka git bash), coba lakukan ini:

1. tambahkan `C:\Program Files\Git\bin` ke path Environment Variable User dan System (pastika folder ada).
2. Buka Terminal, lalu buka setting.
3. Tambahkan profile baru, beri nama `Git Bash`, lalu setingan path berikut:
> - Command line: `C:\Program Files\Git\bin\bash.exe` (cek dulu apakah lokasi sesuai)
> - Icon: `C:\Program Files\Git\mingw64\share\git\git-for-windows.ico` (cek dulu apakah lokasi sesuai)
Jika `C:\Program Files\Git` tidak ada, anda bisa pakai `C:\laragon\bin\git`.
4. test dengan ketikkan `bash` ketika di terminal, berhasil jika terbuka terminal dengan profie Git Bash.

Jika saat ketik `bash` justru bentrok dengan WSL:
1. Cari "Edit the system environment variables" di menu Start Windows
2. klik `Environment Variables`
3. Di bagian System variables (atau User variables), cari variabel Path, pilih, lalu klik Edit.
4. Cari entri `C:\Program Files\Git\bin` atau `C:\Program Files\Git\usr\bin` atau `C:\laragon\bin\git\bin`.
5. Pilih entri tersebut dan gunakan tombol Move Up sampai posisinya berada di atas `C:\Windows\System32`.
  
### [2] Setup NVM
**1. install nvm:**
Linux/Mac:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
```
Windows:
- install [nvm-setup.exe](https://github.com/coreybutler/nvm-windows/releases/download/1.2.2/nvm-setup.exe)
- buka aplikasi, ikuti proses install (Jika username windows anda punya spasi, cth: `C:\Users\Desktop H123\`, simpan aplikasi nvm di `C:\nvm\` untuk mencegah error)
  
**2. Cara pakai NVM:**
```bash
node -v # cek versi node (jika tidak terdeteksi, tambahkan `C:\laragon\bin\nodejs` ke path `environment variable` user & system)
nvm -v # cek versi NVM (jika tidak terdeteksi, tambahkan `C:\Users\<USER_NAME>\AppData\Roaming\nvm\`[ini default path, ubah sesuai lokasi install nvm mu] ke path user & system)
nvm ls # lihat versi node yang tersedia
nvm install <node_version> # install versi node, cth: `nvm install 25`
nvm use <node_version> # pilih versi node, cth: `nvm use 25`
```

### [3] Fix Bug load dependencies
Jika di `import {...} from '...'` module tidak ditemukan, walau sudah di install, coba lakukan ini:
1. Hapus cache dan install ulang:
```bash
rm -rf node_modules # patikan di lokasi apps/ yang tepat -> `apps/frontend/` atau `apps/backend/`
bun install
```
2. Di VSCode, buka file ts yang error, lalu ketik `Ctrl+Shift+P`, jalankan `TypeScript: Restart TS Server` (VSCode akan deteksi ulang module). 

---

## Tips
Jika ingin menginstall package di workspace tertentu:

```bash
# cd <path_workspace> && bun add <nama_package>
# contoh:
cd apps/frontend && bun add -D kill-port # -D berarti ke devDependencies
```

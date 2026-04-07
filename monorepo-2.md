# Monorepo Phase 2
Lanjutan Tutorial Monorepo. Membuat proyek monorepo sederhana.
Menggunakan [Prisma ORM](https://www.prisma.io/docs):
- **Shared types** → dipakai backend & frontend
- **Backend** → Bun + Prisma + API
- **Frontend** → React + Tailwind + ShadCN
- **Database dummy** → tabel User
- **Response API** menggunakan ApiResponse<User[]>

> Pastika Versi Node sesuai, gunakan nvm untuk mengelola versi Node.

---

# 1. Shared Types

`packages/shared/src/index.ts` tambahkan interface ini:

```ts
export interface User {
  id: number;
  name: string | null;
  email: string;
}
```

---

# 2. Prisma Sqlite (Install di apps\backend)
Mengikuti [Setup](https://bun.com/docs/guides/ecosystem/prisma) dari Bun (dengan sedikit modifikasi).

Install:

```bash
cd apps\backend
bun add -d prisma
bun add @prisma/client @prisma/adapter-libsql
```

Inisialisasi Prisma dengan SQLite:
```bash
bunx --bun prisma init --datasource-provider sqlite 
```
Prisma menggunakan adapter-bun untuk akses driver **bun:sqlite**. 

Perhatikan generated file **prisma.config.ts**. ia akan meminta env DATABASE_URL, jika file .env tidak otomatis dibuat. Buat file `apps/backend/.env` berisi `DATABASE_URL="file:./dev.db"` (nama database bebas).

---

## Konfigurasi Prisma

Buat skema, tambahkan beberapa konfig ini komponen `schema.prisma` (jangan sampai double, jangan hapus config yg lain):

```prisma
generator client {
  engineType = "client"
  runtime = "bun"
}

model User { 
  id    Int     @id @default(autoincrement()) 
  email String  @unique
  name  String?
} 
```
> model User wajib type sama dengan **interface User** di `shared/src/index.ts`.

---
## Generate Prisma

```bash
bunx --bun prisma migrate dev --name init
bunx --bun prisma generate # generate the Prisma Client backend/src/prisma/generate
```
Jika gagal load DATABASE_URL. ganti fungsi env bawaan prisma ke process.env node.
di `apps\backend\prisma.config.ts`:
```ts
import { defineConfig, env } from "prisma/config";
// jadi ⬇️
import { defineConfig } from "prisma/config";
// -----------------
    url: env("DATABASE_URL"),
// jadi ⬇️
    url: process.env.DATABASE_URL || "file:./dev.db",
``` 

Buat `apps/backend/prisma/db.ts`:
```ts
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL || "file:./dev.db" });
export const prisma = new PrismaClient({ adapter });
```

---

# 3. Seed Dummy Data (di apps/backend)

buat file `prisma/seed.ts`:

```ts
import { prisma } from './db';

async function main() {
  await prisma.user.createMany({
    data: [
      {
        name: "Leo Tobing",
        email: "leo@example.com"
      },
      {
        name: "John Doe",
        email: "john@example.com"
      },
      {
        name: "Jane Smith",
        email: "jane@example.com"
      }
    ]
  })
}

main().finally(() => prisma.$disconnect())
```
Jalankan: `bun prisma/seed.ts` (insert data user ke database, tidak perlu run server lebih dulu)

FIX: jika dapat error Cannot find module `@prisma/client-runtime-utils`, jalankan saja `bun add @prisma/client-runtime-utils`.
---

# 4. Backend API

`apps/backend/src/index.ts`

Menggunakan **ElysiaJs** (ringan untuk Bun). Modifikasi dengan menambahkan prisma untuk kelola path `"/user"`. Tambahkan port di cors origin apabila port frontend berubah (cth: 5174)

```ts
import { prisma } from '../prisma/db';
import type { ApiResponse, HealthCheck, User } from "shared";

const app = new Elysia()
  .use(cors({ origin: ["http://localhost:5173", "http://localhost:5174"] }))
  .use(swagger())
  .get("/", (): ApiResponse<HealthCheck> => {
    return {
      data: { status: "ok" },
      message: "server running"
    }
  })
  .get("/users", async () => {
    const users = await prisma.user.findMany()
    const response: ApiResponse<User[]> = {
      data: users,
      message: "User list retrieved"
    }
    return response
  })
  .listen(3000);
```
Jalankan `bun dev`, periksa API route **/users** melalui swagger. Response:

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Leo Tobing",
      "email": "leo@example.com"
    }
  ],
  "message": "User list"
}
```

---

# 5. Frontend UI (ShadCN)
Membuat tampilan frontend untuk tampilan data **users**.
Install komponen yang belum ada:

```bash
cd ../frontend
bunx --bun shadcn@latest add table card
```

---

## File UI
buat `apps/frontend/src/App2.tsx`:

```tsx
import { useEffect, useState } from "react"
import type { User, ApiResponse } from "shared"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"

export default function App() {
  const [users, setUsers] = useState<User[]>([])

  const loadUsers = async () => {
    const res = await fetch("http://localhost:3000/users")
    const data: ApiResponse<User[]> = await res.json()

    setUsers(data.data)
  }

  useEffect(() => {
    loadUsers()
  }, [])

  return (
    <div className="flex justify-center p-10">

      <Card className="w-150">
        <CardHeader>
          <CardTitle>User List</CardTitle>
        </CardHeader>

        <CardContent>

          <Button onClick={loadUsers} className="mb-4">
            Refresh
          </Button>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.id}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                </TableRow>
              ))}
            </TableBody>

          </Table>

        </CardContent>
      </Card>

    </div>
  )
}
```

Gantikan import `App` yang ada di **main.tsx** dengan `App2`:
```ts
// import App from './App.tsx'
// import App from './ApiTest'
import App from './App2'
```

---

# 6. Jalankan server (frontend & backend)
```bash
cd ../..
bun dev
```



# Hasil Akhir

Frontend UI:

```
┌─────────────────────────┐
│        User List        │
├─────────────────────────┤
│ Refresh Button          │
│                         │
│ ID      Name     Email  │
│ 1       Leo      leo@   │
│ 2       John     john@  │
│ 3       Jane     jane@  │
└─────────────────────────┘
```

* Button → fetch API
* Backend → Prisma ambil database
* Types → **shared dipakai backend & frontend**

---

Struktur:

```
project
├── apps
│   ├ backend
│   │  ├ generated/client.ts     ← Kode akses DB
│   │  ├ prisma/schema.prisma    ← Inisiasi Skema Prisma DB (Driver, model, etc.)
│   │  ├ prisma.config.ts        ← Config dari server Backend ke client Prisma DB
│   │  └ src/server.ts           ← Main Backend File
│   │
│   └ frontend
│      └ src/App2.tsx            ← Akses Backend Prisma & Shared Type
│
├── packages/
│   └── shared/
│       └── src/index.ts         ← Shared types
    
```

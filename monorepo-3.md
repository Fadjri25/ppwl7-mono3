# Monorepo Phase 3
Integrasi **Google Classroom API** untuk mahasiswa mengambil data submisi tugas mereka.

- **Backend** → OAuth2 Google + route login + route ambil data Classroom
- **Frontend** → Grid tampil tugas, deskripsi, lampiran, skor, dan submisi mahasiswa

> Pastikan Phase 1 & 2 sudah berjalan dengan benar sebelum melanjutkan.

---

# 0. Persiapan
Agar Phase 2 sudah aman, bisa langsung clone repo ini:
```bash
git clone https://github.com/Leo42night/monorepo ppwl7-mono3
cd ppwl7-mono3 && bun install
cd apps/backend && bunx --bun prisma generate
cd ../.. && bun dev
```

# 1. Setup Google Cloud Project

Sebelum mulai coding, kita perlu daftarkan aplikasi di Google Cloud Console.

## 1.1 Buat Project & Aktifkan API

1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Buat project baru, misal `monorepo`
3. Di menu **APIs & Services → Library**, cari dan aktifkan:
   - **Google Classroom API**
   [contoh-google-classroom-api-open.png](https://github.com/user-attachments/assets/7b11bd43-204b-4a59-b8f6-992a55227a36):
<img width="960" height="auto" alt="Image" src="https://github.com/user-attachments/assets/7b11bd43-204b-4a59-b8f6-992a55227a36" />

## 1.2 Buat OAuth2 Credentials

1. Buka **APIs & Services → Credentials**
2. sebelum buat Credential, Klik **Configure concent screen**:
   - di halaman *Oauth Overview*, klik **Get Started**
   - **App name** `monorepo`
   - **User Support Email**: email kamu yang terdaftar di Classroom
   - **Audience** `external`
   - **Contact Information**: email yang sama
   - **Finish**: checklist agree -> klik **Continue** -> klik **Create**  
3. di halaman *Oauth Overview*: klik **Create OAuth client**
   - Application type: **Web application**
   - **Name**: `web monorepo`
   - Tambahkan ke **Authorized redirect URIs**:
   ```
   http://localhost:3000/auth/callback
   ```
4. klik **Download JSON** berisi Client ID & Secret. Salin `ID` & `Secret` ke .env di backend.
   - [contoh-oauth-credential.png](https://github.com/user-attachments/assets/81fc0179-256c-4783-8e7f-cc25edf0ee0c):
<img width="1919" height="1199" alt="Image" src="https://github.com/user-attachments/assets/81fc0179-256c-4783-8e7f-cc25edf0ee0c" />

## 1.3 Tambahkan ke `.env` Backend

Edit `apps/backend/.env`:

```env
DATABASE_URL="file:./dev.db"

GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback
SESSION_SECRET=random_string_rahasia_panjang
```
Session secret key bisa buat pakai [secretkeygen](https://secretkeygen.vercel.app/)

---

# 2. Install Dependencies Backend

```bash
cd apps/backend
bun add @googleapis/classroom googleapis
bun add @elysiajs/cookie
```

---

# 3. Backend: OAuth2 & Google Classroom Routes

## 3.1 Buat `src/auth.ts` — Google OAuth2 Helper
**🌟FastTips create file**: di apps\backend run `code ./src/auth.ts`. file otomatis dibuat & dibuka. 
```ts
import { google } from "googleapis";

export function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(oauth2Client: InstanceType<typeof google.auth.OAuth2>) {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/classroom.courses.readonly",
      "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
      "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    prompt: "consent",
  });
}
```

## 3.2 Buat `src/classroom.ts` — Fetch Data Classroom

```ts
import { google } from "googleapis";

export interface CourseWork {
  id: string;
  title: string;
  description?: string;
  dueDate?: { year: number; month: number; day: number };
  maxPoints?: number;
  materials?: Material[];
}

export interface Material {
  driveFile?: { driveFile: { id: string; title: string; alternateLink: string } };
  youtubeVideo?: { id: string; title: string; alternateLink: string };
  link?: { url: string; title: string };
  form?: { formUrl: string; title: string };
}

export interface Submission {
  id: string;
  courseWorkId: string;
  state: string;
  assignedGrade?: number;
  draftGrade?: number;
  late?: boolean;
  assignmentSubmission?: {
    attachments?: SubmissionAttachment[];
  };
  shortAnswerSubmission?: { answer: string };
  multipleChoiceSubmission?: { answer: string };
}

export interface SubmissionAttachment {
  driveFile?: { id: string; title: string; alternateLink: string };
  link?: { url: string; title: string };
  form?: { formUrl: string; title: string; responseUrl: string };
  youtubeVideo?: { id: string; title: string; alternateLink: string };
}

export async function getCourses(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const classroom = google.classroom({ version: "v1", auth });
  const res = await classroom.courses.list({ studentId: "me", pageSize: 20 });
  return res.data.courses ?? [];
}

export async function getCourseWorks(accessToken: string, courseId: string): Promise<CourseWork[]> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const classroom = google.classroom({ version: "v1", auth });
  const res = await classroom.courses.courseWork.list({
    courseId,
    pageSize: 20,
    orderBy: "dueDate desc",
  });
  return (res.data.courseWork ?? []) as CourseWork[];
}

export async function getSubmissions(accessToken: string, courseId: string): Promise<Submission[]> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const classroom = google.classroom({ version: "v1", auth });
  const res = await classroom.courses.courseWork.studentSubmissions.list({
    courseId,
    courseWorkId: "-",
    userId: "me",
    pageSize: 50,
  });
  return (res.data.studentSubmissions ?? []) as Submission[];
}
```

## 3.3 Update `src/index.ts` — Tambah Routes Auth & Classroom

Modifikasi `apps/backend/src/index.ts`:

```ts
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { cookie } from "@elysiajs/cookie";
import { prisma } from "../prisma/db";
import { createOAuthClient, getAuthUrl } from "./auth";
import { getCourses, getCourseWorks, getSubmissions } from "./classroom";
import type { ApiResponse, HealthCheck, User } from "shared";

// Simple in-memory token store (ganti dengan database/session untuk production)
const tokenStore = new Map<string, { access_token: string; refresh_token?: string }>();

const app = new Elysia()
  .use(cors({ origin: ["http://localhost:5173", "http://localhost:5174"], credentials: true }))
  .use(swagger())
  .use(cookie())

  // Health check
  .get("/", (): ApiResponse<HealthCheck> => ({
    data: { status: "ok" },
    message: "server running",
  }))

  // Users (dari Phase 2)
  .get("/users", async () => {
    const users = await prisma.user.findMany();
    const response: ApiResponse<User[]> = {
      data: users,
      message: "User list retrieved",
    };
    return response;
  })

  // --- AUTH ROUTES ---

  // Redirect mahasiswa ke halaman login Google
  .get("/auth/login", ({ redirect }) => {
    const oauth2Client = createOAuthClient();
    const url = getAuthUrl(oauth2Client);
    return redirect(url);
  })

  // Google callback setelah login
  .get("/auth/callback", async ({ query, set, cookie: { session }, redirect }) => {
    const { code } = query as { code: string };

    if (!code) {
      set.status = 400;
      return { error: "Missing authorization code" };
    }

    const oauth2Client = createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    // Simpan token dengan session ID sederhana
    const sessionId = crypto.randomUUID();
    tokenStore.set(sessionId, {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token ?? undefined,
    });
    if (!session) return;

    // Set cookie session
    session.value = sessionId;
    session.maxAge = 60 * 60 * 24; // 1 hari

    // Redirect ke frontend
    return redirect("http://localhost:5173/classroom");
  })

  // Cek status login
  .get("/auth/me", ({ cookie: { session } }) => {
    const sessionId = session?.value as string;
    if (!sessionId || !tokenStore.has(sessionId)) {
      return { loggedIn: false };
    }
    return { loggedIn: true, sessionId };
  })

  // Logout
  .post("/auth/logout", ({ cookie: { session } }) => {
    if(!session) return { success: false };

    const sessionId = session?.value as string;
    if (sessionId) {
      tokenStore.delete(sessionId);
      session.remove();
    }
    return { success: true };
  })

  // --- CLASSROOM ROUTES ---

  // Ambil daftar courses mahasiswa
  .get("/classroom/courses", async ({ cookie: { session }, set }) => {
    const sessionId = session?.value as string;
    const tokens = sessionId ? tokenStore.get(sessionId) : null;

    if (!tokens) {
      set.status = 401;
      return { error: "Unauthorized. Silakan login terlebih dahulu." };
    }

    const courses = await getCourses(tokens.access_token);
    return { data: courses, message: "Courses retrieved" };
  })

  // Ambil coursework + submisi untuk satu course
  .get("/classroom/courses/:courseId/submissions", async ({ params, cookie: { session }, set }) => {
    const sessionId = session?.value as string;
    const tokens = sessionId ? tokenStore.get(sessionId) : null;

    if (!tokens) {
      set.status = 401;
      return { error: "Unauthorized. Silakan login terlebih dahulu." };
    }

    const { courseId } = params;

    const [courseWorks, submissions] = await Promise.all([
      getCourseWorks(tokens.access_token, courseId),
      getSubmissions(tokens.access_token, courseId),
    ]);

    // Gabungkan coursework dengan submisi
    const submissionMap = new Map(submissions.map((s) => [s.courseWorkId, s]));

    const result = courseWorks.map((cw) => ({
      courseWork: cw,
      submission: submissionMap.get(cw.id) ?? null,
    }));

    return { data: result, message: "Course submissions retrieved" };
  })

  .listen(3000);

console.log(`🦊 Backend → http://localhost:${app.server?.port}`);
console.log(`📖 Swagger → http://localhost:${app.server?.port}/swagger`);

export type App = typeof app;
```

Test backend dengan jalankan `bun dev`, lalu buka `/swagger` dan pastikan route baru muncul.

---

# 4. Shared Types: Tambah Classroom Types

`packages/shared/src/index.ts`, tambahkan:

```ts
export interface Course {
  id: string;
  name: string;
  section?: string;
  descriptionHeading?: string;
  room?: string;
  enrollmentCode?: string;
}

export interface CourseMaterial {
  driveFile?: { driveFile: { id: string; title: string; alternateLink: string } };
  youtubeVideo?: { id: string; title: string; alternateLink: string };
  link?: { url: string; title: string };
  form?: { formUrl: string; title: string };
}

export interface CourseWorkItem {
  id: string;
  title: string;
  description?: string;
  dueDate?: { year: number; month: number; day: number };
  maxPoints?: number;
  materials?: CourseMaterial[];
}

export interface SubmissionAttachmentItem {
  driveFile?: { id: string; title: string; alternateLink: string };
  link?: { url: string; title: string };
  form?: { formUrl: string; title: string; responseUrl: string };
  youtubeVideo?: { id: string; title: string; alternateLink: string };
}

export interface StudentSubmission {
  id: string;
  courseWorkId: string;
  state: string; // "NEW" | "CREATED" | "TURNED_IN" | "RETURNED" | "RECLAIMED_BY_STUDENT"
  assignedGrade?: number;
  draftGrade?: number;
  late?: boolean;
  assignmentSubmission?: { attachments?: SubmissionAttachmentItem[] };
  shortAnswerSubmission?: { answer: string };
  multipleChoiceSubmission?: { answer: string };
}

export interface CourseWorkWithSubmission {
  courseWork: CourseWorkItem;
  submission: StudentSubmission | null;
}
```

---

# 5. Frontend: `App3.tsx` — Grid Tampilan Tugas & Submisi

Install komponen ShadCN yang dibutuhkan:

```bash
cd apps/frontend
bunx --bun shadcn@latest add badge separator scroll-area
```

Buat `apps/frontend/src/App3.tsx`:

```tsx
import { useEffect, useState } from "react"
import type { Course, CourseWorkWithSubmission, SubmissionAttachmentItem } from "shared"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatDueDate(dueDate?: { year: number; month: number; day: number }) {
  if (!dueDate) return "Tidak ada deadline"
  return new Date(dueDate.year, dueDate.month - 1, dueDate.day).toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  })
}

function stateLabel(state?: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    TURNED_IN: { label: "Dikumpulkan", variant: "default" },
    RETURNED: { label: "Dinilai", variant: "secondary" },
    CREATED: { label: "Belum Dikumpulkan", variant: "destructive" },
    NEW: { label: "Belum Dimulai", variant: "outline" },
    RECLAIMED_BY_STUDENT: { label: "Ditarik Kembali", variant: "outline" },
  }
  return map[state ?? ""] ?? { label: state ?? "–", variant: "outline" }
}

// ─────────────────────────────────────────────
// Sub-komponen: satu kartu tugas
// ─────────────────────────────────────────────

function AttachmentLink({ att }: { att: SubmissionAttachmentItem }) {
  if (att.driveFile) {
    return (
      <a href={att.driveFile.alternateLink} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 text-blue-600 hover:underline text-sm">
        📄 {att.driveFile.title}
      </a>
    )
  }
  if (att.link) {
    return (
      <a href={att.link.url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 text-blue-600 hover:underline text-sm">
        🔗 {att.link.title || att.link.url}
      </a>
    )
  }
  if (att.youtubeVideo) {
    return (
      <a href={att.youtubeVideo.alternateLink} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 text-red-600 hover:underline text-sm">
        ▶ {att.youtubeVideo.title}
      </a>
    )
  }
  if (att.form) {
    return (
      <a href={att.form.responseUrl || att.form.formUrl} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 text-green-600 hover:underline text-sm">
        📝 {att.form.title}
      </a>
    )
  }
  return null
}

function CourseWorkCard({ item }: { item: CourseWorkWithSubmission }) {
  const { courseWork, submission } = item
  const { label, variant } = stateLabel(submission?.state)

  const attachments = submission?.assignmentSubmission?.attachments ?? []
  const score = submission?.assignedGrade ?? submission?.draftGrade

  return (
    <Card className="flex flex-col h-full shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug wrap-break-word min-w-0">
            {courseWork.title}
          </CardTitle>
          <Badge variant={variant} className="shrink-0 whitespace-nowrap">
            {label}
          </Badge>
        </div>
        <CardDescription className="text-xs mt-1">
          🗓 {formatDueDate(courseWork.dueDate)}
        </CardDescription>
      </CardHeader>

      <Separator className="shrink-0" />

      {/*
    ScrollArea membungkus seluruh body — card tidak akan
    tumbuh melebihi tinggi container grid-nya.
    Hapus ScrollArea kalau kamu tidak pakai fixed-height grid.
  */}
      <ScrollArea className="flex-1 min-h-0">
        <CardContent className="flex flex-col gap-3 pt-3 pb-4">

          {/* Deskripsi tugas */}
          {courseWork.description && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-muted-foreground">DESKRIPSI</p>
              {/* line-clamp-4: potong deskripsi panjang, tidak mendorong elemen lain */}
              <p className="text-sm text-foreground whitespace-pre-wrap wrap-break-word line-clamp-4">
                {courseWork.description}
              </p>
            </div>
          )}

          {/* Lampiran soal */}
          {courseWork.materials && courseWork.materials.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-muted-foreground">LAMPIRAN TUGAS</p>
              <div className="flex flex-col gap-1">
                {courseWork.materials.map((mat, i) => {
                  const att: SubmissionAttachmentItem = {
                    driveFile: mat.driveFile?.driveFile,
                    link: mat.link,
                    youtubeVideo: mat.youtubeVideo,
                    form: mat.form
                      ? { formUrl: mat.form.formUrl, title: mat.form.title, responseUrl: "" }
                      : undefined,
                  }
                  return <AttachmentLink key={i} att={att} />
                })}
              </div>
            </div>
          )}

          {/* Skor */}
          {submission && (
            <div className="flex items-center gap-2 shrink-0">
              <p className="text-xs font-semibold text-muted-foreground shrink-0">SKOR</p>
              {score !== undefined ? (
                <span className="text-sm font-bold text-primary">
                  {score} / {courseWork.maxPoints ?? "–"}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">Belum dinilai</span>
              )}
            </div>
          )}

          {/* Lampiran submisi mahasiswa */}
          {attachments.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-muted-foreground">LAMPIRAN SUBMISI KAMU</p>
              <div className="flex flex-col gap-1">
                {attachments.map((att, i) => (
                  <AttachmentLink key={i} att={att} />
                ))}
              </div>
            </div>
          )}

          {/* Short answer */}
          {submission?.shortAnswerSubmission?.answer && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-muted-foreground">JAWABAN SINGKATMU</p>
              {/* break-words: cegah teks panjang tanpa spasi meluber keluar card */}
              <p className="text-sm italic wrap-break-word">
                "{submission.shortAnswerSubmission.answer}"
              </p>
            </div>
          )}

          {/* Late badge — selalu paling bawah, diberi padding atas */}
          {submission?.late && (
            <div className="pt-1">
              <Badge variant="destructive" className="w-fit text-xs">
                ⚠ Terlambat
              </Badge>
            </div>
          )}

        </CardContent>
      </ScrollArea>
    </Card>
  )
}

// ─────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────

export default function App() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const [items, setItems] = useState<CourseWorkWithSubmission[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cek status login
  useEffect(() => {
    fetch("http://localhost:3000/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setLoggedIn(d.loggedIn))
      .catch(() => setLoggedIn(false))
  }, [])

  // Load daftar courses setelah login
  useEffect(() => {
    if (!loggedIn) return
    fetch("http://localhost:3000/classroom/courses", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setCourses(d.data ?? []))
  }, [loggedIn])

  // Load submissions ketika course dipilih
  const loadSubmissions = async (courseId: string) => {
    setSelectedCourse(courseId)
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `http://localhost:3000/classroom/courses/${courseId}/submissions`,
        { credentials: "include" }
      )
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setItems(d.data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Terjadi error")
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = () => {
    window.location.href = "http://localhost:3000/auth/login"
  }

  const handleLogout = async () => {
    await fetch("http://localhost:3000/auth/logout", { method: "POST", credentials: "include" })
    setLoggedIn(false)
    setCourses([])
    setItems([])
    setSelectedCourse(null)
  }

  // ── Render ──

  if (loggedIn === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Memuat...</p>
      </div>
    )
  }

  if (!loggedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-2xl font-bold">Google Classroom Viewer</h1>
        <p className="text-muted-foreground">Login dengan akun Google kampus kamu</p>
        <Button onClick={handleLogin} size="lg">
          🎓 Login dengan Google
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">📚 Google Classroom Viewer</h1>
        <Button variant="outline" onClick={handleLogout}>Logout</Button>
      </div>

      {/* Pilih Course */}
      <div className="mb-6">
        <p className="text-sm font-semibold text-muted-foreground mb-2">PILIH MATA KULIAH</p>
        <div className="flex flex-wrap gap-2">
          {courses.length === 0 && (
            <p className="text-sm text-muted-foreground">Tidak ada mata kuliah ditemukan.</p>
          )}
          {courses.map((c) => (
            <Button
              key={c.id}
              variant={selectedCourse === c.id ? "default" : "outline"}
              size="sm"
              onClick={() => loadSubmissions(c.id)}
            >
              {c.name}
              {c.section && <span className="ml-1 text-xs opacity-70">· {c.section}</span>}
            </Button>
          ))}
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Status / error */}
      {error && (
        <div className="mb-4 p-3 rounded bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {loading && (
        <div className="text-center py-12 text-muted-foreground">Mengambil data tugas...</div>
      )}

      {/* Grid tugas */}
      {!loading && items.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground mb-4">{items.length} tugas ditemukan</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((item) => (
              <CourseWorkCard key={item.courseWork.id} item={item} />
            ))}
          </div>
        </>
      )}

      {!loading && selectedCourse && items.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">Tidak ada tugas di mata kuliah ini.</div>
      )}

    </div>
  )
}
```

---

# 6. Daftarkan Route `/classroom` di Frontend

Karena kita menggunakan React single-page (tanpa router), tambahkan logic route sederhana di `main.tsx`:

```tsx
// apps/frontend/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Routing sederhana berdasarkan path
const path = window.location.pathname

let App
if (path === '/classroom') {
  const { default: ClassroomApp } = await import('./App3')
  App = ClassroomApp
} else {
  const { default: DefaultApp } = await import('./App2')
  App = DefaultApp
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

> **Alternatif:** Install `react-router-dom` dan pakai `<BrowserRouter>` untuk routing yang lebih proper.

---

# 7. Konfigurasi CORS Cookie di Vite

Edit `apps/frontend/vite.config.ts` — pastikan proxy sudah ada (dari Phase 1):

```ts
server: {
  port: 5173,
  strictPort: true,
  proxy: {
    "/api": { target: "http://localhost:3000", changeOrigin: true },
  },
},
```

---

# 8. Jalankan Server

```bash
cd ../..
bun dev
```

Akses:
- Frontend: [http://localhost:5173](http://localhost:5173) ← App2 (user list dari Phase 2)
- Frontend Classroom: [http://localhost:5173/classroom](http://localhost:5173/classroom) ← App3. 
- Backend API: [http://localhost:3000/swagger](http://localhost:3000/swagger)

Alur penggunaan mahasiswa:
1. Buka `http://localhost:5173/classroom`
2. Klik **Login dengan Google**
3. Pilih akun Google kampus → izinkan akses Classroom. Tampilan harusnya seperti berikut:   
   - [contoh-ouath-classroom-izin.png](https://github.com/user-attachments/assets/9406a688-1d5a-4da7-89b8-10b852cfda81): 
   <img width="960" height="auto" alt="Image" src="https://github.com/user-attachments/assets/9406a688-1d5a-4da7-89b8-10b852cfda81" alt="contoh-ouath-classroom-izin.png"/>

4. Di-redirect kembali ke `/classroom`
5. Pilih mata kuliah → lihat grid tugas + submisi.

   - [contoh-fe-classroom-list.png](https://github.com/user-attachments/assets/889615f4-5ec4-4c6f-b00f-4e347c4ea74c):
<img width="960" height="auto" alt="Image" src="https://github.com/user-attachments/assets/889615f4-5ec4-4c6f-b00f-4e347c4ea74c" alt="contoh-fe-classroom-list.png"/>

---

# Hasil Akhir

```
┌──────────────────────────────────────────────────┐
│  📚 Google Classroom Viewer         [Logout]     │
│                                                  │
│  PILIH MATA KULIAH                               │
│  [Pemrograman Web] [Basis Data] [Algoritma]      │
│                                                  │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌───────────────┐ ┌───────────────┐             │
│  │ Tugas 1       │ │ Tugas 2       │             │
│  │ [Dikumpulkan] │ │ [Dinilai]     │             │
│  │ 🗓 10 Jun 2025│ │ 🗓 15 Jun 2025│             │
│  │───────────────│ │───────────────│             │
│  │ DESKRIPSI     │ │ DESKRIPSI     │             │
│  │ Buat REST API │ │ ERD Database  │             │
│  │               │ │               │             │
│  │ LAMPIRAN TUGAS│ │ SKOR          │             │
│  │ 📄 Soal.pdf   │ │ 90 / 100      │             │
│  │               │ │               │             │
│  │ LAMPIRAN KAMU │ │ LAMPIRAN KAMU │             │
│  │ 📄 Jawaban.zip│ │ 🔗 Github.com │             │
│  └───────────────┘ └───────────────┘             │
└──────────────────────────────────────────────────┘
```

---

# Bug Handling

### `redirect_uri_mismatch` dari Google
URI di Google Cloud Console **harus persis sama** dengan `GOOGLE_REDIRECT_URI` di `.env`. Cek trailing slash dan protokol (`http` vs `https`).

### Scope tidak cukup / `403 Forbidden` dari Classroom API
Pastikan akun Google yang dipakai adalah akun yang **terdaftar sebagai student** di Google Classroom. Akun pribadi (@gmail.com) yang tidak join kelas akan mengembalikan data kosong.

### Token expired
Implementasi sederhana ini tidak auto-refresh token. Untuk production, gunakan `refresh_token` via `oauth2Client.refreshAccessToken()` dan simpan token di database.

---

# Struktur Akhir Phase 3

```
monorepo/
├── apps/
│   ├── frontend/
│   │   └── src/
│   │       ├── App3.tsx            ← Grid Classroom UI (NEW)
│   │       └── main.tsx            ← Simple routing
│   └── backend/
│       └── src/
│           ├── auth.ts             ← OAuth2 helper (NEW)
│           ├── classroom.ts        ← Google Classroom fetcher (NEW)
│           └── index.ts            ← Routes: /auth/* & /classroom/* (UPDATED)
│           └── .env                ← Database, Google Client & Redirect URI, Sessions (UPDATED)
└── packages/
    └── shared/
        └── src/index.ts            ← + Classroom types (UPDATED)
```

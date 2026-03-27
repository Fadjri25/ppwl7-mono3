import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { cookie } from "@elysiajs/cookie";
import { prisma } from "../prisma/db";
import { createOAuthClient, getAuthUrl } from "./auth";
import { getCourses, getCourseWorks, getSubmissions } from "./classroom";
import type { ApiResponse, HealthCheck, User } from "shared";

// !!! Fungsi isBrowserRequest
const isBrowserRequest = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const accept = request.headers.get("accept") ?? "";

  // Browser biasanya kirim Accept: text/html
  const acceptsHtml = accept.includes("text/html");

  // Tidak ada origin & referer = direct browser access / curl
  // Tapi curl tidak kirim Accept: text/html, browser kirim
  return acceptsHtml && !origin && !referer;
};

const app = new Elysia()
  // !!! Setingan CORS dinamis menggunakan env (DITAMBAH CREDENTIALS: TRUE)
  .use(
    cors({
      origin: [process.env.FRONTEND_URL ?? "", process.env.TEST_URL ?? ""],
      credentials: true, // WAJIB ADA AGAR COOKIE BISA LEWAT ANTAR DOMAIN
    })
  )
  // !!! Tambahkan pengecekan API_KEY untuk akses browser
  .onRequest(({ request, set }) => {
    const origin = request.headers.get("origin");
    const frontendUrl = process.env.FRONTEND_URL ?? "";

    // Jika request dari FRONTEND_URL → langsung izinkan
    if (origin && origin === frontendUrl) return;

    // Jika akses dari browser langsung → wajib ada ?key=
    if (isBrowserRequest(request)) {
      const url = new URL(request.url);
      const key = url.searchParams.get("key");

      if (!key || key !== process.env.API_KEY) {
        set.status = 401;
        return { message: "Unauthorized: missing or invalid key" };
      }
    }
  })
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

    // !!! SIMPAN KE DATABASE (Menggantikan tokenStore Map agar tidak amnesia di Vercel)
    const newSession = await prisma.session.create({
      data: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token ?? undefined,
      },
    });

    if (!session) return;

    // !!! SET COOKIE DENGAN KEAMANAN KHUSUS BEDA DOMAIN
    session.set({
      value: newSession.id,
      maxAge: 60 * 60 * 24, // 1 hari
      path: "/",
      sameSite: "none", // WAJIB untuk Vercel (beda domain backend & frontend)
      secure: true,     // WAJIB jika sameSite none
      httpOnly: true,
    });

    return redirect(`${process.env.FRONTEND_URL}`);
  })

  // Cek status login
  .get("/auth/me", async ({ cookie: { session } }) => {
    const sessionId = session?.value as string;
    if (!sessionId) return { loggedIn: false };

    // Cek token dari Database Prisma
    const dbSession = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!dbSession) return { loggedIn: false };
    return { loggedIn: true, sessionId };
  })

  // Logout
  .post("/auth/logout", async ({ cookie: { session } }) => {
    if (!session) return { success: false };

    const sessionId = session?.value as string;
    if (sessionId) {
      // Hapus sesi dari database
      await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
      session.remove();
    }
    return { success: true };
  })

  // --- CLASSROOM ROUTES ---

  // Ambil daftar courses mahasiswa
  .get("/classroom/courses", async ({ cookie: { session }, set }) => {
    const sessionId = session?.value as string;
    const dbSession = sessionId ? await prisma.session.findUnique({ where: { id: sessionId } }) : null;

    if (!dbSession) {
      set.status = 401;
      return { error: "Unauthorized. Silakan login terlebih dahulu." };
    }

    const courses = await getCourses(dbSession.accessToken);
    return { data: courses, message: "Courses retrieved" };
  })

  // Ambil coursework + submisi untuk satu course
  .get("/classroom/courses/:courseId/submissions", async ({ params, cookie: { session }, set }) => {
    const sessionId = session?.value as string;
    const dbSession = sessionId ? await prisma.session.findUnique({ where: { id: sessionId } }) : null;

    if (!dbSession) {
      set.status = 401;
      return { error: "Unauthorized. Silakan login terlebih dahulu." };
    }

    const { courseId } = params;

    const [courseWorks, submissions] = await Promise.all([
      getCourseWorks(dbSession.accessToken, courseId),
      getSubmissions(dbSession.accessToken, courseId),
    ]);

    // Gabungkan coursework dengan submisi
    const submissionMap = new Map(submissions.map((s) => [s.courseWorkId, s]));

    const result = courseWorks.map((cw) => ({
      courseWork: cw,
      submission: submissionMap.get(cw.id) ?? null,
    }));

    return { data: result, message: "Course submissions retrieved" };
  });

// export App yang asli
export type App = typeof app;

// !!! Tambahkan console.log kondisional dan mode development
if (process.env.NODE_ENV != "production") {
  app.listen(3000);
  console.log(`🦊 Backend → http://localhost:3000`);
  console.log(`🦊 TEST_URL: ${process.env.TEST_URL}`);
  console.log(`🦊 DATABASE_URL: ${process.env.DATABASE_URL}`);
}

// !!! Tambahkan export default app agar bisa dibaca Vercel
export default app;
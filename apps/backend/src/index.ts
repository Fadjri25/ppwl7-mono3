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

  const acceptsHtml = accept.includes("text/html");
  return acceptsHtml && !origin && !referer;
};

const app = new Elysia()
  // !!! Setingan CORS Diperketat untuk Vercel
  .use(
    cors({
      // Hanya mengizinkan origin spesifik, jangan pakai array jika bisa, tapi jika butuh dua, ini oke.
      // Pastikan process.env.FRONTEND_URL TIDAK diakhiri dengan '/'
      origin: [process.env.FRONTEND_URL ?? "", process.env.TEST_URL ?? ""].filter(Boolean),
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    })
  )
  .onRequest(({ request, set }) => {
    const origin = request.headers.get("origin");
    const frontendUrl = process.env.FRONTEND_URL ?? "";

    if (origin && origin === frontendUrl) return;

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

  // Users
  .get("/users", async () => {
    const users = await prisma.user.findMany();
    const response: ApiResponse<User[]> = {
      data: users,
      message: "User list retrieved",
    };
    return response;
  })

  // --- AUTH ROUTES ---

  .get("/auth/login", ({ redirect }) => {
    const oauth2Client = createOAuthClient();
    const url = getAuthUrl(oauth2Client);
    return redirect(url);
  })

  .get("/auth/callback", async ({ query, set, cookie: { session }, redirect }) => {
    const { code } = query as { code: string };

    if (!code) {
      set.status = 400;
      return { error: "Missing authorization code" };
    }

    const oauth2Client = createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    const newSession = await prisma.session.create({
      data: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token ?? undefined,
      },
    });

    if (!session) return;

    // !!! SET COOKIE (GAYA BARU YANG LEBIH AMAN UNTUK VERCEL)
    session.value = newSession.id;
    session.maxAge = 86400; // 1 hari
    session.path = "/";
    session.sameSite = "none";
    session.secure = true;
    session.httpOnly = true;

    return redirect(`${process.env.FRONTEND_URL}`);
  })

  .get("/auth/me", async ({ cookie: { session } }) => {
    const sessionId = session?.value as string;
    if (!sessionId) return { loggedIn: false };

    const dbSession = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!dbSession) return { loggedIn: false };
    return { loggedIn: true, sessionId };
  })

  .post("/auth/logout", async ({ cookie: { session } }) => {
    if (!session) return { success: false };

    const sessionId = session?.value as string;
    if (sessionId) {
      await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
      session.remove();
    }
    return { success: true };
  })

  // --- CLASSROOM ROUTES ---

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

    const submissionMap = new Map(submissions.map((s) => [s.courseWorkId, s]));

    const result = courseWorks.map((cw) => ({
      courseWork: cw,
      submission: submissionMap.get(cw.id) ?? null,
    }));

    return { data: result, message: "Course submissions retrieved" };
  });

export type App = typeof app;

if (process.env.NODE_ENV != "production") {
  app.listen(3000);
  console.log(`🦊 Backend → http://localhost:3000`);
  console.log(`🦊 TEST_URL: ${process.env.TEST_URL}`);
  console.log(`🦊 DATABASE_URL: ${process.env.DATABASE_URL}`);
}

export default app;
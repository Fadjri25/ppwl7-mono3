import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

// Menggunakan path.resolve agar lokasi dev.db selalu akurat meski dijalankan dari dalam Docker
const dbUrl = process.env.DATABASE_URL || `file:${path.resolve(__dirname, "../dev.db")}`;

const adapter = new PrismaLibSql({ 
  url: dbUrl, 
  authToken: process.env.DB_AUTH_TOKEN 
});

export const prisma = new PrismaClient({ adapter });
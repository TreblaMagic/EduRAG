import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * In Next.js dev mode the module is re-evaluated on hot-reload, which would
 * otherwise create a new `PrismaClient` (and a new SQLite connection pool)
 * each time. Stashing it on `globalThis` keeps a single instance per process.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

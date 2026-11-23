import "dotenv/config";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Creates the first admin. Client and team accounts are added inside the app. */
async function main() {
  const email = process.env.SEED_EMAIL?.toLowerCase().trim();
  if (!email) throw new Error("Set SEED_EMAIL in .env first.");
  if (await prisma.user.findUnique({ where: { email } })) {
    console.log(`User ${email} already exists. Nothing changed.`);
    return;
  }
  const provided = process.env.SEED_PASSWORD;
  const password = provided || crypto.randomBytes(12).toString("base64url");
  await prisma.user.create({
    data: { email, name: "Admin", role: "ADMIN", passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`Admin created: ${email}`);
  if (!provided) console.log(`Generated password (shown once): ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

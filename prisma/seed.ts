import { Role } from "@prisma/client";

import { db } from "../lib/db";
import { hashPassword } from "../lib/password";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@bjerke.no";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await hashPassword(password);

  const existingAdmin = await db.user.findUnique({ where: { email } });
  if (!existingAdmin) {
    await db.user.create({
      data: {
        name: "System Admin",
        email,
        passwordHash,
        role: Role.ADMIN
      }
    });
  }
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });


const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, isActive: true, isDemo: true }
  });
  console.log('TOTAL_USERS:', users.length);
  for (const u of users) {
    console.log(USER:  | ROLE:  | ACTIVE:  | DEMO: );
  }
}
main().catch(console.error).finally(() => prisma.());
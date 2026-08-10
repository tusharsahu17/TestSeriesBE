const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$connect();
    console.log("OK");
  } catch (e) {
    console.log(e.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();

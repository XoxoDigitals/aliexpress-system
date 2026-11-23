import "dotenv/config";
import bcrypt from "bcryptjs";
import { Decimal } from "decimal.js";
import { PrismaClient, type OrderStatus, type User } from "@prisma/client";
import { encryptForOrder } from "../src/lib/secure";

/** Fictional demo data for local testing. Refuses to run in production. */
const prisma = new PrismaClient();
const DAY = 86_400_000;
const DEMO_RATE_PKR = 1000; // Charged to the client per order.
const DEMO_PURCHASE_PRICE_PKR = 700; // Admin-only processing price.
const CLIENTS = [
  ["Northwind Gifts", DEMO_RATE_PKR],
  ["Blue Harbor Home", DEMO_RATE_PKR],
  ["Maple & Co", DEMO_RATE_PKR],
  ["Urban Peak Supply", DEMO_RATE_PKR],
] as const;
const TEAM = ["Alex Rivera", "Sam Patel", "Jordan Lee"];
const PEOPLE = ["Avery Collins", "Riley Morgan", "Casey Bennett", "Taylor Brooks", "Quinn Foster", "Drew Hayes", "Morgan Reed", "Jamie Ward", "Skyler Price", "Parker Ellis"];
const PLACES = [
  ["Springfield", "IL", "62704"], ["Portland", "OR", "97205"], ["Austin", "TX", "78701"], ["Denver", "CO", "80202"],
  ["Madison", "WI", "53703"], ["Raleigh", "NC", "27601"], ["Tucson", "AZ", "85701"], ["Columbus", "OH", "43215"],
];
const PRODUCTS = [
  ["ceramic-mug", "White / 12 oz"], ["linen-pillow", "Sage / 18x18"], ["desk-lamp", "Matte Black"], ["canvas-tote", "Natural / Large"],
  ["wall-clock", "Walnut / 12 in"], ["throw-blanket", "Grey / Queen"], ["phone-stand", "Silver"], ["candle-set", "Vanilla / 3 pack"],
];
const ACCOUNTS = ["Buyer-01", "Buyer-02", "Buyer-03", "Buyer-04"];
const CARRIERS = ["USPS", "UPS", "FedEx", "DHL"];

let seed = 20261123;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo data cannot be seeded in production.");
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8) throw new Error("Set DEMO_PASSWORD in .env first.");
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!admin) throw new Error("Run npm run db:seed first.");
  if (await prisma.user.findUnique({ where: { email: "client1@demo.test" } })) {
    console.log("Demo data already exists. Nothing changed.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const clients: User[] = [];
  for (const [i, [name, rate]] of CLIENTS.entries()) {
    clients.push(await prisma.user.create({ data: { email: `client${i + 1}@demo.test`, name, role: "CLIENT", ratePerOrder: rate, passwordHash } }));
  }
  const team: User[] = [];
  for (const [i, name] of TEAM.entries()) {
    team.push(await prisma.user.create({ data: { email: `team${i + 1}@demo.test`, name, role: "TEAM", passwordHash } }));
  }

  const now = Date.now();
  let created = 0;
  for (let i = 0; i < 96; i++) {
    const client = clients[i % clients.length];
    const ageDays = Math.floor((i / 96) * 58) + random() * 0.8;
    const createdAt = new Date(now - ageDays * DAY - 3_600_000);
    const person = pick(PEOPLE);
    const [city, state, zip] = pick(PLACES);
    const [slug, variantName] = pick(PRODUCTS);
    const orderNumber = `DEMO-${String(i + 1).padStart(4, "0")}`;
    const roll = random();
    // Guaranteed mix: 12 unassigned, 12 assigned but unprocessed, 12 processing, the rest completed.
    const status: OrderStatus = i < 24 ? "NEW" : i < 36 ? "PROCESSING" : roll < 0.05 ? "CANCELLED" : "COMPLETED";
    const assignee = i < 12 ? null : team[i % team.length];
    const worked = status === "PROCESSING" || status === "COMPLETED";
    const processedAt = worked ? new Date(createdAt.getTime() + (1 + random() * 8) * 3_600_000) : null;
    const completedAt = status === "COMPLETED" ? new Date(processedAt!.getTime() + (4 + random() * 40) * 3_600_000) : null;
    const customerDetails = `${person}\n${100 + Math.floor(random() * 8900)} Example St\n${city}, ${state} ${zip}\nUnited States\n+1 555-01${String(Math.floor(random() * 100)).padStart(2, "0")}`;

    await prisma.order.create({
      data: {
        orderNumber,
        clientId: client.id,
        createdById: i % 4 === 0 ? admin.id : client.id,
        assignedToId: status === "CANCELLED" ? null : assignee?.id ?? null,
        status,
        paymentStatus: status === "COMPLETED" ? "PENDING" : "NOT_DUE",
        clientReference: i % 3 === 0 ? `REF-${1000 + i}` : null,
        customerName: person,
        customerDetails,
        productUrl: `https://shop.example.com/products/${slug}`,
        variantName,
        cardInfoEnc: status === "NEW" ? encryptForOrder("DEMO CARD, NOT REAL\n4242 4242 4242 4242  12/30  123", orderNumber) : null,
        rate: client.ratePerOrder!,
        accountName: worked ? pick(ACCOUNTS) : null,
        purchasePrice: worked ? DEMO_PURCHASE_PRICE_PKR : null,
        processedById: worked ? assignee?.id : null,
        processedAt,
        trackingNumber: status === "COMPLETED" ? `DEMO${String(100000000 + i * 7919)}` : null,
        carrier: status === "COMPLETED" ? pick(CARRIERS) : null,
        completedById: status === "COMPLETED" ? assignee?.id : null,
        completedAt,
        archived: status === "CANCELLED",
        archivedAt: status === "CANCELLED" ? createdAt : null,
        createdAt,
        events: {
          create: [
            { actorId: client.id, type: "CREATED", message: "Order created", createdAt },
            ...(processedAt ? [{ actorId: assignee?.id, type: "PROCESSING", message: "Processing started", createdAt: processedAt }] : []),
            ...(completedAt ? [{ actorId: assignee?.id, type: "COMPLETED", message: "Tracking added", createdAt: completedAt }] : []),
          ],
        },
      },
    });
    created++;
  }

  // Each client has paid for about two thirds of completed work, leaving a real pending balance.
  let paymentCount = 0;
  for (const client of clients) {
    const due = await prisma.order.findMany({
      where: { clientId: client.id, paymentStatus: "PENDING" },
      orderBy: { completedAt: "asc" },
      select: { id: true, rate: true, completedAt: true },
    });
    const paid = due.slice(0, Math.floor(due.length * 0.67));
    for (let start = 0; start < paid.length; start += 6) {
      const batch = paid.slice(start, start + 6);
      const amount = batch.reduce((s, o) => s.plus(o.rate.toString()), new Decimal(0));
      const receivedAt = new Date(batch[batch.length - 1].completedAt!.getTime() + DAY);
      const payment = await prisma.payment.create({
        data: { clientId: client.id, recordedById: admin.id, amount: amount.toFixed(2), appliedAmount: amount.toFixed(2), creditAfter: "0.00", mode: "AUTO", note: "Demo payment", receivedAt },
      });
      await prisma.order.updateMany({
        where: { id: { in: batch.map((o) => o.id) } },
        data: { paymentStatus: "PAID", paymentId: payment.id, paidAt: receivedAt, archived: true, archivedAt: receivedAt },
      });
      paymentCount++;
    }
  }

  console.log(`Demo data created: ${clients.length} clients, ${team.length} team members, ${created} orders, ${paymentCount} payments.`);
  console.log("Logins: client1-4@demo.test and team1-3@demo.test, password is DEMO_PASSWORD in .env");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

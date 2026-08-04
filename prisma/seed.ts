import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.appSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      autoPrintOnAccept: true,
      clubPurchasesRequired: 12,
      clubRewardProductName: "X-Burger Clássico",
      cashbackPercent: 3,
      storeName: "Burger GN",
      storePhone: "(11) 99999-0000",
      storeAddress: "Rua das Grelhas, 100",
    },
    update: {},
  });

  const products = [
    {
      name: "X-Burger Clássico",
      description: "Pão brioche, blend 160g, queijo, alface e molho da casa.",
      priceCents: 2490,
      category: "Hambúrgueres",
      isReward: true,
    },
    {
      name: "X-Bacon Smash",
      description: "Dois smashes, cheddar, bacon crocante e cebola caramelizada.",
      priceCents: 3290,
      category: "Hambúrgueres",
      isReward: false,
    },
    {
      name: "Chicken Crisp",
      description: "Frango empanado, maionese de alho e salada fresca.",
      priceCents: 2790,
      category: "Hambúrgueres",
      isReward: false,
    },
    {
      name: "Batata Rústica",
      description: "Porção generosa com páprica e parmesão.",
      priceCents: 1590,
      category: "Acompanhamentos",
      isReward: false,
    },
    {
      name: "Refrigerante Lata",
      description: "350ml — cola, guaraná ou laranja.",
      priceCents: 700,
      category: "Bebidas",
      isReward: false,
    },
  ];

  for (const product of products) {
    const existing = await prisma.product.findFirst({
      where: { name: product.name },
    });
    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: product,
      });
    } else {
      await prisma.product.create({ data: product });
    }
  }

  const reward = await prisma.product.findFirst({
    where: { isReward: true },
  });

  if (reward) {
    await prisma.appSettings.update({
      where: { id: 1 },
      data: {
        clubRewardProductId: reward.id,
        clubRewardProductName: reward.name,
      },
    });
  }

  const printerCount = await prisma.printer.count();
  if (printerCount === 0) {
    await prisma.printer.create({
      data: {
        name: "Cozinha 80mm",
        host: "192.168.1.100",
        port: 9100,
        paperWidth: "80",
        isDefault: true,
        active: true,
      },
    });
  }

  console.log("Seed concluído: Burger GN pronto.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

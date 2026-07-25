import { prisma } from "@/lib/db";

export async function ufToClp(amountUf: number, onDate = new Date()) {
  const day = new Date(onDate.getFullYear(), onDate.getMonth(), onDate.getDate(), 12);
  const rate = await prisma.ufRate.findFirst({
    where: { date: { lte: day } },
    orderBy: { date: "desc" },
  });
  if (!rate) return null;
  return Math.round(amountUf * rate.valueClp);
}

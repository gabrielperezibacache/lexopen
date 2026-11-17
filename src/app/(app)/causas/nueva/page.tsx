import { NuevaCausaForm } from "@/components/NuevaCausaForm";
import { requireStaffPage } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
export default async function NuevaCausaPage({
  searchParams,
}: {
  searchParams: Promise<{ clienteId?: string }>;
}) {
  const user = await requireStaffPage();
  const query = await searchParams;
  if (
    query.clienteId &&
    (typeof query.clienteId !== "string" || query.clienteId.length > 100)
  )
    notFound();
  const select = { id: true, razonSocial: true, rut: true } as const;
  const [clientes, selected] = await Promise.all([
    prisma.cliente.findMany({
      select,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 50,
    }),
    query.clienteId
      ? prisma.cliente.findUnique({ where: { id: query.clienteId }, select })
      : null,
  ]);
  if (query.clienteId && !selected) notFound();
  return (
    <NuevaCausaForm
      key={query.clienteId || "new"}
      userId={user.id}
      clientes={
        selected && !clientes.some((c) => c.id === selected.id)
          ? [selected, ...clientes]
          : clientes
      }
      initialClienteId={selected?.id || ""}
    />
  );
}

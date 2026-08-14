import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth/session";
import { CausaEditForm } from "@/components/CausaEditForm";

type Params = { params: Promise<{ id: string }> };

export default async function EditarCausaPage({ params }: Params) {
  await requireStaff();
  const { id } = await params;
  const [causa, clientes, abogados] = await Promise.all([
    prisma.causa.findUnique({
      where: { id },
      select: {
        id: true,
        titulo: true,
        rit: true,
        ruc: true,
        tribunal: true,
        materia: true,
        procedimiento: true,
        estado: true,
        etapa: true,
        caratula: true,
        resumen: true,
        sala: true,
        cuaderno: true,
        abogadoContraparte: true,
        clienteId: true,
        abogadoId: true,
      },
    }),
    prisma.cliente.findMany({
      select: { id: true, razonSocial: true },
      orderBy: { razonSocial: "asc" },
      take: 500,
    }),
    prisma.user.findMany({
      where: { role: { in: ["admin", "abogado", "asistente"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!causa) notFound();

  return (
    <CausaEditForm
      causa={causa}
      clientes={clientes.map((c) => ({ id: c.id, label: c.razonSocial }))}
      abogados={abogados.map((a) => ({ id: a.id, label: a.name }))}
    />
  );
}

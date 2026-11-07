import { BookOpen, CalendarDays, ContactRound, FolderOpen, GraduationCap, Building2 } from "lucide-react";
import { HOST_NAVIGATION_SECTIONS, type HostNavigationSection } from "@/lib/navigation/host-sections";

const choices = {
  causas: { icon: FolderOpen, title: ["Causas", "Matters"], description: ["Expedientes, escritos y audiencias.", "Case files, filings and hearings."] },
  agenda: { icon: CalendarDays, title: ["Agenda", "Calendar"], description: ["Calendario, plazos y tareas.", "Calendar, deadlines and tasks."] },
  biblioteca: { icon: BookOpen, title: ["Biblioteca", "Library"], description: ["Libros, sentencias y pasajes citables.", "Books, rulings and citable passages."] },
  academico: { icon: GraduationCap, title: ["Académico", "Academic"], description: ["Investigación, escritura y docencia.", "Research, writing and teaching."] },
  clientes: { icon: ContactRound, title: ["Clientes", "Clients"], description: ["Contactos y expedientes de clientes.", "Contacts and client records."] },
  estudio: { icon: Building2, title: ["Estudio", "Firm"], description: ["Equipo, espacios y administración.", "Team, spaces and administration."] },
} satisfies Record<HostNavigationSection, { icon: typeof BookOpen; title: string[]; description: string[] }>;

export function HostSectionChoices({ visible, onChange, locale = "es", disabled = false }: {
  visible: readonly HostNavigationSection[];
  onChange: (sections: HostNavigationSection[]) => void;
  locale?: "es" | "en";
  disabled?: boolean;
}) {
  const language = locale === "en" ? 1 : 0;
  return <fieldset disabled={disabled} className="min-w-0">
    <legend className="sr-only">{language ? "Visible sections" : "Apartados visibles"}</legend>
    <div className="grid gap-x-5 min-[520px]:grid-cols-2">
      {HOST_NAVIGATION_SECTIONS.map(id => {
        const { icon: Icon, title, description } = choices[id];
        const checked = visible.includes(id);
        return <label key={id} className="flex min-h-14 cursor-pointer items-start gap-2.5 border-b border-[var(--line)] py-3 text-sm has-[:disabled]:cursor-default">
          <input type="checkbox" checked={checked} className="mt-0.5 size-4 shrink-0 accent-[var(--action-bg)]"
            onChange={event => {
              const next = event.target.checked;
              onChange(HOST_NAVIGATION_SECTIONS.filter(section => section === id ? next : visible.includes(section)));
            }} />
          <Icon size={16} className="mt-0.5 shrink-0 text-[var(--ink-soft)]" aria-hidden="true" />
          <span className="min-w-0">
            <strong className="block">{title[language]}</strong>
            <span className="block text-xs text-[var(--ink-soft)]">{description[language]}</span>
          </span>
        </label>;
      })}
    </div>
  </fieldset>;
}

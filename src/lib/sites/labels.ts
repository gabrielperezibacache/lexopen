import type { Dictionary } from "@/lib/i18n/dictionaries/es";

export function siteTipoLabel(dict: Dictionary, tipo: string): string {
  return dict.siteTabs.types[tipo as keyof typeof dict.siteTabs.types] || tipo.replace("_", " ");
}

export function taskPriorityLabel(dict: Dictionary, priority: string): string {
  return dict.sites.priority[priority as keyof typeof dict.sites.priority] || priority;
}

export function taskStatusLabel(dict: Dictionary, status: string): string {
  return dict.sites.taskStatus[status as keyof typeof dict.sites.taskStatus] || status;
}

import type { ComputerActivity, ComputerSessionView } from "./types";

const stepLabels: Readonly<Record<string, string>> = {
  run: "Trabajando con archivos y herramientas",
  connector: "Consultando una aplicación",
  browse: "Consultando el navegador",
  navigate: "Abriendo una página",
  screenshot: "Revisando la pantalla",
  click: "Trabajando en el escritorio",
  type: "Escribiendo en el escritorio",
  key: "Trabajando en el escritorio",
  scroll: "Revisando una página",
  open: "Abriendo una página",
  page_read: "Leyendo una página",
  page_click: "Navegando en una página",
  page_type: "Completando un formulario",
  read_screen: "Leyendo la pantalla",
  launch: "Abriendo una aplicación",
  focus: "Mostrando una aplicación",
  windows: "Revisando las aplicaciones abiertas",
  wait: "Esperando al escritorio",
};

/** Passive progress never includes the task, tool arguments or file contents. */
export function computerActivityDetail(view: Pick<ComputerSessionView, "session" | "turns">): ComputerActivity["detail"] {
  const last = view.turns.at(-1);
  const step = last?.from === "assistant" ? last.steps.at(-1) : undefined;
  const connections = view.session.connectors;
  const connection = step && connections.includes(step.action) && /^altazor-(google|github|dropbox)-[a-f0-9]{16}$/.test(step.action) ? computerConnectionLabel(step.action) : null;
  const label = step && Object.hasOwn(stepLabels, step.action) ? stepLabels[step.action] : connection ? `Consultando ${connection}` : undefined;
  if (!connections.length && !label) return undefined;
  return { connections, step: label && step ? { label, at: step.at } : null };
}

/** Only generated connection identities get a short product label. */
export function computerConnectionLabel(name: string) {
  const match = /^altazor-(google|github|dropbox)-[a-f0-9]{16}$/.exec(name);
  return match ? { google: "Google Drive", github: "GitHub", dropbox: "Dropbox" }[match[1]]! : name;
}

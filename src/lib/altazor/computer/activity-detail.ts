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
};

/** Passive progress never includes the task, tool arguments or file contents. */
export function computerActivityDetail(view: Pick<ComputerSessionView, "session" | "turns">): ComputerActivity["detail"] {
  const last = view.turns.at(-1);
  const step = last?.from === "assistant" ? last.steps.at(-1) : undefined;
  const label = step && Object.hasOwn(stepLabels, step.action) ? stepLabels[step.action] : undefined;
  const connections = view.session.connectors;
  if (!connections.length && !label) return undefined;
  return { connections, step: label && step ? { label, at: step.at } : null };
}

/** Only generated connection identities get a short product label. */
export function computerConnectionLabel(name: string) {
  const match = /^altazor-(google|github|dropbox)-[a-f0-9]{16}$/.exec(name);
  return match ? { google: "Google Drive", github: "GitHub", dropbox: "Dropbox" }[match[1]]! : name;
}

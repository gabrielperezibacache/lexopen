/** Completion evidence stays outside entity fields and inside the encrypted vault. */
export function renderDeadlineSupport({
  item,
  data,
  parent,
  value,
  onChange,
  id,
}) {
  const group = document.createElement("fieldset"),
    legend = document.createElement("legend"),
    type = document.createElement("select"),
    label = document.createElement("label");
  legend.textContent = "Respaldo del cumplimiento";
  group.append(legend);
  label.textContent = "Tipo de respaldo";
  type.id = id + "-kind";
  label.htmlFor = type.id;
  for (const [v, text] of [
    ["manual", "Justificación manual"],
    ["document", "Documento o comprobante preparado"],
  ]) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = text;
    type.append(o);
  }
  type.value = value?.kind || "manual";
  group.append(label, type);
  const body = document.createElement("div");
  group.append(body);
  function draw() {
    body.replaceChildren();
    const support = value || { kind: "manual", justification: "" };
    if (type.value === "manual") {
      const l = document.createElement("label"),
        input = document.createElement("textarea");
      input.id = id + "-reason";
      input.maxLength = 2000;
      input.value = support.justification || "";
      l.htmlFor = input.id;
      l.textContent = "Justificación del cumplimiento";
      input.oninput = () => {
        value = { kind: "manual", justification: input.value };
        onChange(value);
      };
      body.append(l, input);
    } else {
      const l = document.createElement("label"),
        select = document.createElement("select"),
        empty = document.createElement("option");
      select.id = id + "-document";
      l.htmlFor = select.id;
      l.textContent = "Documento preparado de la causa";
      empty.value = "";
      empty.textContent = "Seleccione una versión confirmada";
      select.append(empty);
      const cause =
        item.relationChoices?.cause?.id || item.baseRelations?.cause?.id;
      const docs = (data.files || []).filter(
        (f) =>
          f.kind === "documento" &&
          f.remoteId &&
          f.number &&
          f.target?.type === "cause" &&
          f.target.id === cause &&
          !f.pending,
      );
      for (const f of docs) {
        const o = document.createElement("option");
        o.value = f.remoteId;
        o.textContent = `${f.baseFields?.name || f.fields.name} · v${f.number}`;
        select.append(o);
      }
      select.value = support.documentoId || "";
      select.onchange = () => {
        const f = docs.find((f) => f.remoteId === select.value);
        value = {
          kind: "document",
          documentoId: select.value,
          version: f?.number || 1,
        };
        onChange(value);
      };
      body.append(l, select);
      const help = document.createElement("p");
      help.textContent =
        "Prepare el documento con conexión antes de seleccionarlo, o registre una justificación manual.";
      body.append(help);
    }
  }
  type.onchange = () => {
    value =
      type.value === "manual"
        ? { kind: "manual", justification: "" }
        : { kind: "document", documentoId: "", version: 1 };
    onChange(value);
    draw();
  };
  draw();
  parent.append(group);
}

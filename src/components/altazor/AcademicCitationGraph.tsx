"use client";

import { useId, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { ArrowUpRight, Crosshair, Minus, Plus } from "lucide-react";
import type { AcademicPaper } from "@/lib/altazor/bibliography-types";
import styles from "./AcademicCitationGraph.module.css";

export type CitationNeighborhood = {
  centerId: string;
  nodes: AcademicPaper[];
  edges: { from: string; to: string; relation: "cites" | "related" }[];
  limited: boolean;
  notice: string;
  checkedAt: string;
};

const relations = {
  reference: "Citada por la obra consultada",
  citing: "Cita a la obra consultada",
  related: "Relacionada por OpenAlex",
};
type Relation = keyof typeof relations;
const width = 600, height = 420;
const origin = { x: width / 2, y: height / 2 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const matchText = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
const authorNames = (paper: AcademicPaper) => paper.metadata.authors
  .map(author => author.name || [author.given, author.family].filter(Boolean).join(" "))
  .join("; ");

function layout(graph: CitationNeighborhood) {
  const entries = new Map(graph.nodes.map(paper => [paper.metadata.openalexId, paper]));
  const center = entries.get(graph.centerId);
  const edges = graph.edges.filter(edge => edge.from !== edge.to && entries.has(edge.from) && entries.has(edge.to));
  const nodes = [];
  if (center) nodes.push({ id: graph.centerId, paper: center, ...origin, label: "C", kinds: [] as Relation[] });
  const wings: Record<Relation, string[]> = { reference: [], citing: [], related: [] };
  const byId = new Map<string, Relation[]>();
  for (const id of entries.keys()) {
    if (!id || id === graph.centerId) continue;
    const kinds: Relation[] = [];
    if (edges.some(edge => edge.from === graph.centerId && edge.to === id && edge.relation === "cites")) kinds.push("reference");
    if (edges.some(edge => edge.from === id && edge.to === graph.centerId && edge.relation === "cites")) kinds.push("citing");
    if (edges.some(edge => edge.from === graph.centerId && edge.to === id && edge.relation === "related")) kinds.push("related");
    if (!kinds.length) continue;
    byId.set(id, kinds);
    wings[kinds[0]].push(id);
  }
  const headings: Record<Relation, number> = { reference: -150, citing: -30, related: 90 };
  for (const kind of Object.keys(wings) as Relation[]) {
    const ids = wings[kind];
    ids.forEach((id, index) => {
      const offset = ids.length === 1 ? 0 : (index / (ids.length - 1) - 0.5) * 84;
      const angle = (headings[kind] + offset) * Math.PI / 180;
      nodes.push({
        id, paper: entries.get(id)!, kinds: byId.get(id)!, label: String(nodes.length),
        x: origin.x + 245 * Math.cos(angle), y: origin.y + 160 * Math.sin(angle),
      });
    });
  }
  const positioned = new Map(nodes.map(node => [node.id, node]));
  const seen = new Set<string>();
  const paths = edges.flatMap(edge => {
    const from = positioned.get(edge.from), to = positioned.get(edge.to);
    const key = [edge.from, edge.to, edge.relation].join(":");
    if (!from || !to || seen.has(key)) return [];
    seen.add(key);
    const dx = to.x - from.x, dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    const inset = from.id === graph.centerId ? 23 : 16;
    const tail = to.id === graph.centerId ? 25 : 18;
    // Parallel relations retain their own stroke when the same works are linked twice.
    const bend = edge.relation === "related" ? -12 : 12;
    const x1 = from.x + dx / length * inset, y1 = from.y + dy / length * inset;
    const x2 = to.x - dx / length * tail, y2 = to.y - dy / length * tail;
    return [{ ...edge, key, path: `M${x1},${y1} Q${(x1 + x2) / 2 - dy / length * bend},${(y1 + y2) / 2 + dx / length * bend} ${x2},${y2}` }];
  });
  return { nodes, paths };
}

export function AcademicCitationGraph({ graph, canExpand, onExpand }: {
  graph: CitationNeighborhood;
  canExpand: boolean;
  onExpand: (id: string) => void;
}) {
  const marker = `citations-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { nodes, paths } = useMemo(() => layout(graph), [graph]);
  const [selectedId, setSelectedId] = useState(graph.centerId);
  const [filter, setFilter] = useState("");
  const [zoom, setZoom] = useState(1);
  const [anchor, setAnchor] = useState(origin);
  const drag = useRef<{ id: number; x: number; y: number; startX: number; startY: number; scale: number } | null>(null);
  const selected = nodes.find(node => node.id === selectedId);
  const query = matchText(filter.trim());
  const matches = new Set(nodes.filter(node => !query || matchText([
    node.paper.metadata.title, authorNames(node.paper), node.paper.metadata.year, node.paper.metadata.doi, node.id,
  ].join(" ")).includes(query)).map(node => node.id));
  const viewWidth = width / zoom, viewHeight = height / zoom;
  const left = clamp(anchor.x - viewWidth / 2, 0, width - viewWidth);
  const top = clamp(anchor.y - viewHeight / 2, 0, height - viewHeight);
  const viewBox = [left, top, viewWidth, viewHeight].join(" ");

  function select(id: string) {
    const node = nodes.find(candidate => candidate.id === id);
    if (!node) return;
    setSelectedId(id);
    setAnchor({ x: node.x, y: node.y });
  }
  function find(event: FormEvent) {
    event.preventDefault();
    const match = nodes.find(node => matches.has(node.id));
    if (!query || !match) return;
    select(match.id);
    setZoom(current => Math.max(current, 1.4));
  }
  function reset() {
    setZoom(1);
    setAnchor(origin);
    setSelectedId(graph.centerId);
    setFilter("");
  }
  function startDrag(event: PointerEvent<SVGSVGElement>) {
    if (zoom === 1 || event.button !== 0 || drag.current || (event.target instanceof Element && event.target.closest("[role=button]"))) return;
    const scale = event.currentTarget.getScreenCTM()?.a;
    if (!scale) return;
    drag.current = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      startX: left + viewWidth / 2, startY: top + viewHeight / 2, scale,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    setAnchor({
      x: clamp(start.startX - (event.clientX - start.x) / start.scale, viewWidth / 2, width - viewWidth / 2),
      y: clamp(start.startY - (event.clientY - start.y) / start.scale, viewHeight / 2, height - viewHeight / 2),
    });
  }

  if (!nodes.length) return <p>No se pudo identificar la obra central en el vecindario devuelto.</p>;

  return <div className={styles.root}>
    <form className={styles.filter} onSubmit={find}>
      <label>Buscar en esta red<input value={filter} onChange={event => setFilter(event.target.value)} maxLength={250} placeholder="Título, autor, año o DOI"/></label>
      <button type="submit" className="btn btn-outline" disabled={!query || matches.size === 0}>Centrar coincidencia</button>
      {query && <p className={styles.matchCount} role="status">{matches.size === 1 ? "1 coincidencia" : `${matches.size} coincidencias`}</p>}
    </form>
    <div className={styles.plot}>
      <svg viewBox={viewBox} role="group" aria-label="Grafo interactivo de citas" preserveAspectRatio="xMidYMid meet"
        data-zoomed={zoom > 1} onPointerDown={startDrag} onPointerMove={moveDrag}
        onLostPointerCapture={event => { if (drag.current?.id === event.pointerId) drag.current = null; }}>
        <defs><marker id={marker} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L6 4 L1 7"/></marker></defs>
        <g aria-hidden="true">
          {paths.map(edge => <path key={edge.key} d={edge.path} className={styles.edge}
            data-related={edge.relation === "related"}
            data-active={edge.from === selectedId || edge.to === selectedId}
            markerEnd={edge.relation === "cites" ? `url(#${marker})` : undefined}/>)}
        </g>
        {nodes.map(node => <g key={node.id} role="button" tabIndex={0}
          aria-label={node.paper.metadata.title} aria-pressed={node.id === selectedId}
          className={styles.node} data-center={node.id === graph.centerId} data-dimmed={!matches.has(node.id)}
          onFocus={() => setAnchor({ x: node.x, y: node.y })} onClick={() => select(node.id)}
          onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              select(node.id);
            }
          }}>
          <title>{node.paper.metadata.title}</title>
          <circle cx={node.x} cy={node.y} r={node.id === graph.centerId ? 23 : 16}/>
          <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="central" aria-hidden="true">{node.label}</text>
        </g>)}
      </svg>
      <div className={styles.toolbar} role="group" aria-label="Controles de la red">
        <button type="button" className="btn btn-outline" aria-label="Alejar red" disabled={zoom <= 1} onClick={() => setZoom(current => Math.max(1, current - .2))}><Minus size={17} aria-hidden="true"/></button>
        <output aria-label="Nivel de acercamiento">{Math.round(zoom * 100)} %</output>
        <button type="button" className="btn btn-outline" aria-label="Acercar red" disabled={zoom >= 2.2} onClick={() => setZoom(current => Math.min(2.2, current + .2))}><Plus size={17} aria-hidden="true"/></button>
        <button type="button" className="btn btn-outline" aria-label="Restablecer vista de la red" onClick={reset}><Crosshair size={17} aria-hidden="true"/></button>
      </div>
    </div>
    <p className={styles.legend}>C indica la obra consultada. Las flechas apuntan a la obra citada y las líneas discontinuas señalan una relación temática del índice. Al acercar, puedes arrastrar el fondo para mover la vista.</p>
    {selected && <div className={styles.selection} aria-label="Obra seleccionada" role="region">
      <div aria-live="polite">
        <span>{selected.kinds.length ? selected.kinds.map(kind => relations[kind]).join(" · ") : "Obra consultada"}</span>
        <h5>{selected.paper.metadata.title}</h5>
        <p>{[authorNames(selected.paper), selected.paper.metadata.year].filter(Boolean).join(" · ")}</p>
      </div>
      <div className={styles.actions}>
        <a href={selected.paper.landingUrl} target="_blank" rel="noreferrer noopener">Abrir registro <ArrowUpRight size={15} aria-hidden="true"/></a>
        {selected.id !== graph.centerId && <button className="btn btn-outline" type="button" disabled={!canExpand} onClick={() => onExpand(selected.id)}>Consultar red de esta obra</button>}
      </div>
    </div>}
  </div>;
}

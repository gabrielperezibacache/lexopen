// Proyectos.jsx — separate "Proyectos" page: firm initiatives (Altazor AI, Minimal PDF, MCP Legal Chile, LexOpen).
const NS_pj = window.PRezIbacacheDesignSystem_b910b1;

function PjHeader() {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(255,255,255,0.9)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border-subtle)" }}>
      <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "0 var(--space-6)", height: 76, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)" }}>
        <a href="index.html" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <img src="./assets/logo-horizontal.png" alt="Pérez Ibacache & Asociados" style={{ height: 38 }} />
        </a>
        <a href="index.html" className="pj-back" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-body)", fontSize: "var(--text-base)", color: "var(--text-body)", textDecoration: "none", transition: "color var(--dur-base) var(--ease-standard)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Volver al sitio
        </a>
      </div>
    </header>
  );
}

function PjHero() {
  return (
    <section className="pj-hero" style={{ position: "relative", overflow: "hidden", background: "var(--surface-dark)", borderBottom: "1px solid var(--border-on-dark)" }}>
      <img src="./assets/symbol-white.png" alt="" aria-hidden="true" className="hero-bg-pulse" style={{ position: "absolute", right: -100, top: "40%", transform: "translateY(-50%)", width: 420, opacity: 0.06, pointerEvents: "none" }} />
      <div style={{ position: "relative", maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-12) var(--space-6)" }}>
        <div data-anim="up" style={{ maxWidth: 720 }}>
          <div style={{ fontFamily: "var(--font-body)", fontWeight: "var(--fw-bold)", fontSize: 13, letterSpacing: "var(--tracking-eyebrow)", textTransform: "uppercase", color: "var(--teal-300)", marginBottom: "var(--space-4)" }}>Proyectos</div>
          <h1 className="hero-el d1" style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(36px,5.5vw,60px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "var(--pia-ice)", margin: 0 }}>
            Lo que estamos construyendo
          </h1>
          <p className="hero-el d2" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-lg)", lineHeight: 1.65, color: "var(--teal-200)", margin: "var(--space-5) 0 0", maxWidth: 620 }}>
            Iniciativas que desarrollamos como firma, donde aportamos nuestra mirada técnica,
            humana y tecnológica a problemas que importan.
          </p>
        </div>
      </div>
    </section>
  );
}

// Branded cover for Altazor — typographic mark, not the firm wordmark.
function AltazorCover() {
  return (
    <div style={{
      position: "relative", height: "100%", minHeight: 360, background: "var(--surface-darker)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: "var(--space-5)", overflow: "hidden", padding: "var(--space-8)",
    }}>
      <img src="./assets/symbol-white.png" alt="" aria-hidden="true" style={{ position: "absolute", right: -90, bottom: -90, width: 320, opacity: 0.07 }} />
      <div style={{ position: "relative", textAlign: "center" }}>
        <div style={{
          fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(36px, 4vw, 48px)",
          letterSpacing: "-0.03em", color: "var(--pia-ice)", lineHeight: 1,
        }}>Altazor</div>
        <div style={{
          fontFamily: "var(--font-body)", fontWeight: "var(--fw-bold)", fontSize: 13,
          letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--teal-300)", marginTop: 10,
        }}>AI</div>
      </div>
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "var(--font-body)", fontWeight: "var(--fw-bold)", fontSize: "var(--text-sm)", color: "var(--teal-200)", border: "1px solid var(--border-on-dark)", borderRadius: "var(--radius-pill)", padding: "7px 16px" }}>
        altazorai.com
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>
      </div>
    </div>
  );
}

function AltazorFeature() {
  const { Badge } = NS_pj;
  const features = [
    "Búsqueda semántica con citas verificables", "Chat con tus PDF (RAG)",
    "Estados del arte y matrices de literatura", "Exportación APA / IEEE",
    "Radar de becas: EURAXESS, ANID, CONICET", "Integra OpenAlex, ORCID, Zotero",
  ];
  const paras = [
    "Altazor AI es un asistente de investigación académica diseñado para la comunidad científica hispanohablante. Integra inteligencia artificial con citas verificables para acompañar todo el ciclo de investigación: descubrir, leer, sintetizar, producir y gestionar.",
    "Permite subir tu biblioteca de papers en PDF y realizar búsquedas semánticas con respuestas sintetizadas y citadas, además de conversar directamente con tus documentos mediante tecnología RAG. Genera estados del arte, matrices de literatura y notas conectadas, y exporta bibliografías en formatos como APA e IEEE.",
    "Más allá de la lectura, funciona como un centro de gestión de carrera: perfil académico, red de contactos, calendario de plazos, congresos y un radar de oportunidades —becas y convocatorias— que se actualiza automáticamente desde fuentes como EURAXESS, ANID y CONICET.",
    "Se apoya en un motor de IA multiproveedor (OpenAI y Google Gemini) que asigna cada tarea al modelo más adecuado según costo y calidad, con integraciones a OpenAlex, Semantic Scholar, ORCID, Zotero y Google Calendar. Construido con FastAPI, React y PostgreSQL con búsqueda vectorial, reúne en una sola herramienta todo lo que un investigador necesita, con un diseño cuidado y bilingüe pensado para Latinoamérica y el mundo de habla hispana.",
  ];
  return (
    <section style={{ background: "var(--surface-page)" }}>
      <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-12) var(--space-6)" }}>
        <div data-anim="up" className="altazor-grid" style={{ display: "grid", gridTemplateColumns: "0.95fr 1.05fr", gap: 0, alignItems: "stretch", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--surface-card)", boxShadow: "var(--shadow-sm)" }}>
          <AltazorCover />
          <div style={{ padding: "var(--space-9) var(--space-8)" }}>
            <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
              <Badge variant="brand" size="sm">Plataforma</Badge>
              <Badge variant="solid" size="sm">En producción</Badge>
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(30px,4vw,44px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "var(--text-strong)", margin: "0 0 var(--space-2)" }}>Altazor AI</h2>
            <p style={{ fontFamily: "var(--font-body)", fontWeight: "var(--fw-bold)", fontSize: "var(--text-md)", color: "var(--text-brand)", margin: "0 0 var(--space-5)" }}>Asistencia IA para investigadores académicos y docentes</p>
            {paras.map((p, i) => (
              <p key={i} style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-base)", lineHeight: 1.65, color: "var(--text-body)", margin: "0 0 var(--space-4)" }}>{p}</p>
            ))}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", margin: "var(--space-5) 0 var(--space-7)" }}>
              {features.map((f) => (
                <span key={f} style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", fontWeight: "var(--fw-bold)", color: "var(--text-brand)", background: "var(--surface-ice)", borderRadius: "var(--radius-pill)", padding: "7px 14px", border: "1px solid rgba(2,55,57,0.06)" }}>{f}</span>
              ))}
            </div>
            <a
              href="https://www.altazorai.com"
              target="_blank"
              rel="noopener noreferrer"
              className="pj-cta-link"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--space-2)",
                height: "var(--control-h-lg)",
                padding: "0 30px",
                fontFamily: "var(--font-body)",
                fontWeight: "var(--fw-bold)",
                fontSize: "var(--text-md)",
                color: "var(--action-text)",
                background: "var(--action)",
                border: "1px solid var(--action)",
                borderRadius: "var(--radius-md)",
                textDecoration: "none",
                transition: "background var(--dur-fast) var(--ease-standard)",
              }}
            >
              Visitar altazorai.com
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// Branded cover for Minimal PDF — Ébano aesthetic (app palette), not the firm wordmark.
function MinimalPdfCover() {
  return (
    <div style={{
      position: "relative", height: "100%", minHeight: 360, background: "#0F1714",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: "var(--space-5)", overflow: "hidden", padding: "var(--space-8)",
    }}>
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, opacity: 0.35,
        background: "radial-gradient(ellipse at 30% 20%, rgba(200,154,90,0.18), transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(2,55,57,0.45), transparent 50%)",
      }} />
      <div style={{ position: "relative", textAlign: "center" }}>
        <div style={{
          fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(32px, 3.8vw, 44px)",
          letterSpacing: "-0.03em", color: "#F3ECDD", lineHeight: 1.05,
        }}>Minimal PDF</div>
        <div style={{
          fontFamily: "var(--font-body)", fontWeight: "var(--fw-bold)", fontSize: 12,
          letterSpacing: "0.18em", textTransform: "uppercase", color: "#C89A5A", marginTop: 12,
        }}>Ébano · Offline</div>
      </div>
      <div style={{
        position: "relative", display: "inline-flex", alignItems: "center", gap: 7,
        fontFamily: "var(--font-body)", fontWeight: "var(--fw-bold)", fontSize: "var(--text-sm)",
        color: "#F3ECDD", border: "1px solid rgba(243,236,221,0.22)", borderRadius: "var(--radius-pill)",
        padding: "7px 16px",
      }}>
        Privacidad absoluta
      </div>
    </div>
  );
}

function MinimalPdfFeature() {
  const { Badge } = NS_pj;
  const features = [
    "100% offline en el dispositivo", "Sin cuentas ni analíticas",
    "Biblioteca local con colecciones", "Lector Ébano de bajo cansancio",
    "Anotaciones y marcadores", "Firma electrónica local",
  ];
  const paras = [
    "Minimal PDF es un lector de PDF y gestor de biblioteca ultraligero para Android e iOS. Está pensado para leer y organizar documentos con rapidez, sin depender de la nube ni de cuentas de usuario.",
    "Toda la biblioteca —importación, progreso de lectura, colecciones, anotaciones, marcadores y firmas electrónicas— vive en el dispositivo. No hay IA remota, ni publicidad, ni telemetría invasiva: el procesamiento ocurre de forma local.",
    "La interfaz sigue la estética Ébano (fondos oscuros, texto pergamino y acentos en bronce), con temas claro, sepia y oscuro. Incluye descargas por URL y un mini-navegador solo cuando usted las solicita, manteniendo el resto del uso completamente offline.",
    "Modelo de negocio de pago único en tiendas oficiales, sin suscripciones ni anuncios. Construida con Flutter, base de datos local Sqflite y renderizado eficiente de páginas para documentos grandes.",
  ];
  const ctaStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--space-2)",
    height: "var(--control-h-lg)",
    padding: "0 30px",
    fontFamily: "var(--font-body)",
    fontWeight: "var(--fw-bold)",
    fontSize: "var(--text-md)",
    borderRadius: "var(--radius-md)",
    textDecoration: "none",
    transition: "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
  };
  return (
    <section style={{ background: "var(--surface-page)", borderTop: "1px solid var(--border-subtle)" }}>
      <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-12) var(--space-6)" }}>
        <div data-anim="up" className="minimal-pdf-grid" style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 0, alignItems: "stretch", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--surface-card)", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ padding: "var(--space-9) var(--space-8)" }}>
            <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
              <Badge variant="brand" size="sm">App móvil</Badge>
              <Badge variant="solid" size="sm">En desarrollo</Badge>
              <Badge variant="neutral" size="sm">Privacidad</Badge>
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(30px,4vw,44px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "var(--text-strong)", margin: "0 0 var(--space-2)" }}>Minimal PDF</h2>
            <p style={{ fontFamily: "var(--font-body)", fontWeight: "var(--fw-bold)", fontSize: "var(--text-md)", color: "var(--text-brand)", margin: "0 0 var(--space-5)" }}>Lector de PDF ultraligero, offline y respetuoso con la privacidad</p>
            {paras.map((p, i) => (
              <p key={i} style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-base)", lineHeight: 1.65, color: "var(--text-body)", margin: "0 0 var(--space-4)" }}>{p}</p>
            ))}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", margin: "var(--space-5) 0 var(--space-7)" }}>
              {features.map((f) => (
                <span key={f} style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", fontWeight: "var(--fw-bold)", color: "var(--text-brand)", background: "var(--surface-ice)", borderRadius: "var(--radius-pill)", padding: "7px 14px", border: "1px solid rgba(2,55,57,0.06)" }}>{f}</span>
              ))}
            </div>
            <a
              href="minimal-pdf-privacidad.html"
              className="pj-cta-link"
              style={{ ...ctaStyle, color: "var(--action-text)", background: "var(--action)", border: "1px solid var(--action)" }}
            >
              Política de privacidad
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </a>
          </div>
          <MinimalPdfCover />
        </div>
      </div>
    </section>
  );
}

function McpLegalCover() {
  return (
    <div style={{
      position: "relative", height: "100%", minHeight: 360, background: "var(--surface-darker)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: "var(--space-5)", overflow: "hidden", padding: "var(--space-8)",
    }}>
      <img src="./assets/symbol-white.png" alt="" aria-hidden="true" style={{ position: "absolute", left: -80, top: -80, width: 300, opacity: 0.07 }} />
      <div style={{ position: "relative", textAlign: "center" }}>
        <div style={{
          fontFamily: "var(--font-body)", fontWeight: "var(--fw-bold)", fontSize: 12,
          letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--teal-300)", marginBottom: "var(--space-3)",
        }}>Model Context Protocol</div>
        <div style={{
          fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(28px, 3.5vw, 40px)",
          letterSpacing: "-0.02em", color: "var(--pia-ice)", lineHeight: 1.05,
        }}>MCP Legal Chile</div>
        <p style={{
          fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "rgba(255,255,255,0.65)",
          margin: "var(--space-3) 0 0", maxWidth: 260,
        }}>Derecho chileno con citas verificables</p>
      </div>
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "var(--font-body)", fontWeight: "var(--fw-bold)", fontSize: "var(--text-sm)", color: "var(--teal-200)", border: "1px solid var(--border-on-dark)", borderRadius: "var(--radius-pill)", padding: "7px 16px" }}>
        v1.7 · en producción
      </div>
    </div>
  );
}

function McpLegalFeature() {
  const { Badge } = NS_pj;
  const features = [
    "Texto oficial LeyChile con citas", "Doctrina SciELO + OpenAlex",
    "Jurisprudencia TC y portales PJUD", "Dictámenes Contraloría",
    "Pack investigar_tema anti-alucinación", "Compatible con Claude y Cursor",
  ];
  const paras = [
    "MCP Legal Chile es un conector Model Context Protocol que pone el derecho chileno al alcance de asistentes de IA como Claude y Cursor: legislación, jurisprudencia, doctrina y dictámenes, con evidencia trazable a fuentes oficiales.",
    "Permite citar artículos íntegros desde LeyChile, consultar doctrina académica (SciELO Chile y catálogos regionales), resolver roles ante el Tribunal Constitucional y orientar búsquedas en PJUD y Contraloría — dejando claro cuándo hay texto completo y cuándo solo un enlace oficial a verificar.",
    "Incluye herramientas de investigación con presupuesto de tiempo acotado, caché durable, rate limits por proveedor y degradación controlada cuando las APIs públicas fallan. No sustituye asesoría jurídica: es un puente técnico entre modelos de lenguaje y las fuentes del derecho chileno.",
  ];
  const ctaStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--space-2)",
    height: "var(--control-h-lg)",
    padding: "0 30px",
    fontFamily: "var(--font-body)",
    fontWeight: "var(--fw-bold)",
    fontSize: "var(--text-md)",
    borderRadius: "var(--radius-md)",
    textDecoration: "none",
    transition: "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
  };
  return (
    <section style={{ background: "var(--surface-page)", borderTop: "1px solid var(--border-subtle)" }}>
      <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-12) var(--space-6)" }}>
        <div data-anim="up" className="mcp-grid" style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 0, alignItems: "stretch", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--surface-card)", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ padding: "var(--space-9) var(--space-8)" }}>
            <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
              <Badge variant="brand" size="sm">Infraestructura IA</Badge>
              <Badge variant="solid" size="sm">En producción</Badge>
              <Badge variant="neutral" size="sm">Open source</Badge>
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(30px,4vw,44px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "var(--text-strong)", margin: "0 0 var(--space-2)" }}>MCP Legal Chile</h2>
            <p style={{ fontFamily: "var(--font-body)", fontWeight: "var(--fw-bold)", fontSize: "var(--text-md)", color: "var(--text-brand)", margin: "0 0 var(--space-5)" }}>Conector MCP del derecho chileno para asistentes de IA</p>
            {paras.map((p, i) => (
              <p key={i} style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-base)", lineHeight: 1.65, color: "var(--text-body)", margin: "0 0 var(--space-4)" }}>{p}</p>
            ))}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", margin: "var(--space-5) 0 var(--space-7)" }}>
              {features.map((f) => (
                <span key={f} style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", fontWeight: "var(--fw-bold)", color: "var(--text-brand)", background: "var(--surface-ice)", borderRadius: "var(--radius-pill)", padding: "7px 14px", border: "1px solid rgba(2,55,57,0.06)" }}>{f}</span>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
              <a
                href="https://github.com/gabrielperezibacache/mcp-legal-chile"
                target="_blank"
                rel="noopener noreferrer"
                className="pj-cta-link"
                style={{ ...ctaStyle, color: "var(--action-text)", background: "var(--action)", border: "1px solid var(--action)" }}
              >
                Ver en GitHub
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>
              </a>
              <a
                href="https://mcp-legal-chile.onrender.com/mcp"
                target="_blank"
                rel="noopener noreferrer"
                className="pj-cta-secondary"
                style={{ ...ctaStyle, color: "var(--text-brand)", background: "transparent", border: "1.5px solid var(--teal-900)" }}
              >
                Endpoint MCP
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>
              </a>
            </div>
          </div>
          <McpLegalCover />
        </div>
      </div>
    </section>
  );
}

function LexOpenCover() {
  return (
    <div style={{
      position: "relative", height: "100%", minHeight: 360, background: "#0c1c24",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: "var(--space-5)", overflow: "hidden", padding: "var(--space-8)",
    }}>
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, opacity: 0.9,
        background: "radial-gradient(ellipse at 20% 15%, rgba(31,111,120,0.45), transparent 55%), radial-gradient(ellipse at 85% 80%, rgba(196,122,58,0.22), transparent 50%)",
      }} />
      <img src="./assets/symbol-white.png" alt="" aria-hidden="true" style={{ position: "absolute", right: -90, bottom: -90, width: 320, opacity: 0.07 }} />
      <div style={{ position: "relative", textAlign: "center" }}>
        <div style={{
          fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(36px, 4vw, 48px)",
          letterSpacing: "-0.03em", color: "#f3f6f4", lineHeight: 1,
        }}>LexOpen</div>
        <div style={{
          fontFamily: "var(--font-body)", fontWeight: "var(--fw-bold)", fontSize: 13,
          letterSpacing: "0.16em", textTransform: "uppercase", color: "#c47a3a", marginTop: 12,
        }}>Legal workspaces · Chile</div>
      </div>
      <div style={{
        position: "relative", display: "inline-flex", alignItems: "center", gap: 7,
        fontFamily: "var(--font-body)", fontWeight: "var(--fw-bold)", fontSize: "var(--text-sm)",
        color: "#d6c4a8", border: "1px solid rgba(214,196,168,0.35)", borderRadius: "var(--radius-pill)",
        padding: "7px 16px",
      }}>
        github.com/gabrielperezibacache/lexopen
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>
      </div>
    </div>
  );
}

function LexOpenFeature() {
  const { Badge } = NS_pj;
  const features = [
    "Sites / VDR / Wiki / iSheets", "Causas RIT·RUC y plazos Chile",
    "CRM de clientes y trámites", "Asistente IA multi-proveedor",
    "Facturación CLP / UF", "Obsidian · Google Workspace",
  ];
  const paras = [
    "LexOpen es una plataforma open-source para la operación diaria del estudio jurídico en Chile: espacios de trabajo, data room, wiki, tareas y portal de cliente, junto con causas (RIT/RUC), plazos hábiles, minutas de handoff y jurisprudencia.",
    "Integra un CRM por carpeta de cliente —causas, trámites pendientes/hechos y documentos— y un catálogo de acciones de IA (resumen procesal, borradores de minuta, glosas, briefs) sobre endpoints OpenAI-compatibles: OpenAI, Azure, Groq, Ollama o Hermes, siempre bajo revisión del abogado.",
    "Incluye facturación (horas, gastos, boletas/facturas, cuenta corriente), búsqueda unificada e integraciones con Obsidian y Google Drive/Calendar. Stack: Next.js 15, Postgres, Prisma; licencia AGPL-3.0.",
  ];
  const ctaStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--space-2)",
    height: "var(--control-h-lg)",
    padding: "0 30px",
    fontFamily: "var(--font-body)",
    fontWeight: "var(--fw-bold)",
    fontSize: "var(--text-md)",
    borderRadius: "var(--radius-md)",
    textDecoration: "none",
    transition: "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
  };
  return (
    <section style={{ background: "var(--surface-page)", borderTop: "1px solid var(--border-subtle)" }}>
      <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-12) var(--space-6)" }}>
        <div data-anim="up" className="lexopen-grid" style={{ display: "grid", gridTemplateColumns: "0.95fr 1.05fr", gap: 0, alignItems: "stretch", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--surface-card)", boxShadow: "var(--shadow-sm)" }}>
          <LexOpenCover />
          <div style={{ padding: "var(--space-9) var(--space-8)" }}>
            <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
              <Badge variant="brand" size="sm">Plataforma legal</Badge>
              <Badge variant="solid" size="sm">Open source</Badge>
              <Badge variant="neutral" size="sm">En desarrollo</Badge>
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(30px,4vw,44px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "var(--text-strong)", margin: "0 0 var(--space-2)" }}>LexOpen</h2>
            <p style={{ fontFamily: "var(--font-body)", fontWeight: "var(--fw-bold)", fontSize: "var(--text-md)", color: "var(--text-brand)", margin: "0 0 var(--space-5)" }}>Legal workspaces open-source para estudios en Chile</p>
            {paras.map((p, i) => (
              <p key={i} style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-base)", lineHeight: 1.65, color: "var(--text-body)", margin: "0 0 var(--space-4)" }}>{p}</p>
            ))}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", margin: "var(--space-5) 0 var(--space-7)" }}>
              {features.map((f) => (
                <span key={f} style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", fontWeight: "var(--fw-bold)", color: "var(--text-brand)", background: "var(--surface-ice)", borderRadius: "var(--radius-pill)", padding: "7px 14px", border: "1px solid rgba(2,55,57,0.06)" }}>{f}</span>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
              <a
                href="https://github.com/gabrielperezibacache/lexopen"
                target="_blank"
                rel="noopener noreferrer"
                className="pj-cta-link"
                style={{ ...ctaStyle, color: "var(--action-text)", background: "var(--action)", border: "1px solid var(--action)" }}
              >
                Ver en GitHub
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>
              </a>
              <a
                href="https://github.com/gabrielperezibacache/lexopen#inicio-rápido"
                target="_blank"
                rel="noopener noreferrer"
                className="pj-cta-secondary"
                style={{ ...ctaStyle, color: "var(--text-brand)", background: "transparent", border: "1.5px solid var(--teal-900)" }}
              >
                Inicio rápido
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MoreProjects() {
  const { Card, Badge } = NS_pj;
  const more = [
    { tag: "Investigación", title: "Migración forzada y cambio climático", body: "Estudio de los marcos jurídicos de protección para personas desplazadas por causas ambientales." },
    { tag: "Pro Bono", title: "Salud mental y acceso a la justicia", body: "Acompañamiento psicosocial gratuito a familias en situación de vulnerabilidad dentro de procesos judiciales." },
  ];
  return (
    <section style={{ background: "var(--surface-subtle)" }}>
      <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-12) var(--space-6)" }}>
        <div data-anim="up" style={{ maxWidth: 680, marginBottom: "var(--space-8)" }}>
          <div style={{ fontFamily: "var(--font-body)", fontWeight: "var(--fw-bold)", fontSize: 13, letterSpacing: "var(--tracking-eyebrow)", textTransform: "uppercase", color: "var(--text-link)", marginBottom: "var(--space-3)" }}>Otros proyectos</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(26px,3.5vw,38px)", lineHeight: 1.1, letterSpacing: "-0.015em", margin: 0, color: "var(--text-strong)" }}>Más iniciativas en desarrollo</h2>
        </div>
        <div className="more-projects-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-5)" }}>
          {more.map((p, i) => (
            <div key={p.title} data-anim="up" className={`card-lift d${i + 1}`}>
              <Card variant="default" padding="lg" style={{ height: "100%", boxShadow: "var(--shadow-sm)" }}>
                <Badge variant="brand" size="sm">{p.tag}</Badge>
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-lg)", color: "var(--text-strong)", margin: "var(--space-3) 0 var(--space-2)" }}>{p.title}</h3>
                <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-base)", color: "var(--text-body)", margin: 0, lineHeight: 1.65 }}>{p.body}</p>
              </Card>
            </div>
          ))}
          <div data-anim="up" className="d3" style={{ border: "1.5px dashed var(--border-default)", borderRadius: "var(--radius-lg)", padding: "var(--space-6)", display: "flex", flexDirection: "column", justifyContent: "center", gap: "var(--space-2)" }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-lg)", color: "var(--text-muted)" }}>+ Tu próximo proyecto</div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "var(--text-muted)", margin: 0, lineHeight: 1.55 }}>Envíanos imagen y descripción de cada proyecto y lo sumamos a esta galería.</p>
          </div>
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: "var(--space-7)", fontStyle: "italic" }}>
          Altazor AI, Minimal PDF, MCP Legal Chile y LexOpen tienen contenido definitivo. Las otras tarjetas son marcadores basados en intereses del equipo — reemplázalas con tus proyectos reales.
        </p>
      </div>
    </section>
  );
}

function PjFooter() {
  return (
    <footer style={{ background: "var(--surface-darker)", borderTop: "1px solid var(--border-on-dark)" }}>
      <div style={{ maxWidth: "var(--container-xl)", margin: "0 auto", padding: "var(--space-8) var(--space-6)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-6)", flexWrap: "wrap" }}>
        <img src="./assets/logo-horizontal-white.png" alt="Pérez Ibacache & Asociados" style={{ height: 32 }} />
        <a href="index.html" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "var(--pia-ice)", textDecoration: "none" }}>← Volver al sitio principal</a>
      </div>
    </footer>
  );
}

function ProyectosPage() {
  return (
    <React.Fragment>
      <PjHeader />
      <main><PjHero /><AltazorFeature /><MinimalPdfFeature /><McpLegalFeature /><LexOpenFeature /><MoreProjects /></main>
      <PjFooter />
    </React.Fragment>
  );
}
window.ProyectosPage = ProyectosPage;

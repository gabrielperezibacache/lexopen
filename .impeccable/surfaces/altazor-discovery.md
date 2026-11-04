---
name: Descubrimiento académico de ALTAZOR
mode: Operate
primaryTarget: src/components/altazor/AltazorDiscovery.tsx
relatedTargets:
  - src/components/altazor/AltazorDiscovery.module.css
---

Extensión de la Academia de ALTAZOR dentro de Inicio. Hereda Fraunces/Sora,
cobre y verde mar, superficies claras y controles existentes de LexOpen.
No introduce navegación lateral ni una identidad visual independiente.

La tarea principal es escribir una consulta pública, elegir Crossref/OpenAlex
y autorizar ese envío. Los resultados son filas de metadatos con procedencia,
fecha de consulta, enlaces a la obra, conservación bibliográfica y red de citas.
Un registro bibliográfico no demuestra lectura, contenido ni respaldo de una
afirmación. ORCID representa un registro público, sin autenticar una cuenta ni
certificar formación o experiencia.

Búsquedas temáticas, bibliografía y consulta ORCID se revelan en disclosures.
Las alertas se actualizan manualmente; el RSS privado usa resultados conservados
y exige sesión. Fallos y resultados vacíos conservan su significado real.

En móvil la red se lee como relaciones en una columna, comenzando por la obra
consultada. Controles de al menos 44 px, nombres accesibles explícitos para los
selectores, foco visible y avisos en la superficie activa. Las operaciones
mantienen una identidad por contenido para recuperar respuestas perdidas y
funcionan por HTTP en la red local sin depender de randomUUID.

Verificación: pruebas con transporte ficticio sin red/DB y lint por archivos;
adaptadores contrastados con registros públicos constantes de las tres fuentes.
La revisión visual se realiza en el fixture público compartido, por turno.

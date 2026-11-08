import { assertAcademicDocx } from "@/lib/workbench/docx";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
function xml(value: string) {
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error("El documento contiene caracteres no admitidos por Word");
  return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
function crc32(bytes: Buffer) { let value=0xffffffff; for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^(0xedb88320&-(value&1));}return(value^0xffffffff)>>>0; }

function textRun(text: string, emphasis = 0) {
  const formatting = emphasis
    ? `<w:rPr>${emphasis >= 2 ? "<w:b/>" : ""}${emphasis % 2 ? "<w:i/>" : ""}</w:rPr>`
    : "";
  return `<w:r>${formatting}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}

/** Interpret the editor's inline commands. Everything else stays ordinary text. */
function inlineRuns(text: string) {
  const tokens = /\\([\\*`[\]()])|`[^`\r\n]+`|(?<!!)\[([^\[\]\r\n]+)\]\((https?:\/\/(?:[^\s()<>]|\([^\s()<>]*\))+)\)|https?:\/\/[^\s<>]+|(?<![\\*])(\*{1,3})([^*\r\n]+)\4(?!\*)/gu;
  let out = "", offset = 0;
  for (const match of text.matchAll(tokens)) {
    const index = match.index!;
    if (index > offset) out += textRun(text.slice(offset, index));
    const [, escaped, label, url, marks, emphasis] = match;
    if (escaped) out += textRun(escaped);
    else if (label && url) out += textRun(`${/^\^?R\d+$/.test(label) ? `[${label}]` : label} (${url})`);
    else if (emphasis?.trim() && marks) out += textRun(emphasis, marks.length);
    else out += textRun(match[0]);
    offset = index + match[0].length;
  }
  if (offset < text.length) out += textRun(text.slice(offset));
  return out;
}

type ListNumbering = { id: number; format: "bullet" | "decimal"; start: number };

function manuscriptParagraphs(body: string) {
  const paragraphs: string[] = [], lists: ListNumbering[] = [];
  let list: ListNumbering | undefined;
  let fenceLength = 0;
  for (const line of body.split(/\r\n?|\n/)) {
    const fence = /^ {0,3}(`{3,})(.*)$/.exec(line);
    if (fenceLength || fence) {
      if (!fenceLength) fenceLength = fence![1].length;
      else if (fence && fence[1].length >= fenceLength && !fence[2].trim()) fenceLength = 0;
      list = undefined;
      paragraphs.push(`<w:p>${textRun(line)}</w:p>`);
      continue;
    }
    const item = /^ {0,3}(?:[-*+]|(\d{1,9})[.)])[ \t]+(.*)$/.exec(line);
    if (item) {
      const format = item[1] === undefined ? "bullet" : "decimal";
      if (list?.format !== format) {
        list = { id: lists.length + 1, format, start: item[1] === undefined ? 1 : Number(item[1]) };
        lists.push(list);
      }
      paragraphs.push(`<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${list.id}"/></w:numPr></w:pPr>${inlineRuns(item[2])}</w:p>`);
      continue;
    }
    list = undefined;
    const heading = /^ {0,3}(#{1,3})[ \t]+(.*)$/.exec(line);
    const quote = /^ {0,3}>[ \t]?(.*)$/.exec(line);
    const style = heading ? `Heading${heading[1].length}` : quote ? "Quote" : "";
    const properties = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
    paragraphs.push(`<w:p>${properties}${inlineRuns(heading?.[2] ?? quote?.[1] ?? line)}</w:p>`);
  }
  return { paragraphs: paragraphs.join(""), lists };
}

function numberingPart(lists: ListNumbering[]) {
  const levels = (["bullet", "decimal"] as const).map((format, id) => {
    const label = format === "bullet" ? "•" : "%1.";
    return `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${label}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="540" w:hanging="300"/></w:pPr></w:lvl></w:abstractNum>`;
  });
  const instances = lists.map(({ id, format, start }) => {
    const override = start === 1 ? "" : `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="${start}"/></w:lvlOverride>`;
    return `<w:num w:numId="${id}"><w:abstractNumId w:val="${format === "bullet" ? 0 : 1}"/>${override}</w:num>`;
  });
  return `<w:numbering xmlns:w="${W}">${levels.join("")}${instances.join("")}</w:numbering>`;
}

function stylesPart() {
  const headings = [34, 28, 24].map((size, index) => {
    const level = index + 1;
    return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:pPr><w:keepNext/><w:outlineLvl w:val="${index}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  }).join("");
  return `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="22"/><w:lang w:val="es-CL"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${headings}<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:pPr><w:ind w:left="360"/></w:pPr><w:rPr><w:i/></w:rPr></w:style></w:styles>`;
}

/** Inert OOXML with native Word headings and lists. */
export function exportAcademicDocx(body: string) {
  if (body.length>100000) throw new Error("El documento excede el límite de exportación");
  const { paragraphs, lists } = manuscriptParagraphs(body);
  const parts:Record<string,string>={
    "[Content_Types].xml":'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>',
    "_rels/.rels":`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OFFICE}officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml":`<w:document xmlns:w="${W}"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr></w:body></w:document>`,
    "word/styles.xml": stylesPart(),
    "word/numbering.xml": numberingPart(lists),
    "word/_rels/document.xml.rels":`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OFFICE}styles" Target="styles.xml"/><Relationship Id="rId2" Type="${OFFICE}numbering" Target="numbering.xml"/></Relationships>`,
  };
  const entries:Buffer[]=[],directory:Buffer[]=[];let offset=0;
  for(const [name,content] of Object.entries(parts)){
    const filename=Buffer.from(name),data=Buffer.from(content),crc=crc32(data),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);entries.push(local,filename,data);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);directory.push(central,filename);offset+=local.length+filename.length+data.length;
  }
  const count = Object.keys(parts).length;
  const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(count,8);end.writeUInt16LE(count,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
  const bytes=Buffer.concat([...entries,central,end]);assertAcademicDocx(bytes);return bytes;
}

import { assertPlainDocx } from "@/lib/workbench/docx";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
function xml(value: string) {
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error("El documento contiene caracteres no admitidos por Word");
  return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
function crc32(bytes: Buffer) { let value=0xffffffff; for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^(0xedb88320&-(value&1));}return(value^0xffffffff)>>>0; }
/** Five inert OOXML parts, stored ZIP; no executable fields or external relationships. */
export function exportAcademicDocx(body: string) {
  if (body.length>100000) throw new Error("El documento excede el límite de exportación");
  const paragraphs=body.split(/\r?\n/).map(line=>{const match=line.match(/^(#{1,3})\s+(.*)$/),text=match?match[2]:line;return `<w:p>${match?`<w:pPr><w:pStyle w:val="${match[1].length===1?"Title":"Heading1"}"/></w:pPr>`:""}<w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;}).join("");
  const parts:Record<string,string>={
    "[Content_Types].xml":'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    "_rels/.rels":`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OFFICE}officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml":`<w:document xmlns:w="${W}"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr></w:body></w:document>`,
    "word/styles.xml":`<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="22"/><w:lang w:val="es-CL"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="34"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>`,
    "word/_rels/document.xml.rels":`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OFFICE}styles" Target="styles.xml"/></Relationships>`,
  };
  const entries:Buffer[]=[],directory:Buffer[]=[];let offset=0;
  for(const [name,content] of Object.entries(parts)){
    const filename=Buffer.from(name),data=Buffer.from(content),crc=crc32(data),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);entries.push(local,filename,data);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);directory.push(central,filename);offset+=local.length+filename.length+data.length;
  }
  const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(5,8);end.writeUInt16LE(5,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
  const bytes=Buffer.concat([...entries,central,end]);assertPlainDocx(bytes);return bytes;
}

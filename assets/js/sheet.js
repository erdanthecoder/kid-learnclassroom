/* Vaultline — writes a real Excel workbook, with no library.
 *
 * Why bother, when a CSV is one line of join()? Because a CSV is not a
 * spreadsheet, it is a guess. Excel has to guess the encoding (and gets UTF-8
 * wrong unless you lead with a byte-order mark), guess the separator (comma in
 * some locales, semicolon in others), and guess which columns are numbers and
 * which are dates. An .xlsx says all of it outright.
 *
 * An .xlsx is a zip of small XML files. This writes the four that matter,
 * stores them uncompressed so no deflate is needed, and hands back a Blob.
 */

const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    /* control characters are illegal in XML and would corrupt the file */
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/* A cell beginning =, +, - or @ is run as a formula by Excel, so a place named
   "=cmd" in someone's book would execute on open. Lead those with an
   apostrophe, the spreadsheet way of saying "this is text". */
function safeText(value) {
  const s = String(value ?? '');
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function columnName(index) {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/* Excel counts days from 1899-12-30. */
function dateSerial(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return null;
  const days = Date.UTC(y, m - 1, d) / 86400000;
  return days + 25569;
}

/* ------------------------------------------------------------------ */
/* the zip container                                                   */
/* ------------------------------------------------------------------ */

function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() / 2)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.data);
    const sum = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);       // version needed
    local.setUint16(6, 0x0800, true);   // UTF-8 names
    local.setUint16(8, 0, true);        // stored, not deflated
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, sum, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);

    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, dosTime, true);
    entry.setUint16(14, dosDate, true);
    entry.setUint32(16, sum, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

/* ------------------------------------------------------------------ */
/* the workbook                                                        */
/* ------------------------------------------------------------------ */

const STYLE = { plain: 0, header: 1, date: 2, money: 3 };

function sheetXml(columns, rows) {
  const widths = columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`)
    .join('');

  const headerCells = columns.map((c, i) =>
    `<c r="${columnName(i)}1" s="${STYLE.header}" t="inlineStr"><is><t>${xmlEscape(c.header)}</t></is></c>`
  ).join('');

  const bodyRows = rows.map((row, r) => {
    const cells = columns.map((col, i) => {
      const ref = `${columnName(i)}${r + 2}`;
      const value = row[col.key];

      if (col.type === 'number') {
        const n = Number(value);
        if (!Number.isFinite(n)) return '';
        return `<c r="${ref}" s="${STYLE.money}"><v>${n}</v></c>`;
      }
      if (col.type === 'date') {
        const serial = dateSerial(value);
        if (serial === null) return '';
        return `<c r="${ref}" s="${STYLE.date}"><v>${serial}</v></c>`;
      }
      const text = safeText(value);
      if (!text) return '';
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 2}">${cells}</row>`;
  }).join('');

  const lastCol = columnName(columns.length - 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${widths}</cols>
<sheetData><row r="1" ht="20" customHeight="1">${headerCells}</row>${bodyRows}</sheetData>
<autoFilter ref="A1:${lastCol}${rows.length + 1}"/>
</worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="yyyy\\-mm\\-dd"/></numFmts>
<fonts count="2">
<font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF1B1B1B"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF2E4C4"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFD8B06A"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="0"/>
<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;

export function buildWorkbook({ sheetName = 'Sheet1', columns, rows }) {
  const safeName = String(sheetName).replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Sheet1';

  return zip([
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xmlEscape(safeName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    },
    { name: 'xl/styles.xml', data: STYLES_XML },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml(columns, rows) }
  ]);
}

/* A CSV that Excel opens correctly: a byte-order mark so UTF-8 is recognised,
   CRLF line endings, and the same guard against formula cells. */
export function buildCsv(columns, rows) {
  const cell = (value) => {
    const s = safeText(value);
    return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key])).join(','));
  return new Blob(['﻿', lines.join('\r\n'), '\r\n'], { type: 'text/csv;charset=utf-8' });
}

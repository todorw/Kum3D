const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function zip(files) {
  const encoder = new TextEncoder();
  const entries = files.map(({ name, data }) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    return { name: encoder.encode(name), bytes, crc: crc32(bytes) };
  });
  const local = entries.reduce((sum, e) => sum + 30 + e.name.length + e.bytes.length, 0);
  const central = entries.reduce((sum, e) => sum + 46 + e.name.length, 0);
  const out = new Uint8Array(local + central + 22);
  const view = new DataView(out.buffer);
  let o = 0;
  const header = (e, signature) => {
    view.setUint32(o, signature, true);
    const centralEntry = signature === 0x02014b50;
    if (centralEntry) {
      view.setUint16(o + 4, 20, true);
      o += 2;
    }
    view.setUint16(o + 4, 20, true);
    view.setUint16(o + 6, 0x0800, true);
    view.setUint16(o + 8, 0, true);
    view.setUint16(o + 12, 0x21, true);
    view.setUint32(o + 14, e.crc, true);
    view.setUint32(o + 18, e.bytes.length, true);
    view.setUint32(o + 22, e.bytes.length, true);
    view.setUint16(o + 26, e.name.length, true);
    view.setUint16(o + 28, 0, true);
    o += 30;
    if (centralEntry) {
      view.setUint32(o + 10, e.offset, true);
      o += 14;
    }
    out.set(e.name, o);
    o += e.name.length;
  };
  for (const e of entries) {
    e.offset = o;
    header(e, 0x04034b50);
    out.set(e.bytes, o);
    o += e.bytes.length;
  }
  const start = o;
  for (const e of entries) header(e, 0x02014b50);
  view.setUint32(o, 0x06054b50, true);
  view.setUint16(o + 8, entries.length, true);
  view.setUint16(o + 10, entries.length, true);
  view.setUint32(o + 12, o - start, true);
  view.setUint32(o + 16, start, true);
  return out;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;

const RELATIONSHIPS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;

function modelXml({ positions, indices }, name) {
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `<metadata name="Title">${name.replace(/[<>&"]/g, '')}</metadata><metadata name="Application">Kum3D</metadata>`,
    '<resources><object id="1" type="model"><mesh><vertices>'
  ];
  const n = (v) => +v.toFixed(4);
  for (let i = 0; i < positions.length; i += 3) {
    parts.push(`<vertex x="${n(positions[i])}" y="${n(positions[i + 1])}" z="${n(positions[i + 2])}"/>`);
  }
  parts.push('</vertices><triangles>');
  for (let i = 0; i < indices.length; i += 3) {
    parts.push(`<triangle v1="${indices[i]}" v2="${indices[i + 1]}" v3="${indices[i + 2]}"/>`);
  }
  parts.push('</triangles></mesh></object></resources><build><item objectid="1"/></build></model>');
  return parts.join('');
}

export function toThreeMf(mesh, name = 'Kum3D') {
  return zip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: RELATIONSHIPS },
    { name: '3D/3dmodel.model', data: modelXml(mesh, name) }
  ]);
}

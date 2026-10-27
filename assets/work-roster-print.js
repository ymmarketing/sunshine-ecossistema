/* Lista ritual para impressão e Word — sem acesso a rede ou alteração de inscrições. */
(function (global) {
  'use strict';
  function normalizedName(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
  }
  function dateBR(value) {
    if (!value) return 'SEM DATA';
    var raw = String(value).trim(), m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    return /^\d{2}\/\d{2}\/\d{4}$/.test(raw) ? raw : 'SEM DATA';
  }
  function prepare(participants) {
    var seen = new Set(), result = [];
    (Array.isArray(participants) ? participants : []).forEach(function (person) {
      var status = String(person.registrationStatus || person.financialStatus || '').toUpperCase();
      if (status === 'CANCELLED' || status === 'CANCELED') return;
      var name = normalizedName(person.personName), birth = dateBR(person.birthDate);
      if (!name) return;
      // Uma mesma pessoa pode ter vários registros; não excluir inscrições do banco.
      // A deduplicação vale apenas para este documento: nome completo + nascimento.
      var key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '') + '|' + birth;
      if (seen.has(key)) return;
      seen.add(key);
      result.push({ name: name, birth: birth });
    });
    result.sort(function (a, b) {
      return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }) ||
        a.birth.localeCompare(b.birth);
    });
    return result;
  }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function print(title, participants) {
    var rows = prepare(participants);
    if (!rows.length) throw new Error('Não há inscritos para imprimir.');
    var popup = global.open('', '_blank');
    if (!popup) throw new Error('Autorize a abertura da janela de impressão.');
    var body = rows.map(function (person) {
      return '<p class="entry"><span class="name">' + escapeHTML(person.name) +
        '</span><span class="birth">' + escapeHTML(person.birth) + '</span></p>';
    }).join('');
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' +
      escapeHTML('Inscritos — ' + (title || 'Trabalho')) +
      '</title><style>@page{size:A4;margin:12.5mm}html,body{margin:0;padding:0;background:white;color:black}' +
      'body{font-family:"Arial Narrow","Liberation Sans Narrow",Arial,sans-serif;font-size:18pt;line-height:1.4}' +
      '.entry{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:9mm;margin:0 0 3pt;' +
      'break-inside:avoid;page-break-inside:avoid;font-size:18pt;line-height:1.4}' +
      '.name{text-transform:uppercase;overflow-wrap:break-word}.birth{white-space:nowrap}' +
      '@media screen{body{max-width:185mm;margin:15mm auto;padding:0 8mm}}' +
      '@media print{body{max-width:none;margin:0;padding:0}}' +
      '</style></head><body><main>' + body + '</main>' +
      '<script>window.onload=function(){window.focus();window.print()};<\/script></body></html>';
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    return rows.length;
  }
  function escapeXML(value) {
    return String(value).replace(/[<>&"']/g, function (c) {
      return { '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c];
    });
  }
  function docxDocument(rows) {
    var entries = rows.map(function (person) {
      return '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="10375"/></w:tabs>' +
        '<w:keepLines/></w:pPr><w:r><w:t xml:space="preserve">' + escapeXML(person.name) +
        '</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>' + escapeXML(person.birth) +
        '</w:t></w:r></w:p>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' + entries + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="709" w:right="709" w:bottom="709" w:left="709" w:header="360" w:footer="360" w:gutter="0"/>' +
      '</w:sectPr></w:body></w:document>';
  }
  function zipStored(files) {
    var encoder = new TextEncoder(), local = [], central = [], offset = 0;
    function u16(n) { return new Uint8Array([n & 255, (n >>> 8) & 255]); }
    function u32(n) { return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]); }
    function concat(parts) {
      var total = parts.reduce(function (sum, x) { return sum + x.length; }, 0);
      var out = new Uint8Array(total), at = 0;
      parts.forEach(function (x) { out.set(x, at); at += x.length; });
      return out;
    }
    function crc32(bytes) {
      var crc = -1;
      for (var i = 0; i < bytes.length; i++) {
        crc ^= bytes[i];
        for (var j = 0; j < 8; j++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
      }
      return (crc ^ -1) >>> 0;
    }
    Object.keys(files).forEach(function (path) {
      var name = encoder.encode(path), content = encoder.encode(files[path]);
      var size = content.length, crc = crc32(content);
      var localEntry = concat([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),
        u32(crc),u32(size),u32(size),u16(name.length),u16(0),name,content]);
      var centralEntry = concat([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),
        u32(crc),u32(size),u32(size),u16(name.length),u16(0),u16(0),u16(0),u16(0),
        u32(0),u32(offset),name]);
      local.push(localEntry);
      central.push(centralEntry);
      offset += localEntry.length;
    });
    var directory = concat(central), count = central.length;
    var end = concat([u32(0x06054b50),u16(0),u16(0),u16(count),u16(count),
      u32(directory.length),u32(offset),u16(0)]);
    return concat(local.concat([directory,end]));
  }
  function makeWordBytes(participants) {
    var rows = prepare(participants);
    if (!rows.length) throw new Error('Não há inscritos para exportar.');
    var ns = 'http://schemas.openxmlformats.org/package/2006/relationships';
    return zipStored({
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '</Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="' + ns + '"><Relationship Id="rId1" ' +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ' +
        'Target="word/document.xml"/></Relationships>',
      'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="' + ns + '"><Relationship Id="rId1" ' +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" ' +
        'Target="styles.xml"/></Relationships>',
      'word/styles.xml': '<?xml version="1.0" encoding="UTF-8"?>' +
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
        '<w:pPr><w:spacing w:before="0" w:after="60" w:line="336" w:lineRule="auto"/></w:pPr>' +
        '<w:rPr><w:rFonts w:ascii="Arial Narrow" w:hAnsi="Arial Narrow"/><w:sz w:val="36"/></w:rPr>' +
        '</w:style></w:styles>',
      'word/document.xml': docxDocument(rows)
    });
  }
  function downloadWord(title, participants) {
    var bytes = makeWordBytes(participants);
    var safeTitle = String(title || 'Trabalho').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0,65);
    var url = URL.createObjectURL(new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }));
    var link = document.createElement('a');
    link.href = url;
    link.download = 'Sunshine_Inscritos_' + (safeTitle || 'Trabalho') + '.docx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
    return prepare(participants).length;
  }
  global.SunshineWorkRoster = Object.freeze({prepare:prepare,print:print,downloadWord:downloadWord,makeWordBytes:makeWordBytes});
})(window);

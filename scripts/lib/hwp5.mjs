/**
 * HWP 5.0 (한글 2002 이후 `.hwp`) 에서 글자를 뽑는다.
 *
 * 왜 필요한가 — 교육지원청 고시는 형식이 제각각이다. 인천만 해도 시교육청은 `hwpx`(zip+xml),
 * 남부·북부는 `pdf`, 서부는 `hwp` 로 올린다. hwp 는 **OLE 복합문서**라 zip 도 텍스트도 아니다.
 *
 * 구조 — 파일 = OLE 복합문서. 그 안에
 *   FileHeader          256바이트. 36번째 바이트의 비트 0 이 서면 본문이 zlib(헤더 없음)으로 눌려 있다
 *   BodyText/Section0…  본문. 레코드가 줄지어 있고 레코드 하나는 [헤더 4바이트][내용]
 *
 * 레코드 헤더 32비트 = 태그 10 · 단계 10 · 길이 12. 길이가 0xFFF 면 뒤 4바이트가 진짜 길이다.
 * 글자는 태그 67(HWPTAG_PARA_TEXT) 에 UTF-16LE 로 들어 있다.
 *
 * ⛔ 제어문자를 그냥 건너뛰면 안 된다 — **확장 제어문자는 16바이트**를 차지한다(표·그림 같은 것).
 *    2바이트만 넘기면 그 뒤로 글자가 통째로 어긋난다.
 */
import zlib from 'node:zlib';

const SIG = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const FREE = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;

/** OLE 복합문서를 풀어 { 이름 → 내용 } 으로 준다. */
function ole(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('OLE 복합문서가 아니다 (hwp 5.0 이 맞나)');
  const sectorSize = 1 << buf.readUInt16LE(0x1e);
  const miniSize = 1 << buf.readUInt16LE(0x20);
  const dirStart = buf.readUInt32LE(0x30);
  const miniCutoff = buf.readUInt32LE(0x38);
  const miniFatStart = buf.readUInt32LE(0x3c);
  const difatStart = buf.readUInt32LE(0x44);
  const difatCount = buf.readUInt32LE(0x48);

  const at = (sector) => 512 + sector * sectorSize;
  const sector = (n) => buf.subarray(at(n), at(n) + sectorSize);

  // FAT 이 어느 섹터들에 있나 — 앞 109개는 헤더에, 나머지는 DIFAT 섹터를 타고 이어진다.
  const fatSectors = [];
  for (let i = 0; i < 109; i++) {
    const s = buf.readUInt32LE(0x4c + i * 4);
    if (s === FREE || s === ENDOFCHAIN) break;
    fatSectors.push(s);
  }
  let next = difatStart;
  for (let i = 0; i < difatCount && next !== ENDOFCHAIN && next !== FREE; i++) {
    const s = sector(next);
    for (let j = 0; j < sectorSize / 4 - 1; j++) {
      const v = s.readUInt32LE(j * 4);
      if (v !== FREE && v !== ENDOFCHAIN) fatSectors.push(v);
    }
    next = s.readUInt32LE(sectorSize - 4);
  }

  const fat = [];
  for (const s of fatSectors) {
    const d = sector(s);
    for (let i = 0; i < sectorSize / 4; i++) fat.push(d.readUInt32LE(i * 4));
  }

  const chain = (start, table) => {
    const out = [];
    for (let s = start, guard = 0; s !== ENDOFCHAIN && s !== FREE && guard < 1e6; s = table[s], guard++) {
      if (s == null) break;
      out.push(s);
    }
    return out;
  };
  const readChain = (start, size) =>
    Buffer.concat(chain(start, fat).map(sector)).subarray(0, size);

  // 디렉터리 — 엔트리 128바이트씩. 0번이 루트고 그 스트림이 mini 스트림의 몸통이다.
  const dir = Buffer.concat(chain(dirStart, fat).map(sector));
  const entries = [];
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const nameLen = dir.readUInt16LE(off + 0x40);
    const name = nameLen > 2 ? dir.subarray(off, off + nameLen - 2).toString('utf16le') : '';
    entries.push({
      name,
      type: dir.readUInt8(off + 0x42),
      child: dir.readUInt32LE(off + 0x4c),
      left: dir.readUInt32LE(off + 0x44),
      right: dir.readUInt32LE(off + 0x48),
      start: dir.readUInt32LE(off + 0x74),
      size: dir.readUInt32LE(off + 0x78),
    });
  }

  const miniFat = [];
  for (const s of chain(miniFatStart, fat)) {
    const d = sector(s);
    for (let i = 0; i < sectorSize / 4; i++) miniFat.push(d.readUInt32LE(i * 4));
  }
  const miniStream = entries[0] ? readChain(entries[0].start, entries[0].size) : Buffer.alloc(0);
  const readMini = (start, size) =>
    Buffer.concat(
      chain(start, miniFat).map((n) => miniStream.subarray(n * miniSize, (n + 1) * miniSize))
    ).subarray(0, size);

  // 이름은 트리(빨강-검정)로 이어져 있지만 우리는 전부 훑으면 되니 순서만 되살린다.
  const files = new Map();
  const walk = (id, prefix) => {
    if (id === FREE || id >= entries.length) return;
    const e = entries[id];
    walk(e.left, prefix);
    const full = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.type === 2) files.set(full, e.size < miniCutoff ? readMini(e.start, e.size) : readChain(e.start, e.size));
    if (e.type === 1) walk(e.child, full);
    walk(e.right, prefix);
  };
  if (entries[0]) walk(entries[0].child, '');
  return files;
}

/**
 * 문단 하나하나를 글자로 뽑는다. 표는 셀 하나가 문단 하나로 나온다.
 * 표 안의 순서는 왼쪽→오른쪽, 위→아래다.
 */
export function hwpParagraphs(buf) {
  const files = ole(buf);
  const header = files.get('FileHeader');
  if (!header) throw new Error('FileHeader 가 없다 (hwp 5.0 이 맞나)');
  const compressed = (header.readUInt32LE(36) & 1) === 1;

  const out = [];
  const sections = [...files.keys()].filter((k) => /^BodyText\/Section\d+$/.test(k)).sort();
  for (const key of sections) {
    let data = files.get(key);
    if (compressed) data = zlib.inflateRawSync(data);
    let i = 0;
    while (i + 4 <= data.length) {
      const head = data.readUInt32LE(i);
      const tag = head & 0x3ff;
      let size = (head >> 20) & 0xfff;
      i += 4;
      if (size === 0xfff) { size = data.readUInt32LE(i); i += 4; }
      const body = data.subarray(i, i + size);
      i += size;
      if (tag !== 67) continue; // HWPTAG_PARA_TEXT
      let s = '';
      for (let j = 0; j + 1 < body.length; ) {
        const c = body.readUInt16LE(j);
        // 확장(1~3·11~12·14~18·21~23)은 16바이트, 나머지 제어문자는 2바이트다.
        if (c > 31) { s += String.fromCharCode(c); j += 2; continue; }
        const wide = (c >= 1 && c <= 3) || (c >= 11 && c <= 12) || (c >= 14 && c <= 18) || (c >= 21 && c <= 23);
        if (c === 9) s += '\t';
        j += wide ? 16 : 2;
      }
      out.push(s.trim());
    }
  }
  return out;
}

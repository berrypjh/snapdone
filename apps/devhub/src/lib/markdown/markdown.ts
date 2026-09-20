/**
 * 저장소 문서가 실제로 쓰는 Markdown만 작은 트리로 파싱한다. 제목 · 문단 · 목록(중첩) ·
 * 표 · 코드 블록 · 인용 · 구분선, 그리고 인라인 코드 · 굵게 · 링크.
 * HTML과 이미지는 문서에 없어서 다루지 않는다. 나머지는 글자 그대로 둔다.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] };

export type Block =
  | { kind: 'heading'; level: number; id: string; text: string; inline: Inline[] }
  | { kind: 'paragraph'; inline: Inline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { kind: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'rule' };

const FENCE = /^\s*```(\S*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*(-{3,}|\*{3,})\s*$/;
const LIST = /^(\s*)([-*]|(\d+)\.)\s+(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/** 인라인 Markdown을 트리로. 역슬래시는 한 글자를 이스케이프하고, 백틱이 무엇보다 먼저다. */
export const parseInline = (source: string): Inline[] => {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ kind: 'text', text });
    text = '';
  };
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const ch = source[i];
    if (ch === '\\' && i + 1 < source.length && /[\\`*_[\]()#|<>!-]/.test(source[i + 1])) {
      text += source[i + 1];
      i += 2;
      continue;
    }
    const code = /^(`+)([\s\S]*?[^`])\1(?!`)/.exec(rest);
    if (code) {
      flush();
      out.push({
        kind: 'code',
        text: code[2].trim() === '' ? code[2] : code[2].replace(/^ (.*) $/, '$1'),
      });
      i += code[0].length;
      continue;
    }
    const link = /^\[((?:[^\]\\`]|\\.|`[^`]*`)+)\]\(([^()\s]+)\)/.exec(rest);
    if (link) {
      flush();
      out.push({ kind: 'link', href: link[2], children: parseInline(link[1]) });
      i += link[0].length;
      continue;
    }
    const strong = /^\*\*((?:[^*`\\]|\\.|`[^`]*`)+?)\*\*/.exec(rest);
    if (strong) {
      flush();
      out.push({ kind: 'strong', children: parseInline(strong[1]) });
      i += strong[0].length;
      continue;
    }
    text += ch;
    i += 1;
  }
  flush();
  return out;
};

/** 인라인 내용의 평문. 독자가 보는 그대로다. */
export const inlineText = (inline: Inline[]): string =>
  inline
    .map((node) =>
      node.kind === 'text' || node.kind === 'code' ? node.text : inlineText(node.children),
    )
    .join('');

/**
 * GitHub의 제목 앵커. 소문자로 바꾸고 `-` · `_`를 뺀 문장부호를 버리고 공백을 `-`로 바꾼다.
 * 문서끼리 이미 이 방식으로 링크하고 있어서, 같은 링크가 DevHub 안에서도 통한다.
 */
export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');

/** 표의 칸. 코드 구간 밖이고 이스케이프되지 않은 `|`에서 자른다. */
const cells = (line: string): string[] => {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const out: string[] = [];
  let cell = '';
  let inCode = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === '\\' && trimmed[i + 1] === '|') {
      // GFM: 이스케이프된 파이프는 코드 구간 안에서도 파이프다. 코드 밖에서는 이스케이프를 남긴다.
      cell += inCode ? '|' : '\\|';
      i += 1;
    } else if (ch === '`') {
      inCode = !inCode;
      cell += ch;
    } else if (ch === '|' && !inCode) {
      out.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  out.push(cell.trim());
  return out;
};

const indentOf = (line: string) => line.length - line.trimStart().length;

const parseLines = (lines: string[], ids: Map<string, number>): Block[] => {
  const blocks: Block[] = [];
  let i = 0;
  const isBlank = (line: string | undefined) => line === undefined || line.trim() === '';

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const indent = indentOf(line);
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        body.push(lines[i].slice(Math.min(indent, indentOf(lines[i]))));
        i += 1;
      }
      i += 1;
      blocks.push({ kind: 'code', lang: fence[1], text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const inline = parseInline(heading[2]);
      const text = inlineText(inline);
      const base = slug(text);
      const seen = ids.get(base) ?? 0;
      ids.set(base, seen + 1);
      const id = seen === 0 ? base : `${base}-${seen}`;
      blocks.push({ kind: 'heading', level: heading[1].length, id, text, inline });
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      i += 1;
      continue;
    }

    if (line.trimStart().startsWith('|') && TABLE_SEPARATOR.test(lines[i + 1] ?? '')) {
      const head = cells(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        rows.push(cells(lines[i]).map(parseInline));
        i += 1;
      }
      blocks.push({ kind: 'table', head, rows });
      continue;
    }

    if (line.trimStart().startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        body.push(lines[i].trimStart().replace(/^> ?/, ''));
        i += 1;
      }
      blocks.push({ kind: 'quote', blocks: parseLines(body, ids) });
      continue;
    }

    const marker = LIST.exec(line);
    if (marker) {
      const indent = marker[1].length;
      const ordered = marker[3] !== undefined;
      const items: Block[][] = [];
      while (i < lines.length) {
        const item = LIST.exec(lines[i]);
        if (!item || item[1].length !== indent || (item[3] !== undefined) !== ordered) break;
        const content = indent + item[2].length + 1;
        const body = [item[4]];
        i += 1;
        // 내용만큼 들여쓴 줄, 또는 그런 줄 앞의 빈 줄이 이어지는 동안 항목이 계속된다.
        while (i < lines.length) {
          const next = lines[i];
          if (!isBlank(next) && indentOf(next) >= content) {
            body.push(next.slice(content));
            i += 1;
          } else if (isBlank(next) && !isBlank(lines[i + 1]) && indentOf(lines[i + 1]) >= content) {
            body.push('');
            i += 1;
          } else if (!isBlank(next) && indentOf(next) > indent && LIST.test(next)) {
            body.push(next.slice(Math.min(content, indentOf(next))));
            i += 1;
          } else break;
        }
        items.push(parseLines(body, ids));
      }
      blocks.push({ kind: 'list', ordered, start: ordered ? Number(marker[3]) : 1, items });
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !FENCE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !LIST.test(lines[i]) &&
      !lines[i].trimStart().startsWith('>') &&
      !(lines[i].trimStart().startsWith('|') && TABLE_SEPARATOR.test(lines[i + 1] ?? ''))
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ kind: 'paragraph', inline: parseInline(paragraph.join(' ')) });
  }
  return blocks;
};

/** 문서 한 벌. 제목 id는 문서 안에서 유일하다(겹치면 GitHub처럼 `-1` · `-2`를 붙인다). */
export const parseMarkdown = (source: string): Block[] =>
  parseLines(source.replace(/\r\n?/g, '\n').split('\n'), new Map());

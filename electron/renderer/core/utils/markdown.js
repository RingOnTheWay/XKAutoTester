// markdown.js — 渲染层零依赖 Markdown (GFM 子集) 渲染器
//
// 动机: 更新弹窗 changelog 原先用 4 条正则渲染 (仅 ** / * / ` / \n), GitHub
// Release body 的 "## 标题" / "- 列表" / "[链接](url)" 全部退化成纯文本。
//
// 安全契约 (硬性, 任何改动不得绕过):
//   1. 先 escapeHtml 再变换 —— 输入里的原生 HTML 一律变字面量, 不做 raw HTML 透传。
//   2. 仅当协议为 https 且 host 命中白名单时才产出锚点 (镜像主进程
//      src/main/utils/urlGuard.js); 其余降级为纯文本。href 值经二次转义, 杜绝属性逃逸。
//   3. 图片语法 ![alt](url) 只渲染 alt 文本, 不发远程请求 (防追踪 / 防意外外联)。
//
// 支持子集:
//   块级 — #~###### 标题 / 无序·有序列表 (2 空格缩进嵌套) / 任务列表 / > 引用 /
//          ``` 围栏代码 / --- 分隔线 / | 管道表格 (含对齐) / 段落 (软换行 → <br>)
//   行内 — **粗** / *斜* / ~~删除~~ / `行内码` / [文字](url) / 裸 https 自动链接
//   刻意不支持 (记录在案, 见 dev-records): raw HTML、_斜体_ (会毁 snake_case)、
//          引用式链接、脚注、emoji 短码、缩进式代码块、图片外链。
//
// 链接产出 `<a data-external="1">` —— 点击由 settings controller 事件委托接管,
// 走 electronAPI.openExternal (系统浏览器), 不在 Electron 窗口内导航。

import { escapeHtml } from './html.js';

// ── 链接白名单 (与主进程 urlGuard.js 保持同源口径) ──────────────────
const ALLOWED_LINK_PROTOCOLS = new Set(['https:']);
const ALLOWED_LINK_HOSTS = new Set(['github.com', 'www.github.com']);

const ENTITY_DECODE_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

/** 反转义 html.js 产出的 5 个实体 (仅用于 URL 校验前还原, 不参与输出) */
function decodeEntities(str) {
  return str.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ENTITY_DECODE_MAP[name]);
}

/**
 * 校验 URL 是否允许作为可点击外链。
 * @param {string} url
 * @returns {boolean}
 */
export function isSafeExternalUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false;
  let parsed;
  try {
    parsed = new URL(decodeEntities(url));
  } catch {
    return false;
  }
  if (!ALLOWED_LINK_PROTOCOLS.has(parsed.protocol)) return false;
  return ALLOWED_LINK_HOSTS.has(parsed.hostname.toLowerCase());
}

// ── 块级语法 ───────────────────────────────────────────────────────
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#-]*)\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const BLOCKQUOTE_RE = /^\s{0,3}>\s?(.*)$/;
const LIST_ITEM_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
// 表格分隔行: 必须含至少一个 | (借此与 --- 分隔线区分)
const TABLE_DELIM_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;

// 注意: 不可复用单个带 g 的 RegExp 实例 —— renderInline 会递归, 共享实例的
// lastIndex 会被内层调用踩坏, 导致外层循环死循环。每次渲染新建实例。
const INLINE_SOURCE = [
  '(`+)([^`\\n]+?)\\1', // 1,2 — 行内码
  '\\*\\*([^\\n]+?)\\*\\*', // 3 — 粗体
  '~~([^\\n]+?)~~', // 4 — 删除线
  '\\*([^*\\n]+?)\\*', // 5 — 斜体
  '!?\\[([^\\]\\n]*)\\]\\(((?:[^()\\s]|\\([^()\\s]*\\))*)(?:\\s+"[^"]*")?\\)', // 6,7 — 链接/图片 (URL 允许一层括号)
  '(https?:\\/\\/[^\\s<>"\'`)\\]]+)', // 8 — 裸链接
].join('|');

const MAX_INLINE_DEPTH = 4;

// ── 行内渲染 ───────────────────────────────────────────────────────
// 入参必须是已转义文本 (内部契约), 返回值可直接拼进 HTML。
function renderInline(escaped, depth = 0) {
  if (!escaped) return '';
  if (depth >= MAX_INLINE_DEPTH) return escaped;
  const re = new RegExp(INLINE_SOURCE, 'g');
  let out = '';
  let last = 0;
  let m = re.exec(escaped);
  while (m !== null) {
    out += escaped.slice(last, m.index);
    out += renderInlineToken(m, depth);
    last = re.lastIndex;
    m = re.exec(escaped);
  }
  out += escaped.slice(last);
  return out;
}

function renderInlineToken(m, depth) {
  if (m[1] !== undefined) return `<code class="md-code">${m[2]}</code>`;
  if (m[3] !== undefined) return `<strong>${renderInline(m[3], depth + 1)}</strong>`;
  if (m[4] !== undefined) return `<del>${renderInline(m[4], depth + 1)}</del>`;
  if (m[5] !== undefined) return `<em>${renderInline(m[5], depth + 1)}</em>`;
  if (m[6] !== undefined && m[7] !== undefined) {
    // 图片: 只出 alt 文本, 不外链
    if (m[0].startsWith('!')) return renderInline(m[6], depth + 1);
    return renderLink(m[6], m[7]);
  }
  if (m[8] !== undefined) return renderLink(m[8], m[8]);
  return m[0];
}

function renderLink(text, url) {
  const decoded = decodeEntities(url);
  if (!isSafeExternalUrl(decoded)) {
    // 非白名单 (http / 非 github host / javascript: / 相对路径 …) → 不可点, 但保留信息
    if (text === url) return `<span class="md-url">${url}</span>`;
    return `${text}<span class="md-url"> (${url})</span>`;
  }
  return `<a class="md-link" href="${escapeHtml(decoded)}" data-external="1" rel="noopener noreferrer">${text}</a>`;
}

// ── 列表 ───────────────────────────────────────────────────────────
function collectListEntries(lines, start) {
  const entries = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') break;
    const m = LIST_ITEM_RE.exec(line);
    if (m) {
      const indent = m[1].replace(/\t/g, '  ').length;
      const ordered = /\d/.test(m[2]);
      const number = ordered ? parseInt(m[2], 10) : null;
      let text = m[3];
      let checklist = false;
      let checked = false;
      const cm = /^\[([ xX])\]\s+(.*)$/.exec(text);
      if (cm) {
        checklist = true;
        checked = cm[1].toLowerCase() === 'x';
        text = cm[2];
      }
      entries.push({ indent, ordered, number, text, checklist, checked });
      i += 1;
      continue;
    }
    // 惰性续行: 缩进深于当前条目 → 并入该条目文本
    const last = entries[entries.length - 1];
    const contIndent = (line.match(/^\s*/) || [''])[0].replace(/\t/g, '  ').length;
    if (last && line.trim() !== '' && contIndent > last.indent) {
      last.text += ' ' + line.trim();
      i += 1;
      continue;
    }
    break;
  }
  return { entries, next: i };
}

// 递归按缩进渲染; 同级列表类型切换时交回上层另起 <ul>/<ol>
function renderList(entries, start) {
  const baseIndent = entries[start].indent;
  const ordered = entries[start].ordered;
  const startAttr = ordered && entries[start].number !== 1 ? ` start="${entries[start].number}"` : '';
  let html = `<${ordered ? 'ol' : 'ul'}${startAttr}>`;
  let i = start;
  while (i < entries.length && entries[i].indent >= baseIndent) {
    if (entries[i].indent > baseIndent) {
      const nested = renderList(entries, i);
      html += nested.html;
      i = nested.next;
      continue;
    }
    if (entries[i].ordered !== ordered) break;
    const item = entries[i];
    i += 1;
    html += '<li>';
    if (item.checklist) {
      html += `<input type="checkbox" disabled${item.checked ? ' checked' : ''}> `;
    }
    html += renderInline(escapeHtml(item.text));
    while (i < entries.length && entries[i].indent > baseIndent) {
      const nested = renderList(entries, i);
      html += nested.html;
      i = nested.next;
    }
    html += '</li>';
  }
  html += `</${ordered ? 'ol' : 'ul'}>`;
  return { html, next: i };
}

// ── 引用 ───────────────────────────────────────────────────────────
function collectBlockquote(lines, start) {
  const inner = [];
  let i = start;
  while (i < lines.length) {
    const m = BLOCKQUOTE_RE.exec(lines[i]);
    if (!m) break;
    inner.push(m[1]);
    i += 1;
  }
  return { inner, next: i };
}

// ── 代码块 ─────────────────────────────────────────────────────────
function collectFence(lines, start, marker) {
  const char = marker.charAt(0);
  const minLen = marker.length;
  const open = FENCE_RE.exec(lines[start]);
  const lang = open[2] || '';
  const body = [];
  // 收尾围栏: 同字符且长度 >= 起始围栏, 行内无其他内容
  const close = new RegExp('^\\s{0,3}' + char + '{' + minLen + ',}\\s*$');
  let i = start + 1;
  while (i < lines.length) {
    if (close.test(lines[i])) {
      i += 1;
      break;
    }
    body.push(lines[i]);
    i += 1;
  }
  const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
  const html = `<pre class="md-pre"${langAttr}><code>${escapeHtml(body.join('\n'))}</code></pre>`;
  return { html, next: i };
}

// ── 表格 ───────────────────────────────────────────────────────────
function isTableStart(lines, i) {
  const head = lines[i];
  const delim = lines[i + 1];
  if (head === undefined || delim === undefined) return false;
  if (!head.includes('|')) return false;
  return TABLE_DELIM_RE.test(delim);
}

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function parseAlignments(delimLine) {
  return splitTableRow(delimLine).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return '';
  });
}

function alignAttr(align) {
  return align ? ` style="text-align:${align}"` : '';
}

function renderTable(lines, start) {
  const header = splitTableRow(lines[start]);
  const aligns = parseAlignments(lines[start + 1]);
  let i = start + 2;
  const rows = [];
  while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
    rows.push(splitTableRow(lines[i]));
    i += 1;
  }
  const headHtml = header
    .map((cell, idx) => `<th${alignAttr(aligns[idx])}>${renderInline(escapeHtml(cell))}</th>`)
    .join('');
  const bodyHtml = rows
    .map((row) => {
      const cells = [];
      for (let c = 0; c < header.length; c += 1) {
        cells.push(`<td${alignAttr(aligns[c])}>${renderInline(escapeHtml(row[c] || ''))}</td>`);
      }
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');
  return `<table class="md-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

// ── 块级调度 ───────────────────────────────────────────────────────
function isBlockStart(lines, i) {
  const line = lines[i];
  if (line === undefined || line.trim() === '') return true;
  if (FENCE_RE.test(line)) return true;
  if (HR_RE.test(line)) return true;
  if (HEADING_RE.test(line)) return true;
  if (BLOCKQUOTE_RE.test(line)) return true;
  if (LIST_ITEM_RE.test(line)) return true;
  return isTableStart(lines, i);
}

function renderBlocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const fence = FENCE_RE.exec(line);
    if (fence) {
      const block = collectFence(lines, i, fence[1]);
      out.push(block.html);
      i = block.next;
      continue;
    }

    if (HR_RE.test(line)) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(escapeHtml(heading[2]))}</h${level}>`);
      i += 1;
      continue;
    }

    if (isTableStart(lines, i)) {
      out.push(renderTable(lines, i));
      i += 1;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') i += 1;
      continue;
    }

    if (BLOCKQUOTE_RE.test(line)) {
      const quote = collectBlockquote(lines, i);
      out.push(`<blockquote>${renderBlocks(quote.inner)}</blockquote>`);
      i = quote.next;
      continue;
    }

    if (LIST_ITEM_RE.test(line)) {
      const collected = collectListEntries(lines, i);
      let cursor = 0;
      while (cursor < collected.entries.length) {
        const rendered = renderList(collected.entries, cursor);
        out.push(rendered.html);
        cursor = rendered.next;
      }
      i = collected.next;
      continue;
    }

    // 段落
    const para = [];
    while (i < lines.length && !isBlockStart(lines, i)) {
      para.push(lines[i].trim());
      i += 1;
    }
    if (para.length > 0) {
      out.push(`<p>${para.map((l) => renderInline(escapeHtml(l))).join('<br>')}</p>`);
    }
  }
  return out.join('\n');
}

/**
 * 渲染 Markdown (GFM 子集) 为安全 HTML 字符串。
 * @param {*} text - 原始 markdown (通常是 GitHub Release body)
 * @returns {string} 可直接 innerHTML 的 HTML
 */
export function renderMarkdown(text) {
  if (text === null || text === undefined) return '';
  const src = String(text)
    .replace(/\r\n?/g, '\n')
    // HTML 注释不参与显示 (GitHub 同样不显示)。本项目不透传 raw HTML, 若不剥掉,
    // release body 模板首段的 `<!-- Release body - vX.Y.Z ... -->` 会原样显出来。
    // 注释本就是无信息量的脚手架, 剥离无损失。
    .replace(/<!--[\s\S]*?-->/g, '');
  if (src.trim() === '') return '';
  return renderBlocks(src.split('\n'));
}

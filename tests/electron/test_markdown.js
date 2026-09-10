// core/utils/markdown.js — 渲染层 Markdown (GFM 子集) 渲染器单测
//
// 覆盖两个硬性契约:
//   1. 语法覆盖: 标题 / 列表 (嵌套·有序·任务) / 引用 / 分隔线 / 围栏代码 / 表格 /
//      行内格式 / 裸链接自动链接
//   2. 安全: 原生 HTML 一律转义 (无 XSS), 链接只对 https + github.com 产出锚点

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// jsdom 装在 electron/node_modules 下, tests/ 目录无法直接 require, 用绝对路径
const { JSDOM } = require(path.join(__dirname, '..', '..', 'electron', 'node_modules', 'jsdom'));

/** 把渲染结果挂进真实 DOM, 用于"不变量"级断言 (而非字符串比对) */
function renderToDom(html) {
  return new JSDOM(`<!DOCTYPE html><html><body><div id="root">${html}</div></body></html>`);
}

let renderMarkdown;
let isSafeExternalUrl;

async function load() {
  if (!renderMarkdown) {
    const mod = await import('../../electron/renderer/core/utils/markdown.js');
    renderMarkdown = mod.renderMarkdown;
    isSafeExternalUrl = mod.isSafeExternalUrl;
  }
  return renderMarkdown;
}

describe('markdown — 空输入与边界', () => {
  test('null / undefined / 空串 → 空输出', async () => {
    const md = await load();
    assert.strictEqual(md(null), '');
    assert.strictEqual(md(undefined), '');
    assert.strictEqual(md(''), '');
    assert.strictEqual(md('   \n\n  '), '');
  });

  test('CRLF 归一化 (GitHub body 常带 \\r\\n)', async () => {
    const md = await load();
    assert.strictEqual(md('## A\r\n\r\n- x'), '<h2>A</h2>\n<ul><li>x</li></ul>');
  });

  test('病态输入 (大量 * / 反引号) 必须终止且不炸栈', async () => {
    const md = await load();
    const nasty = '*'.repeat(4000);
    const out = md(nasty);
    assert.ok(out.length > 0);
    assert.ok(md('`'.repeat(2000)).length >= 0);
    assert.ok(md('[a](' + 'https://github.com/'.repeat(200) + ')').length > 0);
  });
});

describe('markdown — 块级语法', () => {
  test('ATX 标题 h1~h6', async () => {
    const md = await load();
    assert.strictEqual(md('# H1'), '<h1>H1</h1>');
    assert.strictEqual(md('###### H6'), '<h6>H6</h6>');
  });

  test('释放 body 顶端 HTML 注释被剥离 (GitHub 也不显示, 否则反显脚手架)', async () => {
    const md = await load();
    const out = md('<!--\n  Release body - v0.1.6-dev.2\n  用法: publish-release.ps1\n-->\n\n# Title');
    assert.strictEqual(out, '<h1>Title</h1>');
    assert.ok(!out.includes('Release body'));
    assert.ok(!out.includes('<!--'));
  });

  test('纯注释输入 → 空输出', async () => {
    const md = await load();
    assert.strictEqual(md('<!-- only a comment -->'), '');
  });

  test('行内注释被剥离, 前后文本保留', async () => {
    const md = await load();
    assert.strictEqual(md('before <!-- x --> after'), '<p>before  after</p>');
  });

  test('未闭合注释按普通文本转义 (不吞掉后续内容)', async () => {
    const md = await load();
    const out = md('<!-- never closed\n\n## Still here');
    assert.ok(out.includes('<h2>Still here</h2>'));
    assert.ok(out.includes('&lt;!--'));
  });

  test('注释内外的 HTML 都不成为注入面', async () => {
    const md = await load();
    assert.strictEqual(md('<!-- <script>alert(1)</script> -->'), '');
    const dom = renderToDom(md('<!-- x --><script>alert(1)</script>'));
    assert.strictEqual(dom.window.document.querySelectorAll('script').length, 0);
  });

  test('标题尾部的井号被剥掉 (# 与 ## 混用)', async () => {
    const md = await load();
    assert.strictEqual(md('## Title ##'), '<h2>Title</h2>');
  });

  test('#hashtag (无空格) 不是标题', async () => {
    const md = await load();
    assert.ok(!md('#hashtag').includes('<h1>'));
  });

  test('无序列表 (三种 marker) + 有序列表 + start 属性', async () => {
    const md = await load();
    assert.strictEqual(md('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
    assert.strictEqual(md('* a\n* b'), '<ul><li>a</li><li>b</li></ul>');
    assert.strictEqual(md('+ a\n+ b'), '<ul><li>a</li><li>b</li></ul>');
    assert.strictEqual(md('3. c\n4. d'), '<ol start="3"><li>c</li><li>d</li></ol>');
  });

  test('嵌套列表 (2 空格缩进) 挂在父 li 内', async () => {
    const md = await load();
    const out = md('- a\n  - a1\n  - a2\n- b');
    assert.strictEqual(out, '<ul><li>a<ul><li>a1</li><li>a2</li></ul></li><li>b</li></ul>');
  });

  test('列表类型在同级切换 → 拆成两个列表', async () => {
    const md = await load();
    const out = md('- a\n1. b');
    assert.strictEqual(out, '<ul><li>a</li></ul>\n<ol><li>b</li></ol>');
  });

  test('任务列表渲染 disabled checkbox', async () => {
    const md = await load();
    const out = md('- [x] done\n- [ ] todo');
    assert.ok(out.includes('<input type="checkbox" disabled checked>'));
    assert.ok(out.includes('<input type="checkbox" disabled>'));
  });

  test('列表惰性续行并入当前条目', async () => {
    const md = await load();
    assert.strictEqual(md('- 第一行\n  第二行'), '<ul><li>第一行 第二行</li></ul>');
  });

  test('引用 (连续 > 行合并为单块, 内部走块级解析)', async () => {
    const md = await load();
    assert.strictEqual(md('> a\n> b'), '<blockquote><p>a<br>b</p></blockquote>');
    assert.strictEqual(md('> ## 引内标题'), '<blockquote><h2>引内标题</h2></blockquote>');
  });

  test('分隔线 (--- / *** / ___)', async () => {
    const md = await load();
    assert.strictEqual(md('---'), '<hr>');
    assert.strictEqual(md('***'), '<hr>');
    assert.strictEqual(md('___'), '<hr>');
  });

  test('围栏代码块: 原样保留, 内部 markdown 不解析, 语言写入 data-lang', async () => {
    const md = await load();
    const out = md('```json\n{ "a": 1 }\n**not bold**\n```');
    assert.ok(out.startsWith('<pre class="md-pre" data-lang="json"><code>'));
    assert.ok(out.includes('&quot;a&quot;: 1'));
    assert.ok(out.includes('**not bold**'));
    assert.ok(!out.includes('<strong>'));
  });

  test('未闭合围栏仍成块 (不吞掉后续内容的空白)', async () => {
    const md = await load();
    const out = md('```\nabc');
    assert.ok(out.includes('<pre'));
    assert.ok(out.includes('abc'));
  });

  test('表格: 表头/分隔行/数据行 + 三向对齐', async () => {
    const md = await load();
    const out = md('| A | B | C |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |');
    assert.ok(out.includes('<table class="md-table"><thead><tr>'));
    assert.ok(out.includes('<th style="text-align:left">A</th>'));
    assert.ok(out.includes('<th style="text-align:center">B</th>'));
    assert.ok(out.includes('<th style="text-align:right">C</th>'));
    assert.ok(out.includes('<td style="text-align:left">1</td>'));
    assert.ok(out.includes('<td style="text-align:right">3</td>'));
  });

  test('--- 分隔线不被误判为表格分隔行', async () => {
    const md = await load();
    assert.strictEqual(md('| a |\n---'), '<p>| a |</p>\n<hr>');
  });

  test('段落: 软换行 → <br>', async () => {
    const md = await load();
    assert.strictEqual(md('a\nb'), '<p>a<br>b</p>');
  });
});

describe('markdown — 行内语法', () => {
  test('粗体 / 斜体 / 删除线 / 行内码', async () => {
    const md = await load();
    assert.strictEqual(md('**b**'), '<p><strong>b</strong></p>');
    assert.strictEqual(md('*i*'), '<p><em>i</em></p>');
    assert.strictEqual(md('~~s~~'), '<p><del>s</del></p>');
    assert.strictEqual(md('`c`'), '<p><code class="md-code">c</code></p>');
  });

  test('粗体优先于斜体 (** 不被拆成两个 *)', async () => {
    const md = await load();
    assert.strictEqual(md('**bold**'), '<p><strong>bold</strong></p>');
  });

  test('行内码内不解析强调', async () => {
    const md = await load();
    assert.strictEqual(md('`**x**`'), '<p><code class="md-code">**x**</code></p>');
  });

  test('粗体内部可含行内码与斜体', async () => {
    const md = await load();
    assert.strictEqual(md('**a `c` b**'), '<p><strong>a <code class="md-code">c</code> b</strong></p>');
  });

  test('_斜体_ 不支持 (保护 snake_case 标识符)', async () => {
    const md = await load();
    assert.strictEqual(md('foo_bar_baz'), '<p>foo_bar_baz</p>');
    assert.ok(!md('_x_').includes('<em>'));
  });

  test('白名单链接 → 锚点 (data-external + rel)', async () => {
    const md = await load();
    const out = md('[PR](https://github.com/RingOnTheWay/XKAutoTester/pull/12)');
    assert.strictEqual(
      out,
      '<p><a class="md-link" href="https://github.com/RingOnTheWay/XKAutoTester/pull/12" data-external="1" rel="noopener noreferrer">PR</a></p>'
    );
  });

  test('裸 https://github.com 链接自动链接', async () => {
    const md = await load();
    const out = md('Full Changelog: https://github.com/a/b/compare/v1...v2');
    assert.ok(out.includes('<a class="md-link" href="https://github.com/a/b/compare/v1...v2"'));
  });

  test('URL 含一层括号不被截断', async () => {
    const md = await load();
    const out = md('[x](https://github.com/a_(b)/c)');
    assert.ok(out.includes('href="https://github.com/a_(b)/c"'));
  });

  test('图片语法只出 alt 文本, 不产出 img 也不外链', async () => {
    const md = await load();
    const out = md('![badge](https://img.shields.io/badge/x-y)');
    assert.strictEqual(out, '<p>badge</p>');
    assert.ok(!out.includes('<img'));
  });
});

describe('markdown — 安全契约 (XSS / URL 白名单)', () => {
  test('原生 HTML 一律转义', async () => {
    const md = await load();
    const out = md('<script>alert(1)</script>');
    assert.ok(!out.includes('<script'));
    assert.ok(out.includes('&lt;script&gt;'));
  });

  test('事件属性注入被转义', async () => {
    const md = await load();
    const out = md('<img src=x onerror=alert(1)>');
    assert.ok(!out.includes('<img'));
    assert.ok(!/onerror=/.test(out.replace(/&lt;img src=x onerror=alert\(1\)&gt;/, '')));
  });

  test('javascript: 链接不产出锚点', async () => {
    const md = await load();
    const out = md('[click](javascript:alert(1))');
    assert.ok(!out.includes('<a '));
    assert.ok(out.includes('<span class="md-url">'));
  });

  test('data: 链接不产出锚点', async () => {
    const md = await load();
    assert.ok(!md('[x](data:text/html;base64,PHNjcmlwdD4=)').includes('<a '));
  });

  test('http: (明文) 与白名单外 host 不产出锚点', async () => {
    const md = await load();
    assert.ok(!md('[x](http://github.com/a)').includes('<a '));
    assert.ok(!md('[x](https://evil.example.com/a)').includes('<a '));
    assert.ok(!md('[x](https://raw.githubusercontent.com/a)').includes('<a '));
  });

  test('相对路径链接不产出锚点 (无法判定基址)', async () => {
    const md = await load();
    assert.ok(!md('[x](/RingOnTheWay/XKAutoTester/compare/a...b)').includes('<a '));
  });

  test('href 属性无法逃逸 (引号已转义)', async () => {
    const md = await load();
    const dom = renderToDom(md('[x](https://github.com/a"onmouseover="alert(1))'));
    const anchor = dom.window.document.querySelector('a');
    assert.ok(anchor, '白名单 host 应产出锚点');
    // 真正的不变量: DOM 上不得出现任何 on* 事件属性
    for (const attr of anchor.attributes) {
      assert.ok(!/^on/i.test(attr.name), `不应出现事件属性 ${attr.name}`);
    }
  });

  test('多种注入载荷在 DOM 上均不产生脚本/事件属性', async () => {
    const md = await load();
    const payloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<a href="javascript:alert(1)">x</a>',
      '<svg/onload=alert(1)>',
      '"><iframe src=javascript:alert(1)>',
      '[x](https://github.com/a"onmouseover="alert(1))',
      '![x](" onerror="alert(1))',
    ];
    for (const payload of payloads) {
      const dom = renderToDom(md(payload));
      const doc = dom.window.document;
      assert.strictEqual(doc.querySelectorAll('script').length, 0, `脚本节点泄漏: ${payload}`);
      assert.strictEqual(doc.querySelectorAll('iframe, svg, img').length, 0, `危险标签泄漏: ${payload}`);
      for (const el of doc.querySelectorAll('*')) {
        for (const attr of el.attributes) {
          assert.ok(!/^on/i.test(attr.name), `事件属性 ${attr.name} 泄漏: ${payload}`);
          if (attr.name === 'href') {
            assert.ok(!/^javascript:/i.test(attr.value), `javascript: href 泄漏: ${payload}`);
          }
        }
      }
    }
  });

  test('输入中的实体被二次转义 (不产生伪造标签)', async () => {
    const md = await load();
    const out = md('&lt;script&gt;');
    assert.ok(out.includes('&amp;lt;script&amp;gt;'));
    assert.ok(!out.includes('<script'));
  });

  test('isSafeExternalUrl 白名单口径', async () => {
    await load();
    assert.strictEqual(isSafeExternalUrl('https://github.com/a/b'), true);
    assert.strictEqual(isSafeExternalUrl('https://www.github.com/a'), true);
    assert.strictEqual(isSafeExternalUrl('http://github.com/a'), false);
    assert.strictEqual(isSafeExternalUrl('https://evil.com'), false);
    assert.strictEqual(isSafeExternalUrl('javascript:alert(1)'), false);
    assert.strictEqual(isSafeExternalUrl('file:///etc/passwd'), false);
    assert.strictEqual(isSafeExternalUrl('/relative'), false);
    assert.strictEqual(isSafeExternalUrl(''), false);
    assert.strictEqual(isSafeExternalUrl(null), false);
    // 子域名/后缀伪装必须拒绝
    assert.strictEqual(isSafeExternalUrl('https://github.com.evil.com/a'), false);
    assert.strictEqual(isSafeExternalUrl('https://notgithub.com/a'), false);
  });
});

describe('markdown — 真实 GitHub Release body 集成', () => {
  const BODY = [
    "## What's Changed",
    '### Exciting New Features 🎉',
    '- **feat(scrcpy)**: parameterized mirroring by @RingOnTheWay in [#12](https://github.com/RingOnTheWay/XKAutoTester/pull/12)',
    '',
    '### Bug Fixes',
    '- fix: `no_active` idempotent cancel',
    '',
    '> Upgrade note: requires JDK 17+',
    '',
    '| Platform | Supported |',
    '| :------- | :-------: |',
    '| win32    |    yes    |',
    '',
    '```bash',
    'npm run build-lite-win',
    '```',
    '',
    '---',
    '',
    '**Full Changelog**: https://github.com/RingOnTheWay/XKAutoTester/compare/v0.1.5...v0.1.6',
  ].join('\n');

  test('关键结构全部产出对应标签', async () => {
    const md = await load();
    const out = md(BODY);
    assert.ok(out.includes('<h2>'));
    assert.ok(out.includes('<h3>'));
    assert.ok(out.includes('<ul><li>'));
    assert.ok(out.includes('<strong>feat(scrcpy)</strong>'));
    assert.ok(out.includes('<code class="md-code">no_active</code>'));
    assert.ok(out.includes('<blockquote>'));
    assert.ok(out.includes('<table class="md-table">'));
    assert.ok(out.includes('<pre class="md-pre" data-lang="bash">'));
    assert.ok(out.includes('<hr>'));
    assert.ok(out.includes('<a class="md-link" href="https://github.com/RingOnTheWay/XKAutoTester/pull/12"'));
    assert.ok(!out.includes('<script'));
  });
});

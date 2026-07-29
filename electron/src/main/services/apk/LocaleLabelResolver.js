/**
 * LocaleLabelResolver - APK application-label locale 优先级解析 + UTF-8 乱码修复
 *
 * 设计:
 * - 从 aapt2 输出的 localeLabels 字典中, 按优先级链选出首选标签
 * - 优先级: appLocale → baseLang → zh-CN → en-US → en → default
 * - 对选中的标签执行 _fixGarbledUtf8 修复 (latin1 误编码的中文)
 * - 依赖 i18nService.getLanguage() 获取当前 app locale, 缺失时默认 zh-CN
 */
class LocaleLabelResolver {
  /**
   * @param {object} deps
   * @param {object} [deps.i18nService] - 需 getLanguage() 方法, 返回 'zh-CN'/'en-US' 等
   */
  constructor({ i18nService }) {
    this._i18n = i18nService || null;
  }

  /**
   * 从 localeLabels 字典选出首选标签 (含 UTF-8 乱码修复)
   * @param {Object<string,string>} localeLabels - { 'zh-CN': '...', default: '...' }
   * @param {string} defaultLabel - application-label 行的默认值 (兜底)
   * @returns {string} 修复后的标签
   */
  resolve(localeLabels, defaultLabel) {
    if (!localeLabels || Object.keys(localeLabels).length === 0) {
      return this._fixGarbledUtf8(defaultLabel);
    }

    let appLocale = 'zh-CN';
    if (this._i18n && typeof this._i18n.getLanguage === 'function') {
      appLocale = this._i18n.getLanguage() || 'zh-CN';
    }

    const candidates = [appLocale];

    const baseLang = appLocale.split('-')[0];
    if (baseLang !== appLocale) {
      candidates.push(baseLang);
    }

    if (appLocale !== 'zh-CN') candidates.push('zh-CN');
    if (appLocale !== 'en-US') candidates.push('en-US');
    if (appLocale !== 'en') candidates.push('en');
    candidates.push('default');

    for (const locale of candidates) {
      if (localeLabels[locale]) {
        return this._fixGarbledUtf8(localeLabels[locale]);
      }
    }

    return this._fixGarbledUtf8(defaultLabel);
  }

  /**
   * UTF-8 乱码修复: latin1 误编码的字符串重解码为 UTF-8
   * 检测条件: 解码后含 garbled pattern (连续高位字节) + CJK 字符
   * @param {string} str
   * @returns {string}
   */
  _fixGarbledUtf8(str) {
    if (!str) return str;

    try {
      const buf = Buffer.from(str, 'latin1');
      const decoded = buf.toString('utf8');

      const garbledPattern = /[\u00c0-\u00df][\u0080-\u00bf]|[\u00e0-\u00ef][\u0080-\u00bf]{2}|[\u00f0-\u00f7][\u0080-\u00bf]{3}/;
      if (garbledPattern.test(decoded) && /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(decoded)) {
        return decoded;
      }

      if (garbledPattern.test(str)) {
        return decoded;
      }
    } catch {
      return str;
    }

    return str;
  }
}

module.exports = LocaleLabelResolver;

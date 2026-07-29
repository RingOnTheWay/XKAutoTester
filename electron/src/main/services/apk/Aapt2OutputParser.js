/**
 * Aapt2OutputParser - aapt2 dump badging 输出解析器
 *
 * 设计:
 * - 纯函数, 无外部依赖 (不依赖 i18n/fs/spawn)
 * - 输入: aapt2 dump badging 的 stdout 字符串
 * - 输出: 结构化对象 { packageName, activityName, versionName, versionCode,
 *                    applicationLabel, permissions[], features[], localeLabels{} }
 * - localeLabels 字段暴露给 LocaleLabelResolver, 由其决定最终 applicationLabel
 */
class Aapt2OutputParser {
  /**
   * 解析 aapt2 dump badging 输出
   * @param {string} output - aapt2 stdout
   * @returns {object} 结构化解析结果
   */
  parse(output) {
    const result = {
      packageName: '',
      activityName: '',
      versionName: '',
      versionCode: '',
      applicationLabel: '',
      permissions: [],
      features: [],
      localeLabels: {},
    };

    const lines = (output || '').split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('package:')) {
        const packageMatch = trimmedLine.match(/package:\s*name='([^']+)'/);
        if (packageMatch) {
          result.packageName = packageMatch[1];
        }

        const versionCodeMatch = trimmedLine.match(/versionCode='([^']+)'/);
        if (versionCodeMatch) {
          result.versionCode = versionCodeMatch[1];
        }

        const versionNameMatch = trimmedLine.match(/versionName='([^']+)'/);
        if (versionNameMatch) {
          result.versionName = versionNameMatch[1];
        }
      }

      if (trimmedLine.startsWith('launchable-activity:')) {
        const activityMatch = trimmedLine.match(/launchable-activity:\s*name='([^']+)'/);
        if (activityMatch) {
          result.activityName = activityMatch[1];
        }
      }

      if (trimmedLine.startsWith('application:')) {
        const labelMatch = trimmedLine.match(/application:\s*label='([^']+)'/);
        if (labelMatch) {
          result.applicationLabel = labelMatch[1];
        }
      }

      if (trimmedLine.startsWith('application-label:')) {
        const defaultLabelMatch = trimmedLine.match(/^application-label:\s*'(.*)'/);
        if (defaultLabelMatch) {
          result.localeLabels.default = defaultLabelMatch[1];
        }
      }

      const localeLabelMatch = trimmedLine.match(/^application-label-([a-zA-Z]{2,3}(?:-[a-zA-Z]{2,3}(?:-[a-zA-Z]{2})?)?):\s*'(.*)'/);
      if (localeLabelMatch) {
        const locale = localeLabelMatch[1];
        const label = localeLabelMatch[2];
        result.localeLabels[locale] = label;
      }

      if (trimmedLine.startsWith('uses-permission:')) {
        const permMatch = trimmedLine.match(/uses-permission:\s*name='([^']+)'/);
        if (permMatch) {
          result.permissions.push(permMatch[1]);
        }
      }

      if (trimmedLine.startsWith('uses-feature:') || trimmedLine.startsWith('uses-implied-feature:')) {
        const featureMatch = trimmedLine.match(/uses-(?:implied-)?feature:\s*name='([^']+)'/);
        if (featureMatch) {
          result.features.push(featureMatch[1]);
        }
      }
    }

    return result;
  }
}

module.exports = Aapt2OutputParser;

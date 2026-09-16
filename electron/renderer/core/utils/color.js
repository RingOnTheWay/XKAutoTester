/**
 * 颜色工具 - 主题色派生 (hex ↔ rgb / 加深 / 提亮)
 *
 * R26 架构深化 (候选②④): 原挂在 SettingsModel 上的静态方法迁至 core/utils ——
 * 颜色数学是显示层关注, view 直接引工具, 不再经 model 转手 (切断 view→model 依赖)。
 */

/** '#RRGGBB' → {r,g,b}; 非法输入返回 null */
export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/** rgb → '#rrggbb' */
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** 加深: 每通道乘 (1-amount); 非法 hex 原样返回 */
export function darkenColor(hex, amount = 0.2) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    Math.max(0, Math.round(rgb.r * (1 - amount))),
    Math.max(0, Math.round(rgb.g * (1 - amount))),
    Math.max(0, Math.round(rgb.b * (1 - amount)))
  );
}

/** 提亮: 每通道向 255 插值 amount; 非法 hex 原样返回 */
export function lightenColor(hex, amount = 0.2) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    Math.min(255, Math.round(rgb.r + (255 - rgb.r) * amount)),
    Math.min(255, Math.round(rgb.g + (255 - rgb.g) * amount)),
    Math.min(255, Math.round(rgb.b + (255 - rgb.b) * amount))
  );
}

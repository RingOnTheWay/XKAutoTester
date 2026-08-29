// lucide 图标数据已内联为静态模块 (lucide-icons-data.js),
// 避免 renderer 在 npm start (loadFile 直载源码) 下解析裸 import "lucide" 报错;
// 同时也是 npm run dev 与 Vite 打包。图标来自 lucide v1.8.0。
import { lucideIcons } from './lucide-icons-data.js';

export const ICON_MAPPING = {
  play_circle: 'CirclePlay',
  devices: 'Smartphone',
  settings: 'Settings',
  folder_open: 'FolderOpen',
  assignment: 'ClipboardList',
  apps: 'LayoutGrid',
  web: 'Globe',
  widgets: 'Blocks',
  add: 'Plus',
  edit: 'SquarePen',
  delete: 'Trash2',
  info: 'Info',
  warning: 'TriangleAlert',
  category: 'Boxes',
  terminal: 'Terminal',
  clear_all: 'X',
  play_arrow: 'Play',
  stop: 'Square',
  assessment: 'ChartBar',
  power_settings_new: 'Power',
  devices_other: 'TabletSmartphone',
  smartphone: 'Smartphone',
  tune: 'SlidersHorizontal',
  folder: 'Folder',
  arrow_back: 'ArrowLeft',
  refresh: 'RefreshCw',
  upload_file: 'Upload',
  download_file: 'Download',
  location_on: 'MapPin',
  download: 'Download',
  copyright: 'Copyright',
  language: 'Languages',
  visibility: 'Eye',
  visibility_off: 'EyeOff',
  close: 'X',
  check: 'Check',
  error: 'CircleAlert',
  palette: 'Palette',
  dark_mode: 'Moon',
  color_lens: 'Paintbrush',
  code: 'Code',
  build: 'Wrench',
  description: 'FileText',
  more_vert: 'EllipsisVertical',
  check_circle: 'CircleCheck',
  cancel: 'CircleX',
  history: 'History',
  sync: 'RefreshCw',
  keyboard_arrow_right: 'ChevronRight',
  keyboard_arrow_left: 'ChevronLeft',
  clear: 'X',
  device_hub: 'Network',
  wifi: 'Wifi',
  usb: 'Usb',
  storage: 'Database',
  delete_sweep: 'Trash',
  schedule: 'Clock',
  access_time: 'Clock',
  repeat: 'Repeat',
  notifications: 'Bell',
  platform: 'MessageSquare',
  access_token: 'KeyRound',
  secret: 'Lock',
  bluetooth: 'Bluetooth',
  list_alt: 'List',
  add_circle_outline: 'CirclePlus',
  expand_more: 'ChevronDown',
  expand_less: 'ChevronUp',
  content_copy: 'Copy',
  drag_indicator: 'GripVertical',
  touch_app: 'Hand',
  pageview: 'Search',
  cable: 'Cable',
  system_update: 'RefreshCw',
  apk_file: 'FileCode',
  android: 'Smartphone',
  restore: 'RotateCcw',
  prevent_sleep: 'Eye',
  scan: 'ScanSearch',
  arrow_upward: 'ChevronUp',
  arrow_downward: 'ChevronDown',
  search: 'Search',
  alert_triangle: 'TriangleAlert',
  search_x: 'SearchX',
  external_link: 'ExternalLink',
};

export function lucideToSvg(iconData) {
  if (!iconData) return '';
  const attrs = {
    xmlns: 'http://www.w3.org/2000/svg',
    width: '24',
    height: '24',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  };
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');

  function renderNode(node) {
    const [tag, nodeAttrs, children] = node;
    const nodeAttrStr = Object.entries(nodeAttrs)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');
    if (children && children.length > 0) {
      return `<${tag} ${nodeAttrStr}>${children.map(renderNode).join('')}</${tag}>`;
    }
    return `<${tag} ${nodeAttrStr}/>`;
  }

  const inner = iconData.map(renderNode).join('');
  return `<svg ${attrStr}>${inner}</svg>`;
}

export const Icons = {};

Object.entries(ICON_MAPPING).forEach(([oldName, lucideName]) => {
  const iconData = lucideIcons[lucideName];
  if (iconData) {
    Icons[oldName] = lucideToSvg(iconData);
  } else {
    console.warn(`Lucide icon "${lucideName}" not found for mapping "${oldName}"`);
  }
});

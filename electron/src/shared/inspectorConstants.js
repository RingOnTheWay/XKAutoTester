// Inspector 协议常量镜像。SSOT: electron/src/shared/inspector-protocol.json
// 改命令名/帧类型/notification 类型时,同步改此文件 + inspector-protocol.json + Python inspector_constants.py

/** @typedef {'start-session'|'get-screenshot'|'get-source'|'find-locators'|'refresh'|'stop-session'} InspectorCommand */

const INSPECTOR_COMMANDS = Object.freeze([
  'start-session',
  'get-screenshot',
  'get-source',
  'find-locators',
  'refresh',
  'stop-session',
]);

const NOTIFICATION_TYPES = Object.freeze(['ready', 'progress']);

const FRAME_KINDS = Object.freeze(['request', 'response', 'notification']);

module.exports = {
  INSPECTOR_COMMANDS,
  NOTIFICATION_TYPES,
  FRAME_KINDS,
};

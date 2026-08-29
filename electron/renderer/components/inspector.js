import { SessionLifecycleMixin } from './mixins/SessionLifecycleMixin.js';
import { CanvasMixin } from './mixins/CanvasMixin.js';
import { TreeMixin } from './mixins/TreeMixin.js';
import { HighlighterMixin } from './mixins/HighlighterMixin.js';
import { LocatorMixin } from './mixins/LocatorMixin.js';
import { LoadingMixin } from './mixins/LoadingMixin.js';

export class InspectorModal {
  // ---- 字段（原 #xxx 私有字段，提取 mixin 后改为公开 _xxx 以便 mixin 方法访问）----
  _screenshotImage = null;
  _elementsTree = [];
  _selectedElement = null;
  _hoveredElement = null;
  _selectedLocator = null;
  _canvasScale = 1;
  _deviceResolution = null;
  _escHandler = null;
  _allElements = [];
  _scaleRatio = 1;
  _loadingStepIndex = 0;
  _loadingTimer = null;
  _sessionParams = null;
  _refreshing = false;
  _stepGeneration = 0;
  _progressUnsubscribe = null;
  _overlay = null;
  _canvas = null;
  _highlighterElements = [];
  _highlighterContainer = null;
  _canvasContainer = null;
  _treeContainer = null;
  _treeSearch = null;
  _loadingEl = null;
  _locatorList = null;
  _refreshBtn = null;
  _confirmBtn = null;
  _cancelBtn = null;
  _closeBtn = null;
  _searchTimer = null;
  _searchResults = [];
  _searchResultIndex = -1;
  _highlighterClickHandler = null;
  _highlighterMoveHandler = null;
  _highlighterLeaveHandler = null;
  _resizeObserver = null;
  _stepQueue = [];
  _stepProcessing = false;
  _lastStepTime = 0;

  constructor() {
    this.init();
  }
}

// 通过 Object.assign 把各 mixin 的方法挂到原型上，实现按域拆分
Object.assign(
  InspectorModal.prototype,
  SessionLifecycleMixin,
  CanvasMixin,
  TreeMixin,
  HighlighterMixin,
  LocatorMixin,
  LoadingMixin
);

/**
 * DateTimePicker - 日期时间选择器组件
 * Promise-free，构造时绑定 input 元素，focus/click 触发显示
 * 通过 options.mountContainer 指定 overlay 挂载点（保持 z-index 层叠）
 */
export class DateTimePicker {
  // ---- 私有状态 ----
  #overlay = null;
  #currentInput = null;
  #year = new Date().getFullYear();
  #month = new Date().getMonth() + 1;
  #day = new Date().getDate();
  #selectedYear = new Date().getFullYear();
  #selectedMonth = new Date().getMonth() + 1;
  #hour = new Date().getHours();
  #minute = new Date().getMinutes();
  #mountContainer = null;
  #inputElement = null;

  /**
   * @param {HTMLInputElement} inputElement 绑定的输入框
   * @param {{ mountContainer?: HTMLElement }} options
   */
  constructor(inputElement, options = {}) {
    if (!inputElement) return;
    this.#inputElement = inputElement;
    this.#mountContainer = options.mountContainer || document.body;

    // 防止重复绑定
    if (inputElement.dataset.pickerInitialized) return;
    inputElement.dataset.pickerInitialized = 'true';
    inputElement.setAttribute('readonly', true);
    inputElement.addEventListener('focus', (e) => {
      e.preventDefault();
      this.show();
    });
    inputElement.addEventListener('click', () => {
      this.show();
    });
  }

  // ==================== 公开 API ====================

  show() {
    if (!this.#inputElement) return;
    const overlay = this.#createOverlay();
    this.#currentInput = this.#inputElement;

    // 解析已有值
    if (this.#inputElement.value) {
      const parsed = DateTimePicker.parseDateTimeString(this.#inputElement.value);
      if (parsed) {
        this.#year = parsed.year;
        this.#month = parsed.month;
        this.#day = parsed.day;
        this.#selectedYear = parsed.year;
        this.#selectedMonth = parsed.month;
        this.#hour = parsed.hour;
        this.#minute = parsed.minute;
      }
    } else {
      const now = new Date();
      this.#year = now.getFullYear();
      this.#month = now.getMonth() + 1;
      this.#day = now.getDate();
      this.#selectedYear = now.getFullYear();
      this.#selectedMonth = now.getMonth() + 1;
      this.#hour = now.getHours();
      this.#minute = now.getMinutes();
    }

    this.#render();
    overlay.classList.remove('hidden');
  }

  hide() {
    if (this.#overlay) {
      this.#overlay.classList.add('hidden');
    }
    this.#currentInput = null;
  }

  // ==================== 内部方法 ====================

  #createOverlay() {
    // 如果已存在则复用
    const existing = document.getElementById('datetime-picker-overlay');
    if (existing) {
      this.#overlay = existing;
      return existing;
    }

    const overlay = document.createElement('div');
    overlay.id = 'datetime-picker-overlay';
    overlay.className = 'datetime-picker-overlay hidden';
    overlay.innerHTML = `
          <div class="datetime-picker-panel">
            <div class="datetime-picker-header">
              <button type="button" class="datetime-picker-nav prev-month" data-action="prev-month">
                <span class="svg-icon" data-icon="keyboard_arrow_left"></span>
              </button>
              <div class="datetime-picker-title">
                <span class="picker-year"></span>
                <span class="picker-month"></span>
              </div>
              <button type="button" class="datetime-picker-nav next-month" data-action="next-month">
                <span class="svg-icon" data-icon="keyboard_arrow_right"></span>
              </button>
            </div>
            <div class="datetime-picker-body">
              <div class="datetime-picker-weekdays">
                <span>${window.i18n.t('datetime.sun') || '日'}</span>
                <span>${window.i18n.t('datetime.mon') || '一'}</span>
                <span>${window.i18n.t('datetime.tue') || '二'}</span>
                <span>${window.i18n.t('datetime.wed') || '三'}</span>
                <span>${window.i18n.t('datetime.thu') || '四'}</span>
                <span>${window.i18n.t('datetime.fri') || '五'}</span>
                <span>${window.i18n.t('datetime.sat') || '六'}</span>
              </div>
              <div class="datetime-picker-days"></div>
            </div>
            <div class="datetime-picker-time">
              <div class="time-input-group">
                <label>${window.i18n.t('datetime.hour') || '时'}</label>
                <input type="number" class="time-input hour-input" min="0" max="23" value="00">
              </div>
              <span class="time-separator">:</span>
              <div class="time-input-group">
                <label>${window.i18n.t('datetime.minute') || '分'}</label>
                <input type="number" class="time-input minute-input" min="0" max="59" value="00">
              </div>
            </div>
            <div class="datetime-picker-footer">
              <button type="button" class="datetime-picker-btn cancel-btn">${window.i18n.t('modal.cancel') || '取消'}</button>
              <button type="button" class="datetime-picker-btn confirm-btn">${window.i18n.t('modal.confirm') || '确定'}</button>
            </div>
          </div>
        `;

    // 挂载到指定容器（保持 z-index 层叠）
    this.#mountContainer.appendChild(overlay);
    this.#overlay = overlay;

    // 绑定导航按钮
    overlay.querySelector('.prev-month').addEventListener('click', () => this.#navigate('month', -1));
    overlay.querySelector('.next-month').addEventListener('click', () => this.#navigate('month', 1));

    // 取消/确认按钮
    overlay.querySelector('.cancel-btn').addEventListener('click', () => this.hide());
    overlay.querySelector('.confirm-btn').addEventListener('click', () => this.#confirm());

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.hide();
    });

    // 时间输入校验
    const hourInput = overlay.querySelector('.hour-input');
    const minuteInput = overlay.querySelector('.minute-input');

    hourInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/[^0-9]/g, '');
      if (value.length > 2) value = value.slice(0, 2);
      const numValue = parseInt(value) || 0;
      if (numValue > 23) value = '23';
      e.target.value = value;
    });
    hourInput.addEventListener('blur', (e) => {
      let value = e.target.value;
      const numValue = parseInt(value) || 0;
      if (numValue < 0 || isNaN(numValue)) value = '00';
      else if (numValue > 23) value = '23';
      else value = String(numValue).padStart(2, '0');
      e.target.value = value;
    });

    minuteInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/[^0-9]/g, '');
      if (value.length > 2) value = value.slice(0, 2);
      const numValue = parseInt(value) || 0;
      if (numValue > 59) value = '59';
      e.target.value = value;
    });
    minuteInput.addEventListener('blur', (e) => {
      let value = e.target.value;
      const numValue = parseInt(value) || 0;
      if (numValue < 0 || isNaN(numValue)) value = '00';
      else if (numValue > 59) value = '59';
      else value = String(numValue).padStart(2, '0');
      e.target.value = value;
    });

    // 初始化图标
    this.#initIcons(overlay);

    return overlay;
  }

  #initIcons(overlay) {
    const iconElements = overlay.querySelectorAll('.svg-icon[data-icon]');
    iconElements.forEach((element) => {
      const iconName = element.getAttribute('data-icon');
      const iconHtml = window.__XKAT_APP__?.getIconHtml?.(iconName);
      if (iconHtml) element.innerHTML = iconHtml;
    });
  }

  #navigate(unit, direction) {
    if (unit === 'month') {
      this.#month += direction;
      if (this.#month > 12) {
        this.#month = 1;
        this.#year++;
      } else if (this.#month < 1) {
        this.#month = 12;
        this.#year--;
      }
    } else if (unit === 'year') {
      this.#year += direction;
    }
    this.#render();
  }

  #render() {
    const overlay = this.#overlay;
    if (!overlay) return;

    const yearSpan = overlay.querySelector('.picker-year');
    const monthSpan = overlay.querySelector('.picker-month');
    if (yearSpan) yearSpan.textContent = `${this.#year}${window.i18n.t('datetime.yearSuffix')}`;
    if (monthSpan) monthSpan.textContent = `${this.#month}${window.i18n.t('datetime.monthSuffix')}`;

    const daysContainer = overlay.querySelector('.datetime-picker-days');
    if (!daysContainer) return;
    daysContainer.innerHTML = '';

    const year = this.#year;
    const month = this.#month;
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();

    // 填充空白
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'datetime-picker-day empty';
      daysContainer.appendChild(empty);
    }

    // 填充日期
    for (let d = 1; d <= daysInMonth; d++) {
      const dayEl = document.createElement('div');
      dayEl.className = 'datetime-picker-day';
      dayEl.textContent = d;

      // 今天
      if (year === today.getFullYear() && month === today.getMonth() + 1 && d === today.getDate()) {
        dayEl.classList.add('today');
      }

      // 已选中（仅在当月且用户已选择的日期才显示选中状态）
      if (d === this.#day && this.#selectedYear === year && this.#selectedMonth === month) {
        dayEl.classList.add('selected');
      }

      dayEl.addEventListener('click', () => {
        this.#day = d;
        this.#selectedYear = year;
        this.#selectedMonth = month;
        this.#render();
      });

      daysContainer.appendChild(dayEl);
    }

    // 更新时间输入
    const hourInput = overlay.querySelector('.hour-input');
    const minuteInput = overlay.querySelector('.minute-input');
    if (hourInput) hourInput.value = String(this.#hour).padStart(2, '0');
    if (minuteInput) minuteInput.value = String(this.#minute).padStart(2, '0');
  }

  #confirm() {
    const overlay = this.#overlay;

    // 从时间输入框读取最新值
    const hourInput = overlay?.querySelector('.hour-input');
    const minuteInput = overlay?.querySelector('.minute-input');
    if (hourInput) this.#hour = Math.min(23, Math.max(0, parseInt(hourInput.value) || 0));
    if (minuteInput) this.#minute = Math.min(59, Math.max(0, parseInt(minuteInput.value) || 0));

    if (this.#currentInput) {
      const pad = (n) => String(n).padStart(2, '0');
      this.#currentInput.value = `${this.#year}-${pad(this.#month)}-${pad(this.#day)} ${pad(this.#hour)}:${pad(this.#minute)}`;
    }
    this.hide();
  }

  // ==================== 静态方法 ====================

  /**
   * 解析 "YYYY-MM-DD HH:mm" 格式字符串
   */
  static parseDateTimeString(str) {
    if (!str) return null;
    const match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})$/);
    if (!match) return null;
    return {
      year: parseInt(match[1]),
      month: parseInt(match[2]),
      day: parseInt(match[3]),
      hour: parseInt(match[4]),
      minute: parseInt(match[5]),
    };
  }
}

export default DateTimePicker;

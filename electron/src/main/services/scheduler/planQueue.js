// ScheduledPlanQueue — min-heap 纯数据结构。
//
// compare 注入 (默认 compareByScheduledTime) 解 L89 字段硬绑。
// 0 副作用, 可独立单测。对称 adb/subprocess_adb_adapter.py (纯 IO 适配)。

function compareByScheduledTime(a, b) {
  return new Date(a.scheduledTime) - new Date(b.scheduledTime);
}

class ScheduledPlanQueue {
  constructor({ compare = compareByScheduledTime } = {}) {
    this.heap = [];
    this._compare = compare;
  }

  enqueue(plan) {
    this.heap.push(plan);
    this._bubbleUp(this.heap.length - 1);
  }

  dequeue() {
    if (this.heap.length === 0) return null;
    const min = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._bubbleDown(0);
    }
    return min;
  }

  peek() {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  remove(planId) {
    const index = this.heap.findIndex((p) => p.id === planId);
    if (index !== -1) {
      this.heap.splice(index, 1);
      this.rebuild();
      return true;
    }
    return false;
  }

  rebuild() {
    const plans = [...this.heap];
    this.heap = [];
    plans.forEach((p) => this.enqueue(p));
  }

  size() {
    return this.heap.length;
  }

  getAll() {
    return [...this.heap];
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this._compare(this.heap[index], this.heap[parentIndex]) < 0) {
        [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  _bubbleDown(index) {
    const length = this.heap.length;
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < length && this._compare(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this._compare(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }

      if (smallest !== index) {
        [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
        index = smallest;
      } else {
        break;
      }
    }
  }
}

module.exports = { ScheduledPlanQueue, compareByScheduledTime };

// JSON 文件存储实现（桌面端默认）
// 与 Redis 命令接口一一对应，数据文件即「同步快照」，支持导出/导入。
// 可靠性：原子写（临时文件 + rename）+ 每次保存保留 .bak + 导入前自动备份。

const fs = require('fs');
const path = require('path');

const SAVE_DEBOUNCE_MS = 300;

function defaultData() {
  return { version: 1, data: {} };
}

class JsonFileStore {
  constructor(filePath) {
    this.path = filePath;
    this.data = defaultData();
    this.dirty = false;
    this._saveTimer = null;
    this._load();
  }

  _load() {
    if (this.path && fs.existsSync(this.path)) {
      try {
        const raw = fs.readFileSync(this.path, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.data) {
          this.data = parsed;
          return;
        }
      } catch (err) {
        console.error('[JsonFileStore] 数据文件解析失败，尝试读取备份:', err.message);
        if (fs.existsSync(`${this.path}.bak`)) {
          try {
            const raw = fs.readFileSync(`${this.path}.bak`, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && parsed.data) {
              this.data = parsed;
              console.log('[JsonFileStore] 已从 .bak 备份恢复');
              return;
            }
          } catch (e2) {
            console.error('[JsonFileStore] 备份恢复失败:', e2.message);
          }
        }
      }
    }
    this.data = defaultData();
  }

  _ensureDir() {
    const dir = path.dirname(this.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // 原子写：先写临时文件，再 rename 覆盖；写前保留一份 .bak
  _saveSync() {
    if (!this.path || !this.dirty) return;
    try {
      this._ensureDir();
      const json = JSON.stringify(this.data, null, 2);
      const tmpPath = `${this.path}.tmp`;
      fs.writeFileSync(tmpPath, json, 'utf8');
      if (fs.existsSync(this.path)) {
        try {
          fs.copyFileSync(this.path, `${this.path}.bak`);
        } catch (e) {
          // 备份失败不阻塞主流程
        }
      }
      fs.renameSync(tmpPath, this.path);
      this.dirty = false;
    } catch (err) {
      console.error('[JsonFileStore] 保存失败:', err.message);
    }
  }

  _markDirty() {
    this.dirty = true;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._saveSync(), SAVE_DEBOUNCE_MS);
    if (this._saveTimer.unref) this._saveTimer.unref();
  }

  // 立即落盘（App 退出前调用）
  flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._saveSync();
  }

  // ---------- Hash ----------
  async hget(key, field) {
    const h = this.data.data[key];
    if (!h || h.t !== 'hash') return null;
    return h.f[field] !== undefined ? h.f[field] : null;
  }

  async hset(key, field, value) {
    if (!this.data.data[key]) {
      this.data.data[key] = { t: 'hash', f: {} };
    }
    const h = this.data.data[key];
    if (h.t !== 'hash') h.t = 'hash';
    if (!h.f) h.f = {};
    if (typeof field === 'object' && field !== null) {
      for (const [k, v] of Object.entries(field)) {
        h.f[k] = String(v);
      }
    } else {
      h.f[field] = String(value);
    }
    this._markDirty();
    return true;
  }

  async hgetall(key) {
    const h = this.data.data[key];
    if (!h || h.t !== 'hash' || !h.f) return {};
    return { ...h.f };
  }

  async hincrby(key, field, increment) {
    const current = parseInt(await this.hget(key, field)) || 0;
    const newValue = current + increment;
    await this.hset(key, field, newValue.toString());
    return newValue;
  }

  // ---------- Set ----------
  async sadd(key, member) {
    if (!this.data.data[key]) {
      this.data.data[key] = { t: 'set', m: [] };
    }
    const s = this.data.data[key];
    if (!s.m) s.m = [];
    if (!s.m.includes(member)) {
      s.m.push(member);
      this._markDirty();
    }
    return true;
  }

  async smembers(key) {
    const s = this.data.data[key];
    if (!s || s.t !== 'set' || !s.m) return [];
    return [...s.m];
  }

  async srem(key, member) {
    const s = this.data.data[key];
    if (!s || s.t !== 'set' || !s.m) return false;
    const idx = s.m.indexOf(member);
    if (idx === -1) return false;
    s.m.splice(idx, 1);
    this._markDirty();
    return true;
  }

  // ---------- Sorted Set ----------
  async zadd(key, score, member) {
    if (!this.data.data[key]) {
      this.data.data[key] = { t: 'zset', z: [] };
    }
    const z = this.data.data[key];
    if (!z.z) z.z = [];
    const idx = z.z.findIndex(item => item[1] === member);
    if (idx !== -1) z.z.splice(idx, 1);
    z.z.push([score, member]);
    z.z.sort((a, b) => a[0] - b[0]);
    this._markDirty();
    return true;
  }

  _zslice(items, start, stop) {
    const end = stop === -1 ? items.length : stop + 1;
    return items.slice(start, end);
  }

  async zrange(key, start, stop) {
    const z = this.data.data[key];
    if (!z || z.t !== 'zset' || !z.z) return [];
    return this._zslice(z.z, start, stop).map(item => item[1]);
  }

  async zrevrange(key, start, stop) {
    const z = this.data.data[key];
    if (!z || z.t !== 'zset' || !z.z) return [];
    const reversed = [...z.z].reverse();
    return this._zslice(reversed, start, stop).map(item => item[1]);
  }

  async zrem(key, member) {
    const z = this.data.data[key];
    if (!z || z.t !== 'zset' || !z.z) return false;
    const idx = z.z.findIndex(item => item[1] === member);
    if (idx === -1) return false;
    z.z.splice(idx, 1);
    this._markDirty();
    return true;
  }

  // ---------- List ----------
  async lpush(key, value) {
    if (!this.data.data[key]) {
      this.data.data[key] = { t: 'list', l: [] };
    }
    const list = this.data.data[key];
    if (!list.l) list.l = [];
    list.l.unshift(value);
    this._markDirty();
    return true;
  }

  async lrange(key, start, stop) {
    const list = this.data.data[key];
    if (!list || list.t !== 'list' || !list.l) return [];
    const end = stop === -1 ? list.length : stop + 1;
    return list.l.slice(start, end);
  }

  // ---------- Key ----------
  async del(key) {
    if (this.data.data[key]) {
      delete this.data.data[key];
      this._markDirty();
      return true;
    }
    return false;
  }

  // ---------- 同步快照 ----------
  // 返回整个数据区（可直接落盘为快照 JSON）
  exportSnapshot() {
    return { version: 1, data: this.data.data };
  }

  // 覆盖式导入：先备份当前文件，再整体替换
  async importSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || !snapshot.data) {
      throw new Error('快照格式不正确');
    }
    // 导入前备份
    try {
      this._ensureDir();
      if (fs.existsSync(this.path)) {
        const backupPath = `${this.path}.pre-import-${Date.now()}.json`;
        fs.copyFileSync(this.path, backupPath);
      }
    } catch (err) {
      console.error('[JsonFileStore] 导入前备份失败:', err.message);
    }
    this.data = { version: 1, data: snapshot.data };
    this.dirty = true;
    this._saveSync();
    return { imported: Object.keys(this.data.data).length };
  }

  // ---------- 同步辅助 ----------
  async keys(pattern) {
    const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    return Object.keys(this.data.data).filter(k => re.test(k));
  }

  async type(key) {
    const item = this.data.data[key];
    if (!item) return 'none';
    return item.t;
  }

  async zrangeWithScores(key, start, stop) {
    const z = this.data.data[key];
    if (!z || z.t !== 'zset' || !z.z) return [];
    return this._zslice(z.z, start, stop).map(([score, member]) => ({ score, member }));
  }
}

module.exports = JsonFileStore;

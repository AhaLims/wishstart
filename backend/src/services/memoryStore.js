// 内存存储实现（用于开发环境）
// 当Redis不可用时，可以使用这个简单的内存存储

class MemoryStore {
  constructor() {
    this.data = new Map();
  }

  // Hash 操作
  async hset(key, field, value) {
    if (!this.data.has(key)) {
      this.data.set(key, new Map());
    }
    const hash = this.data.get(key);
    if (typeof field === 'object') {
      // 批量设置
      for (const [k, v] of Object.entries(field)) {
        hash.set(k, v);
      }
    } else {
      hash.set(field, value);
    }
    return true;
  }

  async hget(key, field) {
    if (!this.data.has(key)) return null;
    return this.data.get(key).get(field);
  }

  async hgetall(key) {
    if (!this.data.has(key)) return {};
    const obj = {};
    for (const [k, v] of this.data.get(key)) {
      obj[k] = v;
    }
    return obj;
  }

  async hincrby(key, field, increment) {
    const current = await this.hget(key, field) || '0';
    const newValue = parseInt(current) + increment;
    await this.hset(key, field, newValue.toString());
    return newValue;
  }

  // Set 操作
  async sadd(key, member) {
    if (!this.data.has(key)) {
      this.data.set(key, new Set());
    }
    this.data.get(key).add(member);
    return true;
  }

  async smembers(key) {
    if (!this.data.has(key)) return [];
    return Array.from(this.data.get(key));
  }

  async srem(key, member) {
    if (!this.data.has(key)) return false;
    return this.data.get(key).delete(member);
  }

  // Sorted Set 操作
  async zadd(key, score, member) {
    if (!this.data.has(key)) {
      this.data.set(key, []);
    }
    const list = this.data.get(key);
    // 移除已存在的相同成员
    const existingIndex = list.findIndex(item => item.member === member);
    if (existingIndex !== -1) {
      list.splice(existingIndex, 1);
    }
    list.push({ score, member });
    // 按分数排序
    list.sort((a, b) => b.score - a.score);
    return true;
  }

  async zrangeWithScores(key, start, stop) {
    if (!this.data.has(key)) return [];
    const list = this.data.get(key);
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end).map(item => ({ score: item.score, member: item.member }));
  }

  async zrange(key, start, stop) {
    if (!this.data.has(key)) return [];
    const list = this.data.get(key);
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end).map(item => item.member);
  }

  async zrevrange(key, start, stop) {
    if (!this.data.has(key)) return [];
    const list = this.data.get(key).slice().reverse();
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end).map(item => item.member);
  }

  // List 操作
  async lpush(key, value) {
    if (!this.data.has(key)) {
      this.data.set(key, []);
    }
    this.data.get(key).unshift(value);
    return true;
  }

  async lrange(key, start, stop) {
    if (!this.data.has(key)) return [];
    const list = this.data.get(key);
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  }

  // Key 操作
  async del(key) {
    return this.data.delete(key);
  }

  // 清理所有数据（仅用于测试）
  clear() {
    this.data.clear();
  }

  // 同步辅助（开发环境）
  async keys(pattern) {
    const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    return Array.from(this.data.keys()).filter(k => re.test(k));
  }

  async type(key) {
    if (!this.data.has(key)) return 'none';
    const value = this.data.get(key);
    if (value instanceof Map) return 'hash';
    if (value instanceof Set) return 'set';
    if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === 'object' && 'member' in value[0]) return 'zset';
      return 'list';
    }
    return 'string';
  }
}

module.exports = new MemoryStore();

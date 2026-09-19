// 双端同步：统一 JSON 快照 导出/导入（覆盖式 + 导入前自动备份）
const express = require('express');
const router = express.Router();

// 导出全量快照
router.get('/export', async (req, res) => {
  try {
    const store = req.redis;

    // JSON 文件存储原生导出（原子、含格式）
    if (typeof store.exportSnapshot === 'function') {
      return res.json({ code: 0, data: store.exportSnapshot() });
    }

    // Redis / Memory：按类型遍历导出
    const keys = await store.keys('wishstar:*');
    const data = {};
    for (const key of keys) {
      const t = await store.type(key);
      if (t === 'hash') {
        data[key] = { t: 'hash', f: await store.hgetall(key) };
      } else if (t === 'set') {
        data[key] = { t: 'set', m: await store.smembers(key) };
      } else if (t === 'zset') {
        const items = await store.zrangeWithScores ? await store.zrangeWithScores(key, 0, -1) : [];
        data[key] = { t: 'zset', z: items.map(item => [item.score, item.member]) };
      } else if (t === 'list') {
        data[key] = { t: 'list', l: await store.lrange(key, 0, -1) };
      }
    }
    res.json({ code: 0, data: { version: 1, data } });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 导入快照（覆盖式）
router.post('/import', async (req, res) => {
  try {
    const { snapshot } = req.body;
    if (!snapshot || typeof snapshot !== 'object' || !snapshot.data) {
      return res.status(400).json({ code: 1, message: '快照格式不正确' });
    }
    const store = req.redis;

    if (typeof store.importSnapshot === 'function') {
      const result = await store.importSnapshot(snapshot);
      return res.json({ code: 0, data: result });
    }

    // 通用导入（Redis / Memory）：逐键覆盖
    let imported = 0;
    for (const [key, item] of Object.entries(snapshot.data)) {
      await store.del(key);
      if (item.t === 'hash') {
        await store.hset(key, item.f || {});
      } else if (item.t === 'set') {
        for (const member of item.m || []) await store.sadd(key, member);
      } else if (item.t === 'zset') {
        for (const [score, member] of item.z || []) await store.zadd(key, score, member);
      } else if (item.t === 'list') {
        // lpush 在头部插入，倒序回放保持原顺序
        for (const value of [...(item.l || [])].reverse()) await store.lpush(key, value);
      }
      imported++;
    }
    res.json({ code: 0, data: { imported } });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;

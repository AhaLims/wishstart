// 双端同步：统一 JSON 快照 导出/导入（覆盖式 + 导入前自动备份）
//
// 愿望配图是磁盘文件，不在键值快照里，所以导出时会把被引用到的图片
// 一并内嵌成 base64（blobs 字段），导入时先写回磁盘再导入数据，
// 这样换台机器导入后配图不会变成空链接。
const express = require('express');
const router = express.Router();
const {
  collectReferencedFilenames,
  readImageBase64,
  writeImageBase64
} = require('../services/wishImage');

// 配图总量上限，防止快照大到前端处理不动
const MAX_BLOB_BYTES = 40 * 1024 * 1024;

// 导出全量快照
router.get('/export', async (req, res) => {
  try {
    const store = req.redis;
    let snapshot;

    // JSON 文件存储原生导出（原子、含格式）
    if (typeof store.exportSnapshot === 'function') {
      snapshot = store.exportSnapshot();
    } else {
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
      snapshot = { version: 1, data };
    }

    // 把被愿望引用到的图片内嵌进来（不带上没人用的孤儿文件）
    const blobs = {};
    let blobBytes = 0;
    let missingImages = 0;

    for (const filename of collectReferencedFilenames(snapshot)) {
      const base64 = readImageBase64(filename);
      if (!base64) {
        missingImages++;   // 数据里写了但文件已经不在，导入端会显示为空
        continue;
      }
      blobBytes += base64.length;
      if (blobBytes > MAX_BLOB_BYTES) {
        return res.json({
          code: 1,
          message: `配图总量超过 ${Math.round(MAX_BLOB_BYTES / 1024 / 1024)}MB，快照会大到无法处理。请先删掉一些愿望配图再导出。`
        });
      }
      blobs[filename] = base64;
    }

    res.json({
      code: 0,
      data: {
        ...snapshot,
        version: 2,          // 2 = 带 blobs 字段（旧版导入端会忽略它）
        blobs,
        imageCount: Object.keys(blobs).length,
        missingImages
      }
    });
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

    // 先写图片再导数据：万一图片有问题，也不至于留下指向空文件的记录。
    // 只写「确实被快照里的愿望引用到」的文件，手改过的快照塞不进无关文件。
    let importedImages = 0;
    let skippedImages = 0;
    if (snapshot.blobs && typeof snapshot.blobs === 'object') {
      const referenced = collectReferencedFilenames(snapshot);
      for (const [filename, base64] of Object.entries(snapshot.blobs)) {
        if (!referenced.has(filename)) {
          skippedImages++;   // 没人引用，不落盘
        } else if (writeImageBase64(filename, base64)) {
          importedImages++;
        } else {
          skippedImages++;   // 文件名或内容不合法，直接跳过
        }
      }
    }

    let imported = 0;
    if (typeof store.importSnapshot === 'function') {
      const result = await store.importSnapshot(snapshot);
      imported = result.imported;
    } else {
      // 通用导入（Redis / Memory）：逐键覆盖
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
    }

    res.json({ code: 0, data: { imported, importedImages, skippedImages } });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;

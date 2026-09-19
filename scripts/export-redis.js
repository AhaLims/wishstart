// 容器数据迁移脚本：读取容器内 Redis 的全部 wishstar:* 数据，导出为统一快照 JSON。
// 用法（在跑 docker compose 的机器上）：
//   node scripts/export-redis.js [输出文件]
// 环境变量：REDIS_HOST / REDIS_PORT（默认 localhost:6379）
// 输出：wishstar-export.json（默认），供桌面端「导入快照」使用。

const path = require('path');
const fs = require('fs');
const Redis = require(path.join(__dirname, '..', 'backend', 'node_modules', 'ioredis'));

const host = process.env.REDIS_HOST || 'localhost';
const port = parseInt(process.env.REDIS_PORT || '6379');
const outFile = process.argv[2] || path.join(process.cwd(), 'wishstar-export.json');

async function main() {
  const redis = new Redis({ host, port, retryStrategy: () => null, connectTimeout: 3000 });
  await new Promise((resolve, reject) => {
    redis.once('ready', resolve);
    redis.once('error', reject);
  });
  console.log(`✓ 已连接 Redis ${host}:${port}`);

  // 遍历全部 wishstar:* 键
  const keys = await redis.keys('wishstar:*');
  console.log(`共发现 ${keys.length} 个键`);

  const data = {};
  const skipped = [];
  let byType = {};

  for (const key of keys) {
    const t = await redis.type(key);
    byType[t] = (byType[t] || 0) + 1;

    if (t === 'hash') {
      data[key] = { t: 'hash', f: await redis.hgetall(key) };
    } else if (t === 'set') {
      data[key] = { t: 'set', m: await redis.smembers(key) };
    } else if (t === 'zset') {
      const raw = await redis.zrange(key, 0, -1, 'WITHSCORES');
      const items = [];
      for (let i = 0; i < raw.length; i += 2) {
        items.push([parseInt(raw[i + 1]), raw[i]]);
      }
      data[key] = { t: 'zset', z: items };
    } else if (t === 'list') {
      data[key] = { t: 'list', l: await redis.lrange(key, 0, -1) };
    } else {
      // 跳过异常类型（如历史遗留的垃圾键）
      skipped.push(`${key} (${t})`);
    }
  }

  const snapshot = { version: 1, data };
  fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2), 'utf8');

  // 摘要输出（用于导入后校验）
  const userKey = Object.keys(data).find(k => k.startsWith('wishstar:user:'));
  const summary = { byType, skipped, output: outFile };
  if (userKey) {
    const user = data[userKey].f;
    summary.user = {
      id: user.id,
      total_stars: user.total_stars,
      current_stars: user.current_stars
    };
  }
  summary.taskCount = Object.keys(data).filter(k => k.startsWith('wishstar:task:') && !k.includes(':index:')).length;
  summary.wishCount = Object.keys(data).filter(k => k.startsWith('wishstar:wish:')).length;
  summary.recordDays = Object.keys(data).filter(k => k.startsWith('wishstar:records:')).length;
  summary.logCount = data['wishstar:logs:default_user'] ? data['wishstar:logs:default_user'].z.length : null;

  console.log('导出摘要:');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`✓ 已写入 ${outFile}`);

  redis.quit();
  process.exit(0);
}

main().catch(err => {
  console.error('导出失败:', err.message);
  process.exit(1);
});

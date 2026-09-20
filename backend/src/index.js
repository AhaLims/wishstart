// 后端入口
// 存储选择：
//   STORAGE=redis   默认（网页版），Redis 不可用时退到内存存储
//   STORAGE=json    桌面版，本地 JSON 文件（路径由 JSON_STORE_PATH 指定）
const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;

let store = null;
let useMemoryStore = false;

async function initStore() {
  const storage = process.env.STORAGE || 'redis';

  if (storage === 'json') {
    const JsonFileStore = require('./stores/jsonStore');
    const jsonPath = process.env.JSON_STORE_PATH || './wishstar-data.json';
    store = new JsonFileStore(jsonPath);
    console.log(`✓ Using JSON file store: ${jsonPath}`);
    return store;
  }

  // 默认 Redis，失败则内存兜底
  try {
    const Redis = require('ioredis');
    store = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      retryStrategy: (times) => {
        if (times > 3) {
          console.log('Redis connection failed, using memory store');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      connectTimeout: 3000
    });

    await new Promise((resolve, reject) => {
      store.once('ready', resolve);
      store.once('error', reject);
      setTimeout(() => reject(new Error('Redis timeout')), 3000);
    });

    console.log('✓ Connected to Redis');
    return store;
  } catch (err) {
    console.log('⚠ Redis unavailable, using memory store');
    useMemoryStore = true;
    store = require('./services/memoryStore');
    return store;
  }
}

async function main() {
  await initStore();

  const serveStatic = process.env.SERVE_STATIC === '1';
  const staticDir = process.env.STATIC_DIR;
  const app = createApp({ store, serveStatic, staticDir, uploadsDir: process.env.UPLOADS_DIR });

  // 内存/JSON 存储退出前落盘
  const shutdown = () => {
    if (store && typeof store.flush === 'function') store.flush();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (storage: ${useMemoryStore ? 'memory' : process.env.STORAGE || 'redis'})`);
  });

}

if (require.main === module) {
  main().catch(err => {
    console.error('启动失败:', err);
    process.exit(1);
  });
}

module.exports = { initStore, createApp: (opts) => createApp(opts) };

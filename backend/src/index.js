const express = require('express');
const cors = require('cors');
const userRoutes = require('./routes/users');
const taskRoutes = require('./routes/tasks');
const recordRoutes = require('./routes/records');
const diceRoutes = require('./routes/dice');
const wishRoutes = require('./routes/wishes');
const drawRoutes = require('./routes/draws');
const statsRoutes = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

// 存储层：优先使用Redis，失败则使用内存存储
let redis = null;
let useMemoryStore = false;

async function initStore() {
  try {
    const Redis = require('ioredis');
    redis = new Redis({
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
      redis.once('ready', resolve);
      redis.once('error', reject);
      setTimeout(() => reject(new Error('Redis timeout')), 3000);
    });

    console.log('✓ Connected to Redis');
    return redis;
  } catch (err) {
    console.log('⚠ Redis unavailable, using memory store');
    useMemoryStore = true;
    redis = require('./services/memoryStore');
    return redis;
  }
}

// 中间件
app.use(cors());
app.use(express.json());

// 将存储挂载到 req
app.use(async (req, res, next) => {
  if (!redis) {
    await initStore();
  }
  req.redis = redis;
  req.useMemoryStore = useMemoryStore;
  next();
});

// 路由
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/records', recordRoutes);
app.use('/api/v1/dice', diceRoutes);
app.use('/api/v1/wishes', wishRoutes);
app.use('/api/v1/draws', drawRoutes);
app.use('/api/v1/stats', statsRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;

// Express 应用工厂：同一套路由，供网页版（Redis）与桌面版（JSON 文件）复用。
const express = require('express');
const cors = require('cors');
const path = require('path');
const userRoutes = require('./routes/users');
const taskRoutes = require('./routes/tasks');
const recordRoutes = require('./routes/records');
const diceRoutes = require('./routes/dice');
const wishRoutes = require('./routes/wishes');
const drawRoutes = require('./routes/draws');
const statsRoutes = require('./routes/stats');
const workRoutes = require('./routes/work');
const syncRoutes = require('./routes/sync');

function createApp({ store, serveStatic, staticDir }) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '20mb' }));

  // 将存储挂载到 req（路由里沿用 req.redis 命名，实际是 store 实例）
  app.use((req, res, next) => {
    req.redis = store;
    next();
  });

  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/tasks', taskRoutes);
  app.use('/api/v1/records', recordRoutes);
  app.use('/api/v1/dice', diceRoutes);
  app.use('/api/v1/wishes', wishRoutes);
  app.use('/api/v1/draws', drawRoutes);
  app.use('/api/v1/stats', statsRoutes);
  app.use('/api/v1/work', workRoutes);
  app.use('/api/v1/sync', syncRoutes);

  // 健康检查
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // 桌面版：托管前端静态资源（frontend/dist），单页应用回退到 index.html
  if (serveStatic && staticDir) {
    app.use(express.static(staticDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(staticDir, 'index.html'), (err) => {
        if (err) next();
      });
    });
  }

  return app;
}

module.exports = { createApp };

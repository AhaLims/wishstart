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
const starlightRoutes = require('./routes/starlight');
const syncRoutes = require('./routes/sync');
const { setUploadsDir, getUploadsDir } = require('./services/wishImage');
const { SPIRITS_URL_PREFIX, getImagesDir } = require('./services/spirits');

function createApp({ store, serveStatic, staticDir, uploadsDir }) {
  const app = express();

  // 愿望配图存放目录：Electron 传 userData，其它情况用默认的 <backend>/uploads
  if (uploadsDir) setUploadsDir(uploadsDir);
  const absoluteUploadsDir = getUploadsDir();

  app.use(cors());
  // 快照导入时图片是内嵌 base64 一起传的，所以限额要比单张图宽松得多
  app.use(express.json({ limit: '50mb' }));

  // 将存储挂载到 req（路由里沿用 req.redis 命名，实际是 store 实例）
  app.use((req, res, next) => {
    req.redis = store;
    next();
  });

  // 愿望配图。文件名是内容哈希，内容永远不会变，可以放心长缓存。
  // 开发模式下前端跑在 Vite(5173)，靠 vite.config.js 里的 /uploads 代理打到这里。
  app.use('/uploads', express.static(absoluteUploadsDir, { maxAge: '1y', immutable: true }));

  // 精灵图片（星光值抽奖用），来自 nrc-scraper 的采集结果。
  // 挂的是图片根目录，头像 / 普通立绘 / 异色立绘靠子路径区分：
  //   /spirits/heads/...  /spirits/art/...  /spirits/shiny/...
  // 采集脚本还在跑的时候图片会一直增加，所以缓存时间给短一点。
  app.use(SPIRITS_URL_PREFIX, express.static(getImagesDir(), { maxAge: '1d' }));

  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/tasks', taskRoutes);
  app.use('/api/v1/records', recordRoutes);
  app.use('/api/v1/dice', diceRoutes);
  app.use('/api/v1/wishes', wishRoutes);
  app.use('/api/v1/draws', drawRoutes);
  app.use('/api/v1/stats', statsRoutes);
  app.use('/api/v1/starlight', starlightRoutes);
  app.use('/api/v1/sync', syncRoutes);

  // 健康检查
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // 桌面版：托管前端静态资源（frontend/dist），单页应用回退到 index.html
  if (serveStatic && staticDir) {
    // res.sendFile 只接受绝对路径（express.static 能容忍相对路径），
    // 这里统一解析一次，避免 STATIC_DIR 写成相对路径时直接抛 TypeError
    const absoluteStaticDir = path.resolve(staticDir);

    app.use(express.static(absoluteStaticDir));
    app.get('*', (req, res, next) => {
      // /api、/uploads、/spirits 找不到就该是 404，不能回退成 index.html
      if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') ||
          req.path.startsWith(SPIRITS_URL_PREFIX + '/')) return next();
      res.sendFile(path.join(absoluteStaticDir, 'index.html'), (err) => {
        if (err) next();
      });
    });
  }

  return app;
}

module.exports = { createApp };

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const PREFIX = 'wishstar:user';

// 获取用户信息
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await req.redis.hgetall(`${PREFIX}:${userId}`);

    if (!user || !user.id) {
      // 创建新用户
      const newUser = {
        id: userId,
        name: '用户' + userId.substr(0, 4),
        total_stars: '0',
        current_stars: '0',
        gems: '0',
        draw_count: '0',
        half_draw_count: '0',
        created_at: Date.now().toString(),
        updated_at: Date.now().toString()
      };
      await req.redis.hset(`${PREFIX}:${userId}`, newUser);
      return res.json({ code: 0, data: newUser });
    }

    res.json({ code: 0, data: user });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 设置用户名称
router.post('/:userId/name', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name } = req.body;

    await req.redis.hset(`${PREFIX}:${userId}`, 'name', name);
    await req.redis.hset(`${PREFIX}:${userId}`, 'updated_at', Date.now().toString());

    res.json({ code: 0, message: '名称设置成功' });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 初始化用户（如果不存在）
router.post('/init/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const existing = await req.redis.hget(`${PREFIX}:${userId}`, 'id');

    if (existing) {
      return res.json({ code: 0, message: '用户已存在' });
    }

    const newUser = {
      id: userId,
      name: '用户' + userId.substr(0, 4),
      total_stars: '0',
      current_stars: '0',
      gems: '0',
      draw_count: '0',
      half_draw_count: '0',
      created_at: Date.now().toString(),
      updated_at: Date.now().toString()
    };

    await req.redis.hset(`${PREFIX}:${userId}`, newUser);
    res.json({ code: 0, data: newUser });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;

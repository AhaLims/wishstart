const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const PREFIX = 'wishstar:wish';

// 创建愿望
router.post('/', async (req, res) => {
  try {
    const { userId, name, icon, totalFragments } = req.body;

    if (!userId || !name) {
      return res.status(400).json({ code: 1, message: '缺少必要参数' });
    }

    const wishId = uuidv4();
    const now = Date.now();

    const wish = {
      id: wishId,
      user_id: userId,
      name: name,
      icon: icon || '🎁',
      total_fragments: totalFragments ? totalFragments.toString() : '10',
      current_fragments: '0',
      status: 'collecting',
      created_at: now.toString(),
      updated_at: now.toString()
    };

    await req.redis.hset(`${PREFIX}:${wishId}`, wish);
    await req.redis.sadd(`wishstar:wishes:index:${userId}`, wishId);

    res.json({ code: 0, data: wish });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 获取愿望列表
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ code: 1, message: '缺少userId参数' });
    }

    const wishIds = await req.redis.smembers(`wishstar:wishes:index:${userId}`);
    const wishes = [];

    for (const wishId of wishIds) {
      const wish = await req.redis.hgetall(`${PREFIX}:${wishId}`);
      if (wish && wish.id) {
        wishes.push(wish);
      }
    }

    res.json({ code: 0, data: wishes });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 获取单个愿望
router.get('/:wishId', async (req, res) => {
  try {
    const { wishId } = req.params;
    const wish = await req.redis.hgetall(`${PREFIX}:${wishId}`);

    if (!wish || !wish.id) {
      return res.status(404).json({ code: 1, message: '愿望不存在' });
    }

    res.json({ code: 0, data: wish });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 更新愿望
router.put('/:wishId', async (req, res) => {
  try {
    const { wishId } = req.params;
    const { name, imageUrl, totalFragments } = req.body;

    const updates = {
      updated_at: Date.now().toString()
    };

    if (name) updates.name = name;
    if (imageUrl !== undefined) updates.image_url = imageUrl;
    if (totalFragments) updates.total_fragments = totalFragments.toString();

    await req.redis.hset(`${PREFIX}:${wishId}`, updates);

    const wish = await req.redis.hgetall(`${PREFIX}:${wishId}`);
    res.json({ code: 0, data: wish });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 删除愿望
router.delete('/:wishId', async (req, res) => {
  try {
    const { wishId } = req.params;
    const wish = await req.redis.hgetall(`${PREFIX}:${wishId}`);

    if (wish && wish.user_id) {
      await req.redis.srem(`wishstar:wishes:index:${wish.user_id}`, wishId);
    }

    await req.redis.del(`${PREFIX}:${wishId}`);

    res.json({ code: 0, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 合成愿望
router.post('/:wishId/complete', async (req, res) => {
  try {
    const { wishId } = req.params;
    const wish = await req.redis.hgetall(`${PREFIX}:${wishId}`);

    if (!wish || !wish.id) {
      return res.status(404).json({ code: 1, message: '愿望不存在' });
    }

    const totalFragments = parseInt(wish.total_fragments) || 10;
    const currentFragments = parseInt(wish.current_fragments) || 0;

    if (currentFragments < totalFragments) {
      return res.json({ code: 1, message: `碎片不足，还需${totalFragments - currentFragments}个碎片` });
    }

    const now = Date.now();
    await req.redis.hset(`${PREFIX}:${wishId}`, {
      status: 'completed',
      completed_at: now.toString(),
      updated_at: now.toString()
    });

    // 记录流水
    const log = {
      id: uuidv4(),
      type: 'income',
      category: 'wish_complete',
      amount: 0,
      description: `愿望「${wish.name}」已合成完成！`,
      created_at: now
    };
    await req.redis.zadd(`wishstar:logs:${wish.user_id}`, now, JSON.stringify(log));

    res.json({
      code: 0,
      data: {
        wishName: wish.name,
        completedAt: now
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;

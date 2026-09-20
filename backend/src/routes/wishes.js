const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const {
  WISH_TYPE_NORMAL,
  isGeneralWish,
  getTotalFragments,
  getCurrentFragments,
  isWishFull,
  markWishReady,
  ensureWishFresh,
  ensureWishFreshAll,
  ensureGeneralWish
} = require('../services/wishState');

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
      wish_type: WISH_TYPE_NORMAL,
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

    // 通用型愿望由系统自动创建，用户无需手动新建
    await ensureGeneralWish(req.redis, userId);

    // 顺手把该过期的愿望标记掉，返回的才是最新状态
    const wishes = await ensureWishFreshAll(req.redis, userId);

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

    const fresh = await ensureWishFresh(req.redis, wish, Date.now());
    res.json({ code: 0, data: fresh });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 更新愿望
router.put('/:wishId', async (req, res) => {
  try {
    const { wishId } = req.params;
    const { name, icon, totalFragments, currentFragments } = req.body;

    const existing = await req.redis.hgetall(`${PREFIX}:${wishId}`);
    if (!existing || !existing.id) {
      return res.status(404).json({ code: 1, message: '愿望不存在' });
    }

    const wish = await ensureWishFresh(req.redis, existing, Date.now());
    const updates = {};

    // 通用型愿望的碎片上限不可改（它本来就没有上限）
    if (totalFragments !== undefined) {
      if (isGeneralWish(wish)) {
        return res.json({ code: 1, message: '通用愿望没有碎片上限，无需设置' });
      }
      updates.total_fragments = totalFragments.toString();
    }

    // 已结束（已完成 / 已过期）的愿望只允许改名称和图标，避免把状态改回去
    const isClosed = wish.status === 'completed' || wish.status === 'expired';
    if (currentFragments !== undefined) {
      if (isClosed) {
        return res.json({ code: 1, message: '愿望已结束，无法修改碎片数量' });
      }
      updates.current_fragments = currentFragments.toString();
    }

    if (name) updates.name = name;
    if (icon !== undefined) updates.icon = icon;
    updates.updated_at = Date.now().toString();

    await req.redis.hset(`${PREFIX}:${wishId}`, updates);

    // 手动把碎片数改到上限时，要顺带进入「已集满待合成」，
    // 否则它会一直停在收集中：抽卡不会再选中已满的愿望，也就永远转不成 ready。
    let latest = await req.redis.hgetall(`${PREFIX}:${wishId}`);
    if (latest.status === 'collecting' && !isGeneralWish(latest) && isWishFull(latest)) {
      latest = await markWishReady(req.redis, latest, Date.now());
    }

    res.json({ code: 0, data: latest });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 删除愿望
router.delete('/:wishId', async (req, res) => {
  try {
    const { wishId } = req.params;
    const wish = await req.redis.hgetall(`${PREFIX}:${wishId}`);

    if (!wish || !wish.id) {
      return res.status(404).json({ code: 1, message: '愿望不存在' });
    }

    // 通用愿望是系统自动创建的，删掉还会被重新创建，直接拒绝
    if (isGeneralWish(wish)) {
      return res.json({ code: 1, message: '通用愿望不可删除' });
    }

    await req.redis.srem(`wishstar:wishes:index:${wish.user_id}`, wishId);
    await req.redis.del(`${PREFIX}:${wishId}`);

    res.json({ code: 0, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 合成愿望（普通愿望：碎片集满后在有效期内点击合成）
router.post('/:wishId/complete', async (req, res) => {
  try {
    const { wishId } = req.params;
    const existing = await req.redis.hgetall(`${PREFIX}:${wishId}`);

    if (!existing || !existing.id) {
      return res.status(404).json({ code: 1, message: '愿望不存在' });
    }

    // 先刷新状态：可能刚好在打开页面的这段时间里过期了
    const wish = await ensureWishFresh(req.redis, existing, Date.now());

    if (wish.status === 'expired') {
      return res.json({ code: 1, message: '愿望已过期，无法再合成' });
    }

    if (wish.status === 'completed') {
      return res.json({ code: 1, message: '愿望已完成，无需重复合成' });
    }

    if (isGeneralWish(wish)) {
      return res.json({ code: 1, message: '通用愿望没有碎片上限，请使用「实现」功能' });
    }

    const totalFragments = getTotalFragments(wish);
    const currentFragments = getCurrentFragments(wish);

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

// 实现通用愿望：消耗指定数量的碎片
router.post('/:wishId/realize', async (req, res) => {
  try {
    const { wishId } = req.params;
    const { fragments } = req.body;

    const existing = await req.redis.hgetall(`${PREFIX}:${wishId}`);
    if (!existing || !existing.id) {
      return res.status(404).json({ code: 1, message: '愿望不存在' });
    }

    if (!isGeneralWish(existing)) {
      return res.json({ code: 1, message: '只有通用愿望可以使用「实现」功能' });
    }

    const amount = Number(fragments);
    if (!Number.isInteger(amount) || amount < 1) {
      return res.json({ code: 1, message: '请输入要消耗的碎片数量' });
    }

    // 消耗量不能超过当前持有量（可以一次用完）
    const before = await req.redis.hgetall(`${PREFIX}:${wishId}`);
    const currentFragments = getCurrentFragments(before);
    if (amount > currentFragments) {
      return res.json({ code: 1, message: `碎片不足，当前只有${currentFragments}个碎片` });
    }

    const now = Date.now();

    // 直接减去，并记录实现次数
    const after = await req.redis.hincrby(`${PREFIX}:${wishId}`, 'current_fragments', -amount);
    await req.redis.hincrby(`${PREFIX}:${wishId}`, 'realize_count', 1);
    await req.redis.hset(`${PREFIX}:${wishId}`, {
      last_realized_at: now.toString(),
      updated_at: now.toString()
    });

    // 记录流水
    const log = {
      id: uuidv4(),
      type: 'expenditure',
      category: 'wish_realize',
      amount: -amount,
      description: `实现通用愿望，消耗${amount}个碎片（剩余${after}个）`,
      created_at: now
    };
    await req.redis.zadd(`wishstar:logs:${existing.user_id}`, now, JSON.stringify(log));

    const latest = await req.redis.hgetall(`${PREFIX}:${wishId}`);

    res.json({
      code: 0,
      data: {
        wishName: latest.name,
        consumed: amount,
        currentFragments: after,
        realizeCount: parseInt(latest.realize_count, 10) || 0
      }
    });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;

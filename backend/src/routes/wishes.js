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
  priceToFragments,
  fragmentsToPrice,
  getWishPrice,
  formatFragments,
  buildRealizedWish,
  ensureWishFresh,
  ensureWishFreshAll,
  ensureGeneralWish
} = require('../services/wishState');
const { withLock } = require('../utils/lock');
const {
  saveWishImage,
  deleteWishImageIfUnreferenced
} = require('../services/wishImage');

const PREFIX = 'wishstar:wish';

// 创建愿望
router.post('/', async (req, res) => {
  try {
    const { userId, name, icon, price, totalFragments, image } = req.body;

    if (!userId || !name) {
      return res.status(400).json({ code: 1, message: '缺少必要参数' });
    }

    // 用户填的是价格（元），碎片数由它换算出来。
    // 保留 totalFragments 入参是为了兼容老客户端（只传碎片数时反推价格）。
    let totalFragmentsNum;
    let priceNum;
    const hasPrice = price !== undefined && price !== null && price !== '';

    if (hasPrice) {
      priceNum = Number(price);
      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        return res.status(400).json({ code: 1, message: '请输入有效的价格' });
      }
      totalFragmentsNum = priceToFragments(priceNum);
    } else {
      const parsedTotal = parseInt(totalFragments, 10);
      totalFragmentsNum = (Number.isNaN(parsedTotal) || parsedTotal <= 0) ? 10 : parsedTotal;
      priceNum = fragmentsToPrice(totalFragmentsNum);
    }

    // 配图与图标二选一：传了图片就不存图标
    let imageUrl = '';
    let iconValue = icon || '🎁';
    if (image) {
      try {
        imageUrl = saveWishImage(image).url;
      } catch (err) {
        return res.status(400).json({ code: 1, message: err.message });
      }
      iconValue = '';
    }

    const wishId = uuidv4();
    const now = Date.now();

    const wish = {
      id: wishId,
      user_id: userId,
      name: name,
      icon: iconValue,
      image: imageUrl,
      wish_type: WISH_TYPE_NORMAL,
      price: priceNum.toString(),
      total_fragments: totalFragmentsNum.toString(),
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
    const { name, icon, price, totalFragments, currentFragments, image } = req.body;

    const existing = await req.redis.hgetall(`${PREFIX}:${wishId}`);
    if (!existing || !existing.id) {
      return res.status(404).json({ code: 1, message: '愿望不存在' });
    }

    const wish = await ensureWishFresh(req.redis, existing, Date.now());
    const updates = {};

    // 价格是源头，碎片数由它换算；两者一起写，保证不会对不上
    if (price !== undefined && price !== null && price !== '') {
      if (isGeneralWish(wish)) {
        return res.json({ code: 1, message: '通用愿望没有价格，无需设置' });
      }
      const parsedPrice = Number(price);
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        return res.json({ code: 1, message: '请输入有效的价格' });
      }
      updates.price = parsedPrice.toString();
      updates.total_fragments = priceToFragments(parsedPrice).toString();
    } else if (totalFragments !== undefined) {
      // 兼容只传碎片数的老客户端
      if (isGeneralWish(wish)) {
        return res.json({ code: 1, message: '通用愿望没有碎片上限，无需设置' });
      }
      const parsedTotal = parseInt(totalFragments, 10);
      if (Number.isNaN(parsedTotal) || parsedTotal <= 0) {
        return res.json({ code: 1, message: '请输入有效的碎片数量' });
      }
      updates.total_fragments = parsedTotal.toString();
      updates.price = fragmentsToPrice(parsedTotal).toString();
    }

    // 已结束（已完成 / 已过期）的愿望只允许改名称和图标，避免把状态改回去
    const isClosed = wish.status === 'completed' || wish.status === 'expired';
    if (currentFragments !== undefined) {
      if (isClosed) {
        return res.json({ code: 1, message: '愿望已结束，无法修改碎片数量' });
      }
      // 至少挡住负数和非数字。这两个写进去是**没法自愈**的：
      // 负数会让进度条算成负的，而且 isWishFull 永远为 false，那个愿望
      // 既合不成、抽卡也还会一直抽到它。
      // 上界**故意不夹**：填超了会走下面「已经够数」那段自动转成 ready，
      // 本来就是自愈的，再夹一次反而会让「调低价格 → 退回收集」那段逻辑打架。
      const parsedCurrent = parseInt(currentFragments, 10);
      if (Number.isNaN(parsedCurrent) || parsedCurrent < 0) {
        return res.json({ code: 1, message: '碎片数量不能是负数' });
      }
      updates.current_fragments = parsedCurrent.toString();
    }

    if (name) updates.name = name;

    // 配图与图标二选一：显式设置谁就以谁为准，另一个清空
    const previousImage = wish.image || '';
    let nextImage = previousImage;
    let nextIcon = wish.icon || '';

    if (image !== undefined) {
      if (image === '') {
        // 显式清空配图，回退到图标
        nextImage = '';
      } else {
        try {
          nextImage = saveWishImage(image).url;
        } catch (err) {
          return res.status(400).json({ code: 1, message: err.message });
        }
        nextIcon = '';
      }
    }

    if (icon !== undefined && icon !== '') {
      nextIcon = icon;
      nextImage = '';
    }

    if (image !== undefined || icon !== undefined) {
      if (nextImage) {
        updates.icon = '';
        updates.image = nextImage;
      } else {
        updates.icon = nextIcon || '🎁';
        updates.image = '';
      }
    }

    updates.updated_at = Date.now().toString();

    await req.redis.hset(`${PREFIX}:${wishId}`, updates);

    // 换图或改回图标后，旧图片文件没人引用了才删（文件名是内容哈希，可能被别的愿望共用）。
    // 必须放在 hset 之后，否则引用检查会把这个愿望自己也数进去。
    if (previousImage && previousImage !== nextImage) {
      await deleteWishImageIfUnreferenced(req.redis, previousImage);
    }

    let latest = await req.redis.hgetall(`${PREFIX}:${wishId}`);

    // 调高价格后已经攒的碎片不够数了，退回收集中，并清掉作废的有效期
    if (latest.status === 'ready' && !isWishFull(latest)) {
      await req.redis.hset(`${PREFIX}:${wishId}`, {
        status: 'collecting',
        ready_at: '',
        expires_at: '',
        updated_at: Date.now().toString()
      });
      latest = await req.redis.hgetall(`${PREFIX}:${wishId}`);
    }

    // 反向：碎片数已经够（手动改碎片数、或调低价格）就直接进入「已集满待合成」，
    // 否则它会一直停在收集中——抽卡不会再选中已满的愿望，也就永远转不成 ready。
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

    // 数据删掉之后再清理图片文件，理由同上
    if (wish.image) {
      await deleteWishImageIfUnreferenced(req.redis, wish.image);
    }

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
      description: `愿望「${wish.name}」（¥${getWishPrice(wish)}）已合成完成！`,
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

// 实现通用愿望：给这次兑现起个名字，扣掉相应碎片，生成一条已完成愿望。
//
// 通用愿望本身留在原地继续攒（剩下的碎片不动），所以这里有两份数据要写：
// 通用愿望扣碎片 + 新愿望入索引。两件事都得在一个临界区里。
router.post('/:wishId/realize', async (req, res) => {
  try {
    const { wishId } = req.params;
    const { fragments, name } = req.body;

    const existing = await req.redis.hgetall(`${PREFIX}:${wishId}`);
    if (!existing || !existing.id) {
      return res.status(404).json({ code: 1, message: '愿望不存在' });
    }

    if (!isGeneralWish(existing)) {
      return res.json({ code: 1, message: '只有通用愿望可以使用「实现」功能' });
    }

    const realizedName = String(name === undefined || name === null ? '' : name).trim();
    if (!realizedName) {
      return res.json({ code: 1, message: '请填写这次实现的愿望名称' });
    }

    const amount = Number(fragments);
    if (!Number.isInteger(amount) || amount < 1) {
      return res.json({ code: 1, message: '请输入要消耗的碎片数量' });
    }

    // 「读当前碎片 → 判断够不够 → 扣掉」串行。中间隔着 await，不锁的话
    // 连点两下会双双读到同一个 current_fragments、双双判定够用，
    // 结果扣出负数还多生成一条已完成愿望。
    const result = await withLock(`wish-realize:${wishId}`, async () => {
      const before = await req.redis.hgetall(`${PREFIX}:${wishId}`);
      const currentFragments = getCurrentFragments(before);
      if (amount > currentFragments) {
        return { error: `碎片不足，当前只有${currentFragments}个碎片` };
      }

      const now = Date.now();

      // 直接减去，并记录实现次数
      const after = await req.redis.hincrby(`${PREFIX}:${wishId}`, 'current_fragments', -amount);
      await req.redis.hincrby(`${PREFIX}:${wishId}`, 'realize_count', 1);
      await req.redis.hset(`${PREFIX}:${wishId}`, {
        last_realized_at: now.toString(),
        updated_at: now.toString()
      });

      // 这次兑现出来的愿望，直接以「已完成」的姿态入账
      const realized = buildRealizedWish(existing.user_id, realizedName, amount, now);
      await req.redis.hset(`${PREFIX}:${realized.id}`, realized);
      await req.redis.sadd(`wishstar:wishes:index:${existing.user_id}`, realized.id);

      // 记录流水
      const log = {
        id: uuidv4(),
        type: 'expenditure',
        category: 'wish_realize',
        amount: -amount,
        description: `实现「${realizedName}」，消耗${amount}个碎片（剩余${after}个）`,
        created_at: now
      };
      await req.redis.zadd(`wishstar:logs:${existing.user_id}`, now, JSON.stringify(log));

      const latest = await req.redis.hgetall(`${PREFIX}:${wishId}`);

      return {
        data: {
          realizedWish: realized,
          consumed: amount,
          currentFragments: after,
          realizeCount: parseInt(latest.realize_count, 10) || 0
        }
      };
    });

    if (result.error) {
      return res.json({ code: 1, message: result.error });
    }
    res.json({ code: 0, data: result.data });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

// 把碎片从通用愿望转给某个还没集满的普通愿望。
//
// 为什么需要它：普通愿望的碎片只能靠抽卡加，而抽卡是从所有未集满的愿望里**随机**
// 抽一个 —— 一个差一颗的愿望只能干等运气。通用愿望是个能一直攒的桶，于是把桶里的
// 碎片定向挪一颗过去就成了补这个缺口的唯一办法（「补记碎片」只能补当前那张卡，
// 挪不动别的愿望的缺口）。
//
// 上限卡两处：目标的缺口（补超了就溢出成负缺口）和通用愿望的当前持有量。
// 补满的那一刻走 markWishReady，跟抽卡补满是同一个转换点，不另写一遍。
router.post('/:wishId/transfer', async (req, res) => {
  try {
    const { wishId } = req.params;
    const { targetWishId, fragments } = req.body;

    const existing = await req.redis.hgetall(`${PREFIX}:${wishId}`);
    if (!existing || !existing.id) {
      return res.status(404).json({ code: 1, message: '愿望不存在' });
    }

    if (!isGeneralWish(existing)) {
      return res.json({ code: 1, message: '只有通用愿望可以转出碎片' });
    }

    if (!targetWishId) {
      return res.json({ code: 1, message: '请选择要补充碎片的愿望' });
    }
    if (targetWishId === wishId) {
      return res.json({ code: 1, message: '不能补充给通用愿望自己' });
    }

    const amount = Number(fragments);
    if (!Number.isInteger(amount) || amount < 1) {
      return res.json({ code: 1, message: '请输入要补充的碎片数量' });
    }

    // 「读当前碎片 → 判断够不够 → 扣掉」串行。理由跟上面 realize 那条一样：
    // 中间隔着 await，不锁的话连点两下会双双读到同一份碎片、双双判定够用，
    // 扣出负数还多加一倍碎片给目标。
    const result = await withLock(`wish-transfer:${wishId}`, async () => {
      const from = await req.redis.hgetall(`${PREFIX}:${wishId}`);
      const fromCurrent = getCurrentFragments(from);
      if (amount > fromCurrent) {
        return { error: `碎片不足，通用愿望当前只有${fromCurrent}个碎片` };
      }

      const target = await req.redis.hgetall(`${PREFIX}:${targetWishId}`);
      if (!target || !target.id) {
        return { error: '要补充的愿望不存在' };
      }
      if (isGeneralWish(target)) {
        return { error: '不能补充给通用愿望自己' };
      }

      // 状态先刷新：可能刚好在打开弹窗这段时间里过期了
      const fresh = await ensureWishFresh(req.redis, target, Date.now());
      if (fresh.status !== 'collecting') {
        return { error: '只能补充给正在收集中的愿望' };
      }

      const deficit = getTotalFragments(fresh) - getCurrentFragments(fresh);
      if (deficit <= 0) {
        return { error: `「${fresh.name}」已经集满了，不用再补` };
      }
      if (amount > deficit) {
        return { error: `「${fresh.name}」还差${deficit}个碎片，补多了就超了` };
      }

      const now = Date.now();

      const after = await req.redis.hincrby(`${PREFIX}:${wishId}`, 'current_fragments', -amount);
      await req.redis.hincrby(`${PREFIX}:${targetWishId}`, 'current_fragments', amount);
      await req.redis.hset(`${PREFIX}:${targetWishId}`, { updated_at: String(now) });

      // 补满了就直接进「已集满待合成」，有效期从这一刻起算
      let latestTarget = await req.redis.hgetall(`${PREFIX}:${targetWishId}`);
      const becameReady = isWishFull(latestTarget);
      if (becameReady) {
        latestTarget = await markWishReady(req.redis, latestTarget, now);
      }

      // 记一条流水。金额记「通用愿望这边少了多少」（-n），描述里写清补给了谁、
      // 补完是几比几，不然过几天翻流水会看不出这笔记的是什么
      const log = {
        id: uuidv4(),
        type: 'expenditure',
        category: 'wish_topup',
        amount: -amount,
        description: `给「${latestTarget.name}」补充${amount}个碎片` +
          `（${formatFragments(latestTarget)}），通用愿望剩余${after}个`,
        created_at: now
      };
      await req.redis.zadd(`wishstar:logs:${from.user_id}`, now, JSON.stringify(log));

      return {
        data: {
          target: latestTarget,
          targetReady: becameReady,
          consumed: amount,
          currentFragments: after
        }
      };
    });

    if (result.error) {
      return res.json({ code: 1, message: result.error });
    }
    res.json({ code: 0, data: result.data });
  } catch (error) {
    res.status(500).json({ code: 1, message: error.message });
  }
});

module.exports = router;

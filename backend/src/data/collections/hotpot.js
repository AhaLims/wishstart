// 收集册「火锅」。规则和取舍见 docs/核心功能 第 8 条，这个文件里只有数据。
//
// **想加第二本（烧烤摊 / 盆栽 / …）就照这个文件的形状再写一个，在 index.js 里
// 挂上就行**，服务和前端组件都不用动 —— 这是 8.9 的全部目的（一本 = 一个数据文件）。
// 所以这个文件里**不许出现任何逻辑**，也不许在服务或组件里写死「火锅」「肥牛」这段字。
//
// 价格挂在**档**上不挂在格子上：调价是改五个数，不是改 39 行。
// 现在的五档（档 = 价，从上到下就是锅里的摆放顺序）：
//   素菜 veg 8000 × 11 + 荤菜 meat 14000 × 11 + 主食 staple 10000 × 4
//   + 招牌 premium 30000 × 4 + 饮料 drink 6000 × 9 = 456000
// 按 15000/天 约 30 天，按待办翻倍后的 96000/天 约 4.75 天（8.3、9.8）。
// **要调价就改下面这张 tiers 表**，别去改服务或前端里的任何判断。
//
// **往一个已有的档里加格子会让后面的格子整体挪位**：服务里 itemsOf() 是按
// 「档的声明顺序 + 档内数组顺序」重新排的，不看这个数组里谁写在前面。
// 位置只影响摆放，不影响谁买过 —— 买没买存在 set 里、按 "<本id>:<格子id>" 认人。
//
// emoji 是**第一版刻意不画图**（8.6）：这一版要验证的是手感（掉落、冒泡、解锁
// 节奏），不是画风。空格子的灰剪影就是同一个 emoji 加 filter 压黑，不另做一套图。
// 挑 emoji 的两条硬规矩（都是实测出来的，见 docs/美术素材收集.md）：
//   1. **只挑单个码点的**（Unicode 13 以内）。ZWJ 组合缺字形时不会变豆腐块，
//      而是悄悄渲染成两个 emoji，最难查。
//   2. **挑完要按锅里的真实样式看一眼**：有字形 ≠ 深色锅底上看得清。
//      比如 🫓（饼）就是灰白的、边缘糊在汤里，所以主食那格换成了 🍙。
module.exports = {
  id: 'hotpot',
  name: '火锅',
  // 容器名。前端「已下锅 N/39」「往锅里下」这些文案都从这儿取，
  // 换成烤炉 / 花盆时组件不用改字
  container: '锅',
  // 下锅这个动作的说法，同上。它同时驱动 tooltip、流水、浮窗三处文案 ——
  // 饮料那 9 格用「下锅」略别扭，但 39 格里只有 9 格是饮料，而且
  // 「买 = 下锅」是这套玩法的既定说法（8.5），所以保持不动
  action: '下锅',

  tiers: [
    { id: 'veg', name: '素菜', price: 8000 },
    { id: 'meat', name: '荤菜', price: 14000 },
    { id: 'staple', name: '主食', price: 10000 },
    { id: 'premium', name: '招牌', price: 30000 },
    { id: 'drink', name: '饮料', price: 6000 }
  ],

  // **档的顺序就是下锅后在锅里排的位置**，前端不另外排序。
  // tier 必须能在上面 tiers 里找到，服务启动时有一道自检（见 services/collections.js）
  items: [
    { id: 'cabbage', name: '白菜', emoji: '🥬', tier: 'veg' },
    { id: 'mushroom', name: '香菇', emoji: '🍄', tier: 'veg' },
    { id: 'corn', name: '玉米', emoji: '🌽', tier: 'veg' },
    { id: 'carrot', name: '胡萝卜', emoji: '🥕', tier: 'veg' },
    { id: 'tomato', name: '番茄', emoji: '🍅', tier: 'veg' },
    { id: 'potato', name: '土豆', emoji: '🥔', tier: 'veg' },
    { id: 'eggplant', name: '茄子', emoji: '🍆', tier: 'veg' },
    { id: 'cucumber', name: '黄瓜', emoji: '🥒', tier: 'veg' },
    { id: 'broccoli', name: '西兰花', emoji: '🥦', tier: 'veg' },
    { id: 'pepper', name: '青椒', emoji: '🫑', tier: 'veg' },
    { id: 'sweetpotato', name: '红薯', emoji: '🍠', tier: 'veg' },

    { id: 'beef', name: '肥牛', emoji: '🥩', tier: 'meat' },
    { id: 'shrimp', name: '虾滑', emoji: '🦐', tier: 'meat' },
    { id: 'fish', name: '鱼片', emoji: '🐟', tier: 'meat' },
    { id: 'meatball', name: '丸子', emoji: '🍢', tier: 'meat' },
    { id: 'squid', name: '鱿鱼', emoji: '🦑', tier: 'meat' },
    { id: 'dumpling', name: '蛋饺', emoji: '🥟', tier: 'meat' },
    { id: 'crab', name: '蟹棒', emoji: '🦀', tier: 'meat' },
    { id: 'wing', name: '鸡翅', emoji: '🍗', tier: 'meat' },
    { id: 'luncheon', name: '午餐肉', emoji: '🥓', tier: 'meat' },
    { id: 'sausage', name: '香肠', emoji: '🌭', tier: 'meat' },
    { id: 'kamaboko', name: '鱼板', emoji: '🍥', tier: 'meat' },

    { id: 'noodle', name: '拉面', emoji: '🍜', tier: 'staple' },
    { id: 'rice', name: '白饭', emoji: '🍚', tier: 'staple' },
    { id: 'onigiri', name: '饭团', emoji: '🍙', tier: 'staple' },
    { id: 'egg', name: '鸡蛋', emoji: '🥚', tier: 'staple' },

    // 「招牌」是这口锅里的大件，单价比荤菜翻一倍还多（30000）——
    // 攒这几格才有目标感（8.3）
    { id: 'lobster', name: '龙虾', emoji: '🦞', tier: 'premium' },
    { id: 'rib', name: '带骨肉', emoji: '🍖', tier: 'premium' },
    { id: 'octopus', name: '章鱼', emoji: '🐙', tier: 'premium' },
    { id: 'tempura', name: '炸虾', emoji: '🍤', tier: 'premium' },

    // 吃火锅得喝饮料。这是最便宜的一档（6000），也是唯一一档
    // 「名称不是食材、下锅这个动词有点别扭」的，权衡见上面的 action 注释
    { id: 'soda', name: '汽水', emoji: '🥤', tier: 'drink' },
    { id: 'juice', name: '果汁', emoji: '🧃', tier: 'drink' },
    { id: 'tea', name: '茶', emoji: '🍵', tier: 'drink' },
    { id: 'beer', name: '啤酒', emoji: '🍺', tier: 'drink' },
    { id: 'sake', name: '清酒', emoji: '🍶', tier: 'drink' },
    { id: 'milk', name: '牛奶', emoji: '🥛', tier: 'drink' },
    { id: 'wine', name: '红酒', emoji: '🍷', tier: 'drink' },
    { id: 'champagne', name: '香槟', emoji: '🍾', tier: 'drink' },
    { id: 'coffee', name: '咖啡', emoji: '☕', tier: 'drink' }
  ],

  // 集齐那一刻顶上的文案（8.5）。同样不写死在组件里
  doneTitle: '这一锅齐了',
  doneNote: '所有食材都下过锅了'
};

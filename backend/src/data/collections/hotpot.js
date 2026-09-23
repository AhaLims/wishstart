// 收集册「火锅」。规则和取舍见 docs/核心功能 第 8 条，这个文件里只有数据。
//
// **想加第二本（烧烤摊 / 盆栽 / …）就照这个文件的形状再写一个，在 index.js 里
// 挂上就行**，服务和前端组件都不用动 —— 这是 8.9 的全部目的（一本 = 一个数据文件）。
// 所以这个文件里**不许出现任何逻辑**，也不许在服务或组件里写死「火锅」「肥牛」「18」。
//
// 价格挂在**档**上不挂在格子上：调价是改两个数，不是改 18 行。
// 定价按「一锅 ≈ 两周」反推 —— 抽一次中位 3000 洛克贝，每天 5 抽约 15000/天，
// 素 8 × 8000 + 荤 10 × 14000 = 204000，正好两周左右。**要调价就改下面这张表**
// （8.3），别去改服务或前端里的任何判断。
//
// emoji 是**第一版刻意不画图**（8.6）：这一版要验证的是手感（掉落、冒泡、解锁
// 节奏），不是画风。空格子的灰剪影就是同一个 emoji 加 filter 压黑，不另做一套图。
module.exports = {
  id: 'hotpot',
  name: '火锅',
  // 容器名。前端「已下锅 N/18」「往锅里下」这些文案都从这儿取，
  // 换成烤炉 / 花盆时组件不用改字
  container: '锅',
  // 下锅这个动作的说法，同上
  action: '下锅',

  tiers: [
    { id: 'veg', name: '素菜', price: 8000 },
    { id: 'meat', name: '荤菜', price: 14000 }
  ],

  // **数组顺序就是下锅后在锅里排的位置**，前端不另外排序。
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

    { id: 'beef', name: '肥牛', emoji: '🥩', tier: 'meat' },
    { id: 'shrimp', name: '虾滑', emoji: '🦐', tier: 'meat' },
    { id: 'fish', name: '鱼片', emoji: '🐟', tier: 'meat' },
    { id: 'meatball', name: '丸子', emoji: '🍢', tier: 'meat' },
    { id: 'squid', name: '鱿鱼', emoji: '🦑', tier: 'meat' },
    { id: 'dumpling', name: '蛋饺', emoji: '🥟', tier: 'meat' },
    { id: 'crab', name: '蟹棒', emoji: '🦀', tier: 'meat' },
    { id: 'wing', name: '鸡翅', emoji: '🍗', tier: 'meat' },
    { id: 'luncheon', name: '午餐肉', emoji: '🥓', tier: 'meat' },
    { id: 'sausage', name: '香肠', emoji: '🌭', tier: 'meat' }
  ],

  // 集齐那一刻顶上的文案（8.5）。同样不写死在组件里
  doneTitle: '这一锅齐了',
  doneNote: '所有食材都下过锅了'
};

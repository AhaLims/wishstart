<template>
  <div class="starlight-page">
    <h1 class="page-title">星光值</h1>
    <p class="page-subtitle">星光值可凝结成许愿星，抽卡同时获得洛克贝</p>

    <!-- 两个数分两张卡：许愿星（攒够星光值凝结出来的）和洛克贝（抽卡直接进账的）。
         它们各记各的账，并排放是为了好对账，不是一回事 —— 颜色也分开，
         许愿星蓝、洛克贝金（跟洛克贝图标那枚金币一个色）。

         每张卡上大数是总数、下面小字是今天新增：两个数写一样大反而要停下来分辨
         哪个是哪个。原来「待入库」那块没有了 —— 凝结出来直接进总数，不用手动收。

         星光值**自己不占位置**：它是内部计价单位，页面上不显示数字，
         只在下面那条进度条上以比例的形式体现（见进度卡那段的注释）。 -->
    <div class="overview">
      <div class="card overview-card">
        <div class="overview-label">凝结许愿星总数</div>
        <div class="overview-value number">
          {{ state.banked }}<span class="overview-unit">颗</span>
        </div>
        <div class="overview-today">
          今天凝结了 <b class="number">+{{ state.todayCondensed }}</b> 颗
        </div>
      </div>

      <div class="card overview-card">
        <div class="overview-label">
          <img class="roco-ico" :src="rocoIcon" alt="" />洛克贝总数
        </div>
        <div class="overview-value overview-roco number">{{ state.rocoTotal }}</div>
        <div class="overview-today">
          今天获得 <b class="number today-roco">+{{ state.rocoToday }}</b>
        </div>
        <!-- 可花余额：下面那口锅扣的就是这个数。
             **跟上面的「总数」并排是有意的** —— 上面那个是「累计获得」，只涨不跌，
             那是攒钱唯一的爽点；一消费就往回走的只能是余额，所以两个数必须分开
             显示，不能拿总数去减（见 docs 8.1）。 -->
        <div class="overview-balance">
          可花余额 <b class="number">{{ state.rocoBalance }}</b>
        </div>
      </div>
    </div>

    <!-- 收集册：洛克贝**唯一**的消费去向。
         **放在洛克贝卡片正下方是刻意的** —— 挣钱的卡片和花钱的地方在同一屏，
         抽完卡顺手就能买，这是不把它单开一页的全部理由（docs 8.5）。

         结构是数据驱动的：一本 = 后端一个数据文件，锅、格子、价格、文案全从那来。
         **这里不许出现写死的「火锅」「肥牛」「18」**，加第二本不用动这个组件（docs 8.9）。 -->
    <div v-for="book in collections.books" :key="book.id" class="card collection-card">
      <div class="collection-head">
        <h2 class="section-title">{{ book.name }}</h2>
        <span class="collection-progress">
          已{{ book.action }} <b class="number">{{ book.ownedCount }}</b>
          / {{ book.totalCount }}
        </span>
      </div>

      <!-- 锅。**汤一直在冒泡**（纯 CSS，不是点击才动）—— 这页因此是「活着」的，
           每次打开都在动。这条比下面那下解锁动画更影响体感，别做成一张静止的图。
           集齐之后整锅发光（.pot-done），永久保留，不再能买（docs 8.4）。 -->
      <div class="pot" :class="{ 'pot-done': book.doneAt }">
        <div class="pot-bubbles" aria-hidden="true">
          <span v-for="n in 8" :key="n" class="bubble" :style="{ '--i': n }"></span>
        </div>

        <div class="pot-grid">
          <div
            v-for="item in book.items"
            :key="item.id"
            class="dish"
            :class="{
              'dish-owned': isOwned(book, item),
              'dish-dropping': droppingId === item.id
            }"
          >
            <!-- 空格子上的剪影就是**同一个 emoji 压黑**，不另做一套图（docs 8.5）。
                 emoji 本身是彩色的，filter 一压就只剩轮廓，正好当「还没买」的形状 -->
            <div class="dish-emoji">{{ item.emoji }}</div>
            <div class="dish-name">{{ item.name }}</div>

            <button
              v-if="!isOwned(book, item)"
              class="dish-buy"
              :disabled="!!buyingId || collections.rocoBalance < item.price"
              :title="`花 ${item.price} 洛克贝把「${item.name}」${book.action}`"
              @click="buyDish(book, item)"
            >
              <template v-if="buyingId === item.id">…</template>
              <template v-else>
                <img class="roco-ico" :src="rocoIcon" alt="" />{{ item.price }}
              </template>
            </button>
          </div>
        </div>
      </div>

      <!-- 集齐那一刻：顶上出现完成文案 + 日期。**日期从后端的集齐时间戳来**，
           不是拿「格子数够了」现场推 —— 那样推不出是哪天完成的（docs 8.2） -->
      <p v-if="book.doneAt" class="pot-done-note">
        🎉 {{ book.doneTitle }} —— {{ book.doneNote }}（{{ formatTime(book.doneAt) }}）
      </p>
      <p v-else class="pot-note">
        洛克贝是抽精灵进账的，攒够了就往锅里下一样。
      </p>
    </div>

    <!-- 待办事项区（docs 9）：整页唯一要动手的地方，放在总览数字下面。
         跟改造前的「星光值任务」是同一块、同一个位置，改的是每条的生命周期 ——
         **开始和完成各抽一次精灵**（奖励完成，也奖励开始），做完就划掉 -->
    <div class="section-head tasks-head">
      <h2 class="section-title">今天要做的事</h2>
      <button class="btn btn-primary btn-sm" @click="openCreate">+ 新建</button>
    </div>

    <div v-if="state.tasks.length" class="task-list">
      <div
        v-for="task in state.tasks"
        :key="task.id"
        class="card task-card"
        :class="{ 'task-doing': task.status === 'doing' }"
      >
        <div class="task-main">
          <!-- 状态标记是**兄弟节点**，不塞进 .task-name 里面 —— 塞进去的话
               那元素的文本会变成「进行中写周报」，名字就跟状态粘在一起了 -->
          <div class="task-title">
            <span v-if="task.status === 'doing'" class="task-flag">进行中</span>
            <span class="task-name">{{ task.name }}</span>
          </div>
          <div class="task-meta">
            <!-- 待办说清下一步点哪个；进行中的提醒它是要做完的，不能就这么撂着 -->
            <template v-if="task.status === 'doing'">点「完成」划掉，这一步也抽一只精灵</template>
            <template v-else>点「开始」就抽一只精灵</template>
            <template v-if="Number(task.complete_count) > 0">
              · 以前完成过 <b class="number">{{ task.complete_count }}</b> 次
            </template>
          </div>
        </div>
        <div class="task-actions">
          <!-- 按钮**照着后端给的 actions 渲染**，前端不自己判断 status ——
               状态机只在 services/starlight.js 的 TASK_ACTIONS 里有一份，
               这里再写一遍 if (status === 'doing') 就早晚会跟后端走偏。
               这里只负责把动作 key 映射成按钮样式 -->
          <button
            v-for="act in task.actions"
            :key="act.key"
            class="btn btn-sm"
            :class="actionClass(act.key)"
            :disabled="actingId === task.id"
            @click="runAction(task, act)"
          >
            {{ actingId === task.id ? '···' : act.label }}
          </button>
          <button class="btn btn-primary btn-sm" @click="openEdit(task)">编辑</button>
        </div>
      </div>
    </div>

    <div v-else class="card empty-state">
      <div class="empty-state-icon">✨</div>
      <p>还没有要做的事。新建一条 —— 开始和完成各抽一次精灵</p>
    </div>

    <!-- 已完成 / 已放弃：划掉的东西沉到这儿（docs 9.5）。
         默认只展开最近几条，多的折起来 —— 待办做完是永久划掉的、只增不减，
         全展开会把页面撑爆，而人只看最近划掉的那几条 -->
    <div v-if="state.finished.length" class="finished-block">
      <button class="finished-head" @click="showAllFinished = !showAllFinished">
        <span class="finished-title">已完成 {{ state.finishedTotal }} 条</span>
        <span class="finished-toggle">{{ showAllFinished ? '收起' : '展开' }}</span>
      </button>
      <div class="finished-list">
        <div
          v-for="task in visibleFinished"
          :key="task.id"
          class="finished-row"
          :class="{ 'finished-abandoned': task.status === 'abandoned' }"
        >
          <span class="finished-name">{{ task.name }}</span>
          <span v-if="task.status === 'abandoned'" class="finished-tag">已放弃</span>
          <span class="finished-date">{{ formatTime(task.resolved_at) }}</span>
          <button class="finished-del" title="删掉这条记录" @click="removeTask(task)">×</button>
        </div>
      </div>
      <p v-if="!showAllFinished && hiddenFinished > 0" class="finished-more">
        更早的还有 {{ hiddenFinished }} 条
      </p>
    </div>

    <!-- 距下一颗的进度。
         **这里一个星光值的数字都不写** —— 用户要求星光值彻底不显示，
         只留「下一颗许愿星」和进度比例，比例就是下面这条进度条本身。
         原来右边写的是 `62 / 80`、下面还写「还差 18 星光值」，
         等于把内部计价单位摊在台面上，别再加回来。 -->
    <div class="card progress-card">
      <template v-if="state.nextCost !== null">
        <div class="progress-head">
          <span>距离下一颗许愿星</span>
          <span class="progress-tier">今天第 {{ state.todayCondensed + 1 }} / {{ state.maxDailyStars }} 颗</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <p class="progress-note">再攒一些就自动凝结出下一颗，不用手动收</p>
      </template>
      <template v-else>
        <div class="progress-head">
          <span>今天已经凝结满 {{ state.maxDailyStars }} 颗了</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill progress-fill-full"></div>
        </div>
        <p class="progress-note">
          星光值每天清零，明天重新开始 —— 已经凝结的许愿星和洛克贝都不受影响
        </p>
      </template>
    </div>

    <!-- 今日抽到的精灵 -->
    <div class="section-head">
      <h2 class="section-title">今日抽到的精灵</h2>
      <!-- 池子没读出来时别写「还剩 0 只」，那会被当成今天抽完了 -->
      <span v-if="state.poolTotal > 0" class="pool-note">还剩 {{ state.poolRemaining }} 只没抽到</span>
      <span v-else class="pool-note pool-note-error">精灵池没加载出来</span>
    </div>

    <div v-if="state.todayDraws.length" class="sprite-grid">
      <!-- key 用 id 不用编号：同一个编号下挂着本体 / 地区形态 / 首领化 / 异色，
           编号会重复，拿它当 key 会让 Vue 报重复 key 并且渲染错位 -->
      <button
        v-for="sprite in state.todayDraws"
        :key="sprite.id || sprite.at"
        class="sprite-card"
        :title="`点开看「${displayName(sprite)}」的详情`"
        @click="openDetail(sprite)"
      >
        <div class="sprite-thumb">
          <img v-if="!broken[sprite.id]" :src="cardImage(sprite)"
               :alt="displayName(sprite)" @error="markCardBroken(sprite)" />
          <span v-else class="sprite-placeholder">🔮</span>
          <span class="sprite-no">{{ sprite.number }}</span>
          <span v-if="sprite.isShiny" class="sprite-shiny shiny-mark" title="异色">
            <img class="shiny-ico" :src="shinyIcon" alt="异色" />
          </span>
        </div>
        <div class="sprite-name">{{ displayName(sprite) }}</div>
        <!-- 这里显示的是**基础值**（1200），加成靠后面那个 ×N 表示。
             小卡片放不下「12000 基础 1200×10」那么长的两截数字，而且一格里出现
             两个数反而要对半天。实际进账的数（12000）鼠标停上去就有。
             roco 为 null 是这次改动之前抽的老记录（那时候只记星光值），
             整行不出现比显示「+0 洛克贝」好。 -->
        <div v-if="sprite.roco != null" class="sprite-roco number">
          <img class="roco-ico" :src="rocoIcon" alt="" />{{ baseRoco(sprite) }}
          <span v-if="sprite.rocoMultiplier > 1" class="roco-boost" :title="rocoTitle(sprite)">
            ×{{ sprite.rocoMultiplier }}
          </span>
        </div>
      </button>
    </div>

    <div v-else class="card empty-state sprite-empty">
      <div class="empty-state-icon">🔍</div>
      <p v-if="state.poolTotal > 0">今天还没抽到精灵，完成一次星光值任务试试</p>
      <p v-else>没有读到精灵数据，检查一下数据目录里有没有 data/entities.json</p>
    </div>

    <!-- 流水。**只有洛克贝的**：星光值和许愿星的流水后端已经不往这里发了
         （老条目留在存储里，不显示）。所以这里不用再按 unit 过滤一遍 -->
    <h2 class="section-title logs-title">洛克贝流水</h2>
    <div class="card logs-card">
      <div class="logs-list">
        <div v-for="log in state.logs" :key="log.id" class="log-item">
          <div class="log-info">
            <div class="log-desc">{{ log.description }}</div>
            <div class="log-time">{{ formatTime(log.created_at) }}</div>
          </div>
          <div class="log-amount number" :class="log.type">
            <img class="roco-ico" :src="rocoIcon" alt="" />
            {{ log.type === 'income' ? '+' : '' }}{{ log.amount }}
          </div>
        </div>

        <div v-if="!state.logs.length" class="empty-state">
          <p>最近 7 天没有流水记录</p>
        </div>
      </div>
    </div>

    <p class="footnote">
      洛克贝和凝结出来的许愿星跟任务、抽卡那套星星分开记账 ——
      洛克贝能拿去下锅，凝结出来的许愿星暂时还不能兑换东西。
    </p>

    <!-- 新建 / 编辑弹框 -->
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <h3 class="modal-title">{{ editingId ? '编辑任务' : '新建星光值任务' }}</h3>

        <div class="form-group">
          <label class="label">任务名称</label>
          <input v-model="form.name" class="input" placeholder="比如：开始任务" @keyup.enter="save" />
        </div>

        <p class="form-hint">
          完成一次就从今天的精灵池里随机抽一只还没抽到过的精灵。
          这只精灵值多少洛克贝就加多少，攒的星光值够档位还会自动凝结成许愿星。
        </p>

        <p v-if="formError" class="form-error">{{ formError }}</p>

        <div class="modal-actions">
          <button class="btn btn-primary" @click="save">保存</button>
          <button class="btn" @click="closeModal">取消</button>
        </div>
      </div>
    </div>

    <!-- 精灵详情：点「今日抽到的精灵」里任意一张卡片打开。
         数据是跟着「今日抽到的精灵」一起从后端来的，点开就有，不转圈。 -->
    <div v-if="detail" class="modal-overlay" @click.self="closeDetail">
      <div class="modal spirit-modal">
        <button class="spirit-close" title="关闭" @click="closeDetail">✕</button>

        <div class="spirit-art">
          <img v-if="!artBroken && detail.artUrl" :src="detail.artUrl"
               :alt="detail.name" @error="artBroken = true" />
          <span v-else class="sprite-placeholder">🔮</span>
        </div>

        <h3 class="spirit-name">
          <span v-if="detail.isShiny" class="shiny-mark" title="异色">
            <img class="shiny-ico" :src="shinyIcon" alt="异色" />
          </span>
          {{ detail.name }}<span v-if="detail.isShiny" class="spirit-shiny-word">（异色）</span>
        </h3>
        <div class="spirit-no">No.{{ detail.number }}</div>

        <div class="spirit-tags">
          <span v-if="detail.formLabel" class="spirit-tag tag-form">{{ detail.formLabel }}</span>
          <span v-for="t in detail.types" :key="t" class="spirit-tag tag-type">{{ t }}</span>
          <span v-if="detail.kicker" class="spirit-tag">{{ detail.kicker }}</span>
          <span v-if="detail.stage" class="spirit-tag">{{ detail.stage }}</span>
          <span v-if="detail.season" class="spirit-tag">{{ detail.season }}</span>
        </div>

        <!-- 弹窗里也跟小卡片一样显示基础值 + ×N，两处对得上
             （弹窗写 12000、卡片写 1200 的话，又得解释一遍为什么不是一个数）。
             老记录没有 roco，整行不出现 -->
        <div v-if="detail.roco != null" class="spirit-roco number">
          <img class="roco-ico" :src="rocoIcon" alt="" />{{ baseRoco(detail) }}
          <span class="spirit-roco-unit">洛克贝</span>
          <span v-if="detail.rocoMultiplier > 1" class="roco-boost" :title="rocoTitle(detail)">
            ×{{ detail.rocoMultiplier }}
          </span>
        </div>

        <p v-if="detail.desc" class="spirit-desc">{{ detail.desc }}</p>
        <p v-else class="spirit-desc spirit-desc-empty">这只精灵没有收录介绍</p>
      </div>
    </div>

    <!-- 抽到精灵的下方浮窗：不挡操作，几秒后自己淡出。
         原来这里是任务列表上方的一块内嵌结果卡，问题跟任务页那个一样 ——
         弹出来会在页面里占一行位置，把下面的内容整体顶下去 -->
    <Toast :notice="notice" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useUserStore } from '../stores/user'
import { starlightApi, collectionApi } from '../api'
import Toast from '../components/Toast.vue'
// wiki 上标「异色外观」的那个小图标（57×56）。
// 详情页立绘切换那一排 tab 里就有它，193 只异色共用同一张 —— 所以它才是
// 「这只是异色」的官方标志，不是各写各的 emoji。见 docs/核心功能 7.8。
import shinyIcon from '../assets/shiny-icon.png'
// 洛克贝的官方图标（128×128 的金币），跟异色图标一样是从 wiki 上扒下来的那张，
// 不是在 emoji 里挑一个 —— 抽卡页面上「这是洛克贝」得跟游戏里长得是同一个东西
import rocoIcon from '../assets/roco-icon.png'

const userStore = useUserStore()

const emptyState = {
  date: '',
  // 当前星光值。**页面上不显示这个数**，只有进度条的比例用到它，
  // 所以这里留着但不写进任何一处模板文案
  value: 0,
  banked: 0,
  todayCondensed: 0,
  todayEarned: 0,
  rocoToday: 0,
  rocoTotal: 0,
  // 可花余额。**跟 rocoTotal 是两个数**：总数是累计获得、只涨不跌，
  // 余额才是被那口锅扣的那个（docs 8.1）。别把它们当成一个
  rocoBalance: 0,
  maxDailyStars: 25,
  nextCost: null,
  tasks: [],
  // 已完成 / 已放弃的待办（后端只给最近 N 条，finishedTotal 才是全量条数）
  finished: [],
  finishedTotal: 0,
  finishedLimit: 30,
  logs: [],
  todayDraws: [],
  poolRemaining: 0,
  poolTotal: 0
}

const state = ref({ ...emptyState })
// 抽到精灵的下方浮窗（或「今天抽完了」这类提示），几秒后自己消失
const notice = ref(null)
let noticeTimer = null

// 正在处理的任务 id（空串 = 没有请求在飞），用来在请求期间禁用这条的所有按钮。
// 开始 / 完成 / 放弃三个动作共用它 —— 它们都得防连点
const actingId = ref('')

// 已完成区是否展开到全部。默认只显示最近几条（见下面 visibleFinished）
const showAllFinished = ref(false)

// 折叠时显示几条。后端一次给 30 条（够展开用），默认先露 10 条
const FINISHED_PREVIEW = 10
const visibleFinished = computed(() => (
  showAllFinished.value
    ? state.value.finished
    : state.value.finished.slice(0, FINISHED_PREVIEW)
))

// 被折起来、没显示出来的条数，用来决定要不要说「更早的还有 N 条」。
// **必须拿 finishedTotal 减「真正显示出来的条数」，不能减 finished.length** ——
// 后端一次给 30 条，finishedTotal 是 14 的时候 14 > 14 为假，于是藏了 4 条
// 却一个字都不说，人会以为总共就这 10 条
const hiddenFinished = computed(() => (
  state.value.finishedTotal - visibleFinished.value.length
))

// 收集册（洛克贝的消费去向）。形状整体从后端来，前端一条自己的规则都不加 ——
// 「有哪些本、每本几格、每格多少钱」全在后端的数据文件里（docs 8.9）
const collections = ref({ rocoBalance: 0, rocoTotal: 0, books: [] })
// 正在买的那一格（空串 = 没有请求在飞）
const buyingId = ref('')
// 刚下锅的那一格：给它加个 class 播「掉进锅里」那一下，播完摘掉。
// 不摘的话下次再买别的东西它不会重播 —— CSS 动画只在 class 变化时触发一次
const droppingId = ref('')
let dropTimer = null

const isOwned = (book, item) => book.owned.includes(item.id)

// 头像加载失败（图还没拷全）就换成占位符，不显示破图。
// 按 id 记，不能按编号 —— 同一个编号下有好几只，其中一只缺图不该把另一只也变成占位符。
const broken = ref({})
const markBroken = (key) => {
  broken.value = { ...broken.value, [key]: true }
}

// 卡片上显示哪张图。
//
// 异色走**异色立绘**（images/shiny/ 里那张）：wiki 没给异色单独的头部特写，
// 193 只异色的头像跟本体是同一张，所以卡片上要是也用头像，异色和本体长得一模一样。
// 立绘只有异色这几张走，其余精灵还是用 11KB 的小头像。
const cardImage = (sprite) => {
  if (sprite.isShiny && sprite.artUrl && !broken.value[`${sprite.id}:art`]) return sprite.artUrl
  return sprite.headUrl
}

// 异色立绘万一取不到，退回本体的头像（至少还有张图），再不行才是占位符
const markCardBroken = (sprite) => {
  if (sprite.isShiny && sprite.artUrl && !broken.value[`${sprite.id}:art`]) {
    markBroken(`${sprite.id}:art`)
    return
  }
  markBroken(sprite.id)
}

// 精灵详情弹窗。数据跟着「今日抽到的精灵」一起来，所以这里只是把已经拿到的那条
// 展开，不重新请求（详情字段见后端 spirits.js 的 enrichDraw）。
const detail = ref(null)
// 立绘加载失败时退回占位符。立绘是 1024×1024 的大图，采集没跑完的话可能缺
const artBroken = ref(false)

const openDetail = (sprite) => {
  artBroken.value = false
  detail.value = sprite
}

const closeDetail = () => {
  detail.value = null
}

// 异色在 wiki 上不是独立条目，名字跟本体逐字相同（193 只全是这样），
// 所以卡片和弹窗上都补一个「（异色）」，不然看起来就是同一只精灵抽到了两次
const displayName = (sprite) => (sprite.isShiny ? `${sprite.name}（异色）` : sprite.name)

// 洛克贝的加成：异色 ×10，每个形态标签（地区形态 / 首领化各算一个）再 ×2，
// 所以倍率是 1 / 2 / 4 / 10 / 20 / 40 —— **跟星光值那套（1/2/4/8）不是一套**，
// 别把两边的函数或常量混着用。前端只管显示，判据留在后端一处，
// 免得两边规则各写一遍再慢慢走偏。
//
// 卡片和弹窗上那行显示的是**基础值**（1200），加成靠后面那个 ×10 表示。
// 记录里存的 roco 是加完加成的数（12000），所以要知道基础值得除回去。
//
// 除回去就够，不用后端多发一个字段 —— 但**除数必须是当时那次的倍率**，不能按
// 当前的规则重算：洛克贝这套规则以后要是改了，老记录一重算，除出来的基础值
// 就跟着错。所以后端存记录时把倍率一起写进去了，这里读到的是当时那份。
// 老记录（这次改动之前抽的）根本没有 roco，调用方先判 null 再进来。
const baseRoco = (sprite) => Math.round(sprite.roco / (sprite.rocoMultiplier || 1))

// 屏幕上只剩基础值了，实际进账多少就靠这句：鼠标停在小标上能看全。
//
// 「×10 · ×2」这两段是**分开写的**，不是笼统的「×20」—— 20 倍是异色和形态
// 两件事叠出来的，只写 20 看不出这一点。后端只有在两段乘起来正好等于记录里
// 那个总倍率时才把这俩因子给出来（见 spirits.js 的 rocoParts），给不出来
// 就退回笼统写法，总之不能写出对不上账的说明。
const rocoTitle = (sprite) => {
  const parts = []
  if (sprite.rocoShinyMultiplier > 1) parts.push(`异色 ×${sprite.rocoShinyMultiplier}`)
  if (sprite.rocoFormMultiplier > 1) parts.push(`${sprite.formLabel || '特殊形态'} ×${sprite.rocoFormMultiplier}`)
  const boost = parts.length ? parts.join(' · ') : `${sprite.formLabel || '特殊形态'} ×${sprite.rocoMultiplier}`
  return `图鉴洛克贝 ${baseRoco(sprite)}，${boost}，本次获得 ${sprite.roco} 洛克贝`
}

const showModal = ref(false)
const editingId = ref('')
const form = ref({ name: '' })
const formError = ref('')

const progressPercent = computed(() => {
  if (!state.value.nextCost) return 100
  const pct = (state.value.value / state.value.nextCost) * 100
  return Math.min(100, Math.max(0, pct))
})

const fetchState = async () => {
  try {
    const res = await starlightApi.getState(userStore.userId)
    if (res.code === 0) {
      state.value = { ...emptyState, ...res.data }
    }
  } catch (error) {
    console.error('Fetch starlight state error:', error)
  }
}

const fetchCollections = async () => {
  try {
    const res = await collectionApi.getState(userStore.userId)
    if (res.code === 0) {
      collections.value = res.data
    }
  } catch (error) {
    console.error('Fetch collections error:', error)
  }
}

const openCreate = () => {
  editingId.value = ''
  form.value = { name: '' }
  formError.value = ''
  showModal.value = true
}

const openEdit = (task) => {
  editingId.value = task.id
  form.value = { name: task.name }
  formError.value = ''
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
}

// 前端也校验一遍，省得为一个手滑的输入跑一趟后端
const validateForm = () => {
  if (!form.value.name.trim()) return '任务名称不能为空'
  return ''
}

const save = async () => {
  const error = validateForm()
  if (error) {
    formError.value = error
    return
  }

  const payload = { name: form.value.name.trim() }

  try {
    const res = editingId.value
      ? await starlightApi.updateTask(editingId.value, payload)
      : await starlightApi.createTask({ userId: userStore.userId, ...payload })

    if (res.code === 0) {
      closeModal()
      await fetchState()
    } else {
      formError.value = res.message || '保存失败'
    }
  } catch (error) {
    formError.value = '保存失败'
  }
}

// **只有已完成区调这个** —— 待办 / 进行中的不给删除按钮，不想做了走「放弃」
// （放弃会留一条记录，删除是把痕迹也抹掉，那是两回事，见 docs 9.5 / 9.6）
const removeTask = async (task) => {
  if (!confirm(`确定删掉「${task.name}」这条记录吗？`)) return

  try {
    const res = await starlightApi.deleteTask(task.id)
    if (res.code === 0) {
      await fetchState()
    }
  } catch (error) {
    alert('删除失败')
  }
}

// 浮窗几秒后自己淡出，连续点「完成」不会被挡住
const showNotice = (payload, type = 'success') => {
  notice.value = { type, ...payload }
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = null
  }, 3500)
}

// 动作 key → 接口。三个动作长得一样，只有「放弃」不抽卡
const ACTION_API = {
  start: starlightApi.startTask,
  complete: starlightApi.completeTask,
  abandon: starlightApi.abandonTask
}

// 动作 key → 按钮样式。开始和完成共用绿色：**它俩永不同时出现**（待办上只有开始，
// 进行中只有完成，由后端的状态机保证），所以不用担心分不清哪个是主行动。
// 放弃用红色：它不可逆（划掉就进已完成区了），得有点分量
const actionClass = (key) => (key === 'abandon' ? 'btn-danger' : 'btn-success')

// 一条待办的一个动作。act 是后端 actions 数组里的那一项（{ key, label, draw }）
const runAction = async (task, act) => {
  // 放弃是不可逆的，问一下。「开始」和「完成」不问 —— 完成本来就是这一步的终点，
  // 多一次确认反而把「点一下就有奖励」的手感打断了
  if (act.key === 'abandon' && !confirm(`确定放弃「${task.name}」吗？放弃之后不能再抽卡了。`)) return

  // 一次只放一个动作过去。浮窗是不挡操作的（点按钮不会被弹窗挡住），
  // 所以更得防连点：连点两下「开始」会一条任务抽走两只精灵，还破坏「不放回」的语义。
  // 后端有一把按用户分的锁兜底，这里挡在第一线。
  if (actingId.value) return
  actingId.value = task.id

  try {
    const res = await ACTION_API[act.key](task.id)

    if (res.code === 0) {
      state.value = { ...state.value, ...res.data.state }

      if (res.data.spirit) {
        // 「开始」和「完成」都抽到了精灵 → 弹结果卡
        showSpiritNotice(res.data)
      } else if (res.data.noDraw) {
        // 完成了，但今天精灵抽完了：**事记上了、只是没抽到卡**。不说一声的话
        // 会以为这条白干了（后端为什么放行见 docs 9.3）
        showNotice({ text: `「${res.data.taskName}」记上了 · ${res.data.noDraw}` }, 'error')
      }
      // 「放弃」两样都没有：划掉就行，不弹东西
    } else {
      // 状态不对（对一条待办点「完成」）和「今天的精灵都抽完了」都走这里，
      // 用同一条浮窗提示，不弹 alert 打断
      showNotice({ text: res.message || `${act.label}失败` }, 'error')
    }
  } catch (error) {
    showNotice({ text: `${act.label}失败` }, 'error')
  } finally {
    actingId.value = ''
  }
}

// 抽到精灵的浮窗：头像 + 本次进账的洛克贝（倍率用小标跟在后面）。
//
// 只有这里写**实际进账**的数（+24000），跟小卡片 / 弹窗上的 1200×10 故意不一样：
// 这句是个 `+N` 的记账，写基础值等于报错账。后面那个 1200×10 就是给人对账用的。
//
// **标题写的是「因为哪一步给的」**（docs 9.9）：「开始」和「完成」都弹这张卡，
// 光看「抽到妙蛙种子」分不出是开始还是完成给的奖励。精灵名字挪到下面那行。
const showSpiritNotice = (data) => {
  const spirit = data.spirit
  const condensed = data.state && data.state.condensedNow > 0
    ? ` · 凝结出 ${data.state.condensedNow} 颗许愿星`
    : ''
  const label = data.action === 'start' ? '开始' : '完成'

  showNotice({
    // 头像加载失败过就整块不传，让 Toast 那格不渲染（不然是个破图）
    thumb: broken.value[spirit.id] ? '' : cardImage(spirit),
    title: `${label}「${data.taskName}」`,
    text: `No.${spirit.number} ${displayName(spirit)} · +${data.rocoEarned} 洛克贝${condensed}`,
    badge: spirit.rocoMultiplier > 1
      ? { text: `${baseRoco(spirit)}×${spirit.rocoMultiplier}`, title: rocoTitle(spirit) }
      : null
  })
}

// 往锅里下一样东西。
//
// 买不成（洛克贝不够 / 已经买过）**不是错误，就是没买成**，走同一条浮窗提示，
// 不弹 alert 打断 —— 跟「今天的精灵都抽完了」一个处理方式。
const buyDish = async (book, item) => {
  if (buyingId.value) return
  buyingId.value = item.id

  try {
    const res = await collectionApi.buy(book.id, {
      userId: userStore.userId,
      itemId: item.id
    })

    if (res.code === 0) {
      // 响应里带的是**整份最新进度**（前端直接整体换掉，不用自己拼），
      // 但流水不在里面，所以还要拉一次 state —— 不然买完流水还是旧的
      collections.value = res.data
      await fetchState()

      droppingId.value = item.id
      clearTimeout(dropTimer)
      dropTimer = setTimeout(() => { droppingId.value = '' }, 1200)

      const fresh = res.data.books.find((b) => b.id === book.id)
      showNotice({
        title: `${book.action}「${item.name}」`,
        text: res.data.justDone
          ? `-${res.data.bought.price} 洛克贝 · ${book.doneTitle} 🎉`
          : `-${res.data.bought.price} 洛克贝 · 还差 ${fresh.totalCount - fresh.ownedCount} 样`
      })
    } else {
      showNotice({ text: res.message || '买不了' }, 'error')
    }
  } catch (error) {
    showNotice({ text: '买不了' }, 'error')
  } finally {
    buyingId.value = ''
  }
}

// **一律 Number() 一下再交给 Date**：这个页面里的时间戳来源不止一种 ——
// 流水是从 zset 里 JSON.parse 出来的数字，收集册的 doneAt 是后端 parseInt 过的数字，
// 而待办的 resolved_at 是从 hash 里出来的**字符串**。`new Date('1789...')`
// 解析不了数字字符串，会安静地给你一个 Invalid Date（页面上就显示 "Invalid Date"）
const formatTime = (timestamp) => {
  return new Date(Number(timestamp)).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(() => {
  fetchState()
  fetchCollections()
})

// 切换页面时那两个定时器还挂在那儿，会把已经卸掉的组件里的 ref 再改一次
onUnmounted(() => {
  clearTimeout(noticeTimer)
  clearTimeout(dropTimer)
})
</script>

<style scoped>
/* 这一页不再单独限宽：跟着外层 .main-content 用满 1200px，
   否则右边会空出一大块（精灵小卡片那一排也正好铺开） */

.page-subtitle {
  margin: -1rem 0 1.5rem;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.45);
}

/* 许愿星、洛克贝各一张卡，并排。窄屏（见文件末尾的媒体查询）改回上下两张 */
.overview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.overview-card {
  text-align: center;
}

.overview-label {
  font-size: 0.85rem;
  color: #B0B0B0;
  margin-bottom: 0.5rem;
}

/* 许愿星那套数用蓝色、洛克贝用金色（.overview-roco），两个体系的颜色从总览
   一路贯到进度条、卡片和流水 —— 并排放的两个数颜色一样的话，
   扫一眼分不出哪个是哪个 */
.overview-value {
  font-size: 2.4rem;
  line-height: 1.1;
  color: #7FB2FF;
  text-shadow: 0 0 24px rgba(127, 178, 255, 0.3);
  word-break: break-all;
}

.overview-roco {
  color: #FFD700;
  text-shadow: 0 0 24px rgba(255, 215, 0, 0.3);
}

.overview-unit {
  font-size: 0.9rem;
  margin-left: 0.35rem;
  color: #B0B0B0;
  text-shadow: none;
}

/* 大数下面那行「今天 +N」：比总数小一圈，免得两个数打架 */
.overview-today {
  margin-top: 0.6rem;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.45);
}

.overview-today b {
  color: #7FB2FF;
}

.overview-today b.today-roco {
  color: #FFD700;
}

/* 「可花余额」那一行。跟上面两行用一条虚线隔开 —— 上面是「攒了多少」，
   这一行是「还能花多少」，是两件事，不隔开容易被当成同一笔账的另一种说法 */
.overview-balance {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px dashed rgba(255, 215, 0, 0.25);
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.5);
}

.overview-balance b {
  color: #FFD700;
}

/* 洛克贝图标。跟着字走，所以用 vertical-align 而不是 flex —— 它出现在标题、
   卡片、流水好几个高度不一样的地方 */
.roco-ico {
  width: 1.05em;
  height: 1.05em;
  vertical-align: -0.18em;
  margin-right: 0.25rem;
}

.progress-card {
  margin-bottom: 1.5rem;
}

.progress-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 0.9rem;
  color: #B0B0B0;
  margin-bottom: 0.6rem;
}

/* 右上角「今天第 2 / 25 颗」。**这里不写星光值**，只报颗数 */
.progress-tier {
  color: #7FB2FF;
}

.progress-track {
  height: 10px;
  border-radius: 6px;
  background: rgba(26, 26, 46, 0.9);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 6px;
  background: linear-gradient(90deg, #4A90D9 0%, #7FB2FF 100%);
  transition: width 0.35s ease;
}

/* 凝满 25 颗那条满格。宽度写死在 CSS 里而不是靠 progressPercent ——
   那时候 nextCost 是 null，算出来的是个假比例 */
.progress-fill-full {
  width: 100%;
}

.progress-note {
  margin-top: 0.6rem;
  font-size: 0.85rem;
  color: #B0B0B0;
}

/* 以前这里有一整块「抽到精灵的结果卡」（.result-card / .result-thumb / .result-fade
   等），现在提示改走下方浮窗、CSS 跟着共用组件 components/Toast.vue 走了，整块删掉。
   别再加回来：内嵌结果卡会在页面里占一行位置，弹出来把下面的内容顶下去。
   注意下面 .shiny-mark / .roco-boost 那几个是**小卡片和详情弹窗也在用**的，
   别跟着一起删（它们长得像，但不是这一块的） */

/* 今日抽到的精灵：小卡片平铺 */
.sprite-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
  gap: 0.85rem;
  margin-bottom: 2rem;
}

/* 整张卡是个 <button>（点开精灵详情），所以得先把浏览器的默认按钮样式清掉，
   否则会顶着一圈灰色凸起和系统字体，跟旁边的卡片对不上 */
.sprite-card {
  font: inherit;
  color: inherit;
  width: 100%;
  background: rgba(22, 33, 62, 0.8);
  border: 1px solid rgba(74, 144, 217, 0.2);
  border-radius: 12px;
  padding: 0.6rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.sprite-card:hover {
  border-color: rgba(74, 144, 217, 0.6);
  background: rgba(74, 144, 217, 0.14);
  transform: translateY(-2px);
}

.sprite-card:active {
  transform: translateY(0);
}

/* 「这只是异色」的官方标志：wiki 上用的小图标（57×56，193 只异色共用同一张）。
   异色的名字和头像跟本体逐字一样，只看卡片分不出是哪一只，所以得有这个角标。

   两处坑：
   1. 图标是灰色线稿，直接放深色卡上几乎看不见 → 垫一层金底、把线稿压成深色。
      但 filter 会连元素**自己的背景**一起算，所以金底必须是外面这层 <span>，
      把 filter 加在里面的 <img> 上。加到金底上会把金底一起 brightness(0) 压黑。
   2. 这条 img 规则比下面那条 `.sprite-thumb img` 多一个 class 才压得住它 ——
      否则缩略图那条 width/height:100% 会把这个角标撑满整格，糊住立绘。 */
.shiny-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(255, 215, 0, 0.9);
}

.shiny-mark img.shiny-ico {
  width: 14px;
  height: 14px;
  object-fit: contain;
  filter: brightness(0) opacity(0.8);
}

.sprite-thumb .sprite-shiny {
  position: absolute;
  top: 0;
  right: 0;
  width: 20px;
  height: 20px;
}

.sprite-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sprite-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.sprite-placeholder {
  font-size: 2rem;
  opacity: 0.5;
}

.sprite-no {
  position: absolute;
  top: 0;
  left: 0;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(26, 26, 46, 0.9);
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.sprite-name {
  margin-top: 0.4rem;
  font-size: 0.8rem;
  line-height: 1.35;
  word-break: break-all;
}

.sprite-roco {
  margin-top: 0.2rem;
  font-size: 0.8rem;
  color: #FFD700;
}

.sprite-empty {
  margin-bottom: 2rem;
}

/* 加成的「×N」小标（2/4/10/20/40）。数字上写的是图鉴基础值，这个标说明进账
   还要再翻，不然用户会以为拿到的就是 1200。实际到手多少在 title 里 */
.roco-boost {
  display: inline-block;
  margin-left: 0.3rem;
  padding: 0 5px;
  border-radius: 6px;
  background: rgba(255, 215, 0, 0.16);
  border: 1px solid rgba(255, 215, 0, 0.45);
  color: #FFD700;
  font-size: 0.7rem;
  line-height: 1.6;
  vertical-align: 1px;
  cursor: help;
}

/* ---- 精灵详情弹窗 ---- */

.spirit-modal {
  position: relative;
  max-width: 420px;
  text-align: center;
}

.spirit-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: #B0B0B0;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.spirit-close:hover {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

/* 立绘是 1024×1024 的方图。限一下尺寸，不然矮屏幕上整张弹窗要滚动才能看完 */
.spirit-art {
  width: 100%;
  max-width: 300px;
  margin: 0 auto;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: radial-gradient(circle at 50% 45%, rgba(74, 144, 217, 0.22) 0%, rgba(26, 26, 46, 0.9) 70%);
  border: 1px solid rgba(74, 144, 217, 0.25);
  overflow: hidden;
}

.spirit-art img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.spirit-name {
  margin-top: 1rem;
  font-size: 1.35rem;
  font-weight: 700;
  color: #FFD700;
}

.spirit-shiny-word {
  font-size: 0.9rem;
}

/* 弹窗里同一张「异色外观」图标，跟名字排在一行 */
.spirit-name .shiny-mark {
  width: 20px;
  height: 20px;
  margin-right: 0.35rem;
  vertical-align: -4px;
}

.spirit-no {
  margin-top: 0.2rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.4);
  font-variant-numeric: tabular-nums;
}

.spirit-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  justify-content: center;
  margin-top: 0.75rem;
}

.spirit-tag {
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.75rem;
  color: #B0B0B0;
}

/* 形态标签回答的是「这只是什么来头」，给个区分色；属性用蓝色 */
.spirit-tag.tag-form {
  background: rgba(255, 215, 0, 0.12);
  border-color: rgba(255, 215, 0, 0.35);
  color: #FFD700;
}

.spirit-tag.tag-type {
  background: rgba(74, 144, 217, 0.15);
  border-color: rgba(74, 144, 217, 0.4);
  color: #7FB2FF;
}

.spirit-roco {
  margin-top: 0.85rem;
  font-size: 1.2rem;
  color: #FFD700;
}

.spirit-roco-unit {
  margin-left: 0.3rem;
  font-size: 0.8rem;
  color: #B0B0B0;
}

.spirit-desc {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(74, 144, 217, 0.15);
  font-size: 0.88rem;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.75);
  text-align: left;
}

.spirit-desc-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.35);
}

.pool-note {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.45);
}

/* 数据目录配错时用警告色，别让人以为只是「今天抽完了」 */
.pool-note-error {
  color: #FF8A80;
}

.tasks-head {
  margin-top: 0.5rem;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-title {
  font-size: 1.3rem;
  color: #B0B0B0;
}

.logs-title {
  margin-top: 2rem;
  margin-bottom: 1rem;
}

.btn-sm {
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.task-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.task-title {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.3rem;
}

.task-name {
  font-size: 1.05rem;
  font-weight: 700;
}

.task-meta {
  font-size: 0.85rem;
  color: #B0B0B0;
}

.task-meta b {
  color: #7FB2FF;
}

.task-actions {
  display: flex;
  gap: 0.5rem;
}

/* 进行中：这一条是「现在手上这件事」，得从一列待办里跳出来。
   金色描边 + 一点光晕，跟待办（蓝边卡片）分开 */
.task-doing {
  border-color: rgba(255, 215, 0, 0.45);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 18px rgba(255, 215, 0, 0.12);
}

.task-flag {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 700;
  color: #1A1A2E;
  background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
  border-radius: 999px;
  padding: 0.12rem 0.55rem;
}

/* ---- 已完成区（划掉的东西沉到这儿，docs 9.5）---- */

.finished-block {
  margin-top: 1rem;
}

.finished-head {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: none;
  border: none;
  border-top: 1px dashed rgba(255, 255, 255, 0.12);
  padding: 0.85rem 0.25rem 0.5rem;
  cursor: pointer;
  font-family: 'Nunito', sans-serif;
  color: #B0B0B0;
  font-size: 0.9rem;
  font-weight: 700;
  transition: color 0.3s ease;
}

.finished-head:hover {
  color: #fff;
}

.finished-toggle {
  font-size: 0.82rem;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.45);
}

.finished-list {
  display: flex;
  flex-direction: column;
}

.finished-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.25rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

/* 「划掉」就真的划掉：一条删除线。这是这一区的全部视觉重点 */
.finished-name {
  flex: 1;
  font-size: 0.92rem;
  color: rgba(255, 255, 255, 0.5);
  text-decoration: line-through;
  text-decoration-color: rgba(255, 255, 255, 0.35);
}

/* 放弃的比完成的更淡一点，再挂个标签 —— 它跟「做完了」不是一回事 */
.finished-abandoned .finished-name {
  color: rgba(255, 255, 255, 0.32);
  text-decoration-color: rgba(255, 255, 255, 0.22);
}

.finished-tag {
  font-size: 0.7rem;
  color: rgba(231, 76, 60, 0.85);
  border: 1px solid rgba(231, 76, 60, 0.35);
  border-radius: 999px;
  padding: 0.05rem 0.4rem;
  white-space: nowrap;
}

.finished-date {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.32);
  white-space: nowrap;
}

.finished-del {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.25);
  font-size: 1.05rem;
  line-height: 1;
  padding: 0 0.25rem;
  cursor: pointer;
  transition: color 0.2s ease;
}

.finished-del:hover {
  color: #E74C3C;
}

.finished-more {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.35);
  text-align: center;
  padding: 0.6rem 0 0;
}

.form-hint {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.5;
  margin-bottom: 0.5rem;
}

.form-error {
  color: #E74C3C;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.logs-card {
  padding: 0.5rem 1.5rem;
}

.logs-list {
  max-height: 420px;
  overflow-y: auto;
}

.log-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.9rem 0;
  border-bottom: 1px solid rgba(74, 144, 217, 0.1);
}

.log-item:last-child {
  border-bottom: none;
}

.log-desc {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.log-time {
  font-size: 0.85rem;
  color: #B0B0B0;
}

.log-amount {
  font-size: 1rem;
  white-space: nowrap;
}

.log-amount.income {
  color: #2ECC71;
}

.log-amount.expenditure {
  color: #E74C3C;
}

.footnote {
  margin-top: 1.5rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.35);
  text-align: center;
}

/* ---------- 收集册（洛克贝的消费去向）---------- */

.collection-card {
  margin-bottom: 1.5rem;
}

.collection-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

/* 标题自带的 margin 在这里由 .collection-head 统一管，去掉免得顶开一行 */
.collection-head .section-title {
  margin-bottom: 0;
}

.collection-progress {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
}

.collection-progress b {
  color: #FFD700;
}

/* 锅。**要看着像一口锅，不能是一块棕色面板上摆一排卡**（docs 8.5）。
   三件事一起做才有锅感：顶上一条亮锅沿、上沿方锅底圆（border-radius 上小下大）、
   汤色从中间往边上暗下去（radial 而不是 linear，linear 看着像一块布）。
   overflow: hidden 是为了让冒上来的泡泡到顶就消失，不会飘到锅外面去 */
.pot {
  position: relative;
  overflow: hidden;
  /* 上面留出锅沿那一条的高度 */
  padding: 2rem 1rem 1.5rem;
  border-radius: 14px 14px 46px 46px;
  background: radial-gradient(130% 100% at 50% 8%, #93502A 0%, #6B3D22 42%, #3A2113 100%);
  border: 3px solid rgba(255, 200, 140, 0.4);
  box-shadow: inset 0 10px 26px rgba(0, 0, 0, 0.5);
  transition: box-shadow 0.6s ease, border-color 0.6s ease;
}

/* 锅沿：顶上那一条金属亮带。没有它整块就是个圆角矩形 */
.pot::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 18px;
  background: linear-gradient(180deg, #E0Ac72 0%, #A9713F 55%, rgba(120, 70, 35, 0) 100%);
  border-bottom: 1px solid rgba(255, 225, 185, 0.4);
  pointer-events: none;
}

/* 集齐之后整锅发光，永久保留（docs 8.4）。发光是**常驻的**，
   不是播一次就停 —— 它是「这一锅齐了」的状态，不是一次性的庆祝 */
.pot-done {
  border-color: rgba(255, 215, 0, 0.75);
  animation: potGlow 2.4s ease-in-out infinite;
}

@keyframes potGlow {
  0%, 100% { box-shadow: inset 0 10px 26px rgba(0, 0, 0, 0.5), 0 0 14px rgba(255, 215, 0, 0.4); }
  50%      { box-shadow: inset 0 10px 26px rgba(0, 0, 0, 0.5), 0 0 30px rgba(255, 215, 0, 0.75); }
}

/* 冒泡那层。**pointer-events: none** —— 它盖在格子上，不关掉的话
   「买」按钮就点不着了 */
.pot-bubbles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.bubble {
  position: absolute;
  bottom: -14px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(255, 240, 215, 0.4);
  border: 1px solid rgba(255, 240, 215, 0.55);
  /* 8 个泡泡靠 --i 错开位置和节奏，看着才是「一直在冒」而不是整齐地一起动 */
  left: calc(4% + var(--i) * 11.8%);
  animation: bubbleUp 3.4s ease-in infinite;
  animation-delay: calc(var(--i) * -0.46s);
}

@keyframes bubbleUp {
  0%   { transform: translateY(0) scale(0.5); opacity: 0; }
  15%  { opacity: 1; }
  100% { transform: translateY(-210px) scale(1.2); opacity: 0; }
}

/* 格子。**18 格全在这儿，没买的也在** —— 空格子看得见才有集齐的冲动，
   这是「收集册」跟「商店」的区别（docs 8.5）。

   背景特意很淡：深色块一铺满，格子就变成「一排卡片」，汤和泡泡全被挡住，
   锅感立刻没了。留一点暗底是为了让没买的剪影在棕色汤上还能看清 */
.pot-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0.6rem;
}

.dish {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.5rem 0.25rem;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.14);
  transition: background 0.35s ease;
}

.dish-emoji {
  font-size: 1.8rem;
  line-height: 1.2;
  /* 没买的是**同一个 emoji 压黑**，不另做一套剪影图（docs 8.5）。
     压成 0.3 透明度让它看着像「浮在汤里的暗影」而不是一坨纯黑 */
  filter: brightness(0) opacity(0.38);
  transition: filter 0.35s ease;
}

.dish-owned {
  background: rgba(255, 215, 0, 0.1);
}

.dish-owned .dish-emoji {
  filter: none;
}

.dish-name {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.35);
}

.dish-owned .dish-name {
  color: rgba(255, 255, 255, 0.75);
}

/* 「买」按钮。价格直接写在按钮上 —— 点之前就得知道要花多少。
   洛克贝不够时禁用（不是点击后再报错），禁用态由全局 .btn:disabled 的
   opacity 处理，这里只补一个 cursor */
.dish-buy {
  margin-top: 0.15rem;
  padding: 0.15rem 0.4rem;
  border: 1px solid rgba(255, 215, 0, 0.4);
  border-radius: 8px;
  background: rgba(255, 215, 0, 0.12);
  color: #FFD700;
  font-family: 'Poppins', sans-serif;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease;
}

.dish-buy:hover:not(:disabled) {
  background: rgba(255, 215, 0, 0.26);
}

.dish-buy:disabled {
  cursor: not-allowed;
}

.dish-buy .roco-ico {
  width: 0.9em;
  height: 0.9em;
  margin-right: 0.1rem;
}

/* 下锅那一下：**从上方掉下来、回弹一下**。这是整个功能的核心体验（docs 8.5）。
   用 animation 不用 transition —— 它只播一次，播完就停在正常位置，
   靠 JS 到点摘 class 收尾 */
.dish-dropping {
  animation: dishDrop 1.1s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes dishDrop {
  0%   { transform: translateY(-120px) scale(1.5) rotate(-12deg); opacity: 0; }
  55%  { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; }
  70%  { transform: translateY(4px) scale(0.94); }
  85%  { transform: translateY(-3px) scale(1.04); }
  100% { transform: translateY(0) scale(1); }
}

.pot-note {
  margin-top: 0.75rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.35);
  text-align: center;
}

.pot-done-note {
  margin-top: 0.75rem;
  font-size: 0.85rem;
  color: #FFD700;
  text-align: center;
}

@media (max-width: 768px) {
  .overview {
    grid-template-columns: 1fr;
  }

  .task-card {
    flex-direction: column;
    align-items: flex-start;
  }

  /* 6 列在窄屏上每格不到 50px，emoji 和价格会挤成一团，退到 3 列 */
  .pot-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>

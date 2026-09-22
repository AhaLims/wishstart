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
      </div>
    </div>

    <!-- 星光值任务：整页唯一要动手的地方，放在总览数字下面 -->
    <div class="section-head tasks-head">
      <h2 class="section-title">星光值任务</h2>
      <button class="btn btn-primary btn-sm" @click="openCreate">+ 新建任务</button>
    </div>

    <div v-if="state.tasks.length" class="task-list">
      <div v-for="task in state.tasks" :key="task.id" class="card task-card">
        <div class="task-main">
          <div class="task-name">{{ task.name }}</div>
          <div class="task-meta">
            完成一次抽一只精灵 ·
            已完成 <b class="number">{{ task.complete_count }}</b> 次
          </div>
        </div>
        <div class="task-actions">
          <button
            class="btn btn-success btn-sm"
            :disabled="completingId === task.id"
            @click="completeTask(task)"
          >
            {{ completingId === task.id ? '抽取中...' : '完成' }}
          </button>
          <button class="btn btn-primary btn-sm" @click="openEdit(task)">编辑</button>
          <button class="btn btn-danger btn-sm" @click="removeTask(task)">删除</button>
        </div>
      </div>
    </div>

    <div v-else class="card empty-state">
      <div class="empty-state-icon">✨</div>
      <p>还没有星光值任务，新建一个开始攒许愿星和洛克贝吧</p>
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

    <!-- 抽到精灵的结果卡：不挡操作，几秒后自己淡出 -->
    <Transition name="result-fade">
      <div v-if="result" class="card result-card" :class="{ 'result-error': result.error }">
        <template v-if="result.error">
          <span class="result-error-text">{{ result.error }}</span>
        </template>
        <template v-else>
          <div class="result-title">抽到精灵啦</div>
          <div class="result-body">
            <div class="result-thumb">
              <img v-if="!broken[result.spirit.id]" :src="cardImage(result.spirit)"
                   :alt="displayName(result.spirit)" @error="markCardBroken(result.spirit)" />
              <span v-else class="sprite-placeholder">🔮</span>
            </div>
            <div class="result-info">
              <div class="result-name">
                <span v-if="result.spirit.isShiny" class="shiny-mark" title="异色">
                  <img class="shiny-ico" :src="shinyIcon" alt="异色" />
                </span>
                {{ displayName(result.spirit) }}
              </div>
              <!-- 只有这里写**实际进账**的数（+24000），跟小卡片 / 弹窗上的
                   1200×10 故意不一样：这句是个 `+N` 的记账，写基础值等于报错账。
                   后面那个 1200×10 就是给人对账用的 -->
              <div class="result-roco number">
                +{{ result.rocoEarned }} <span class="result-unit">洛克贝</span>
                <span
                  v-if="result.spirit.rocoMultiplier > 1"
                  class="roco-boost"
                  :title="rocoTitle(result.spirit)"
                >
                  {{ baseRoco(result.spirit) }}×{{ result.spirit.rocoMultiplier }}
                </span>
              </div>
              <div class="result-no">No.{{ result.spirit.number }}</div>
            </div>
          </div>
          <!-- 凝结不再写「消耗 N 星光值」：那个数就是星光值，页面上不显示 -->
          <p v-if="result.condensedNow > 0" class="result-condense">
            这一下刚好够档位，自动凝结出 {{ result.condensedNow }} 颗许愿星
          </p>
        </template>
      </div>
    </Transition>

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
      洛克贝和凝结出来的许愿星跟任务、抽卡那套星星分开记账，暂时还不能兑换东西。
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { starlightApi } from '../api'
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
  maxDailyStars: 25,
  nextCost: null,
  tasks: [],
  logs: [],
  todayDraws: [],
  poolRemaining: 0,
  poolTotal: 0
}

const state = ref({ ...emptyState })
// 抽到精灵的结果卡（或「今天抽完了」这类提示），几秒后自己消失
const result = ref(null)
let resultTimer = null

// 正在抽精灵的任务 id（空串 = 没有请求在飞），用来在请求期间禁用「完成」按钮
const completingId = ref('')

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

const removeTask = async (task) => {
  if (!confirm(`确定要删除「${task.name}」吗？`)) return

  try {
    const res = await starlightApi.deleteTask(task.id)
    if (res.code === 0) {
      await fetchState()
    }
  } catch (error) {
    alert('删除失败')
  }
}

// 结果卡几秒后自己淡出，连续点「完成」不会被挡住
const showResult = (payload) => {
  result.value = payload
  clearTimeout(resultTimer)
  resultTimer = setTimeout(() => {
    result.value = null
  }, 6000)
}

const completeTask = async (task) => {
  // 正在抽精灵的任务 id。结果卡是不挡操作的（点完成不会被弹窗挡住），
  // 所以更得防连点：连点两下会一次任务抽走两只精灵，还破坏「不放回」的语义。
  // 后端有一把按用户分的锁兜底，这里挡在第一线。
  if (completingId.value) return
  completingId.value = task.id

  try {
    const res = await starlightApi.completeTask(task.id)

    if (res.code === 0) {
      state.value = { ...state.value, ...res.data.state }
      showResult({
        spirit: res.data.spirit,
        // 这次进账的洛克贝。**不是星光值** —— 页面上不显示星光值
        rocoEarned: res.data.rocoEarned,
        // 这一下刚好够档位，凝结是当次就发生的，得说一声，不然星星是哪儿来的会看不懂
        condensedNow: res.data.state.condensedNow
      })
    } else {
      // 「今天的精灵都抽完了」也走这里，用同一块地方提示，不弹 alert 打断
      showResult({ error: res.message || '完成失败' })
    }
  } catch (error) {
    showResult({ error: '完成失败' })
  } finally {
    completingId.value = ''
  }
}

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(fetchState)
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

/* 抽到精灵的结果卡 */
.result-card {
  margin-bottom: 1.5rem;
  border-color: rgba(46, 204, 113, 0.4);
}

/* 进出场。原来只有 `animation: fadeIn`，也就是只淡入 —— 6 秒到点是 v-if
   直接把节点摘掉，啪一下消失。改用 Transition，**淡出（0.6s）比淡入（0.3s）慢**，
   才是「渐进式消失」 */
.result-fade-enter-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.result-fade-leave-active {
  transition: opacity 0.6s ease, transform 0.6s ease;
}

.result-fade-enter-from,
.result-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.result-card.result-error {
  border-color: rgba(231, 76, 60, 0.4);
}

.result-error-text {
  color: #E74C3C;
  font-weight: 600;
}

.result-title {
  font-size: 0.85rem;
  color: #2ECC71;
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.result-body {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.result-thumb {
  width: 84px;
  height: 84px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 215, 0, 0.25);
}

.result-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.result-name {
  font-size: 1.2rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

/* 结果卡名字前面的同一张「异色外观」图标 */
.result-name .shiny-mark {
  width: 20px;
  height: 20px;
  margin-right: 0.35rem;
  vertical-align: -4px;
}

.result-roco {
  font-size: 1.35rem;
  color: #FFD700;
}

.result-unit {
  font-size: 0.85rem;
  color: #B0B0B0;
}

.result-no {
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.35);
}

.result-condense {
  margin-top: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(74, 144, 217, 0.1);
  font-size: 0.85rem;
  color: #FFD700;
}

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

.task-name {
  font-size: 1.05rem;
  font-weight: 700;
  margin-bottom: 0.3rem;
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

@media (max-width: 768px) {
  .overview {
    grid-template-columns: 1fr;
  }

  .task-card {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>

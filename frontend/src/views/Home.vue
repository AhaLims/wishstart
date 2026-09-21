<template>
  <div class="home">
    <h1 class="page-title">欢迎回来！{{ userStore.userInfo?.name || '小伙伴' }}</h1>

    <!-- 今天的账：四个数并排。后两个是解释「掷骰子次数怎么来的」——
         今日获得星星 - 其中时间型 就是通用型那些，它们换不出次数。
         以前这页只显示「当前星星」和「掷骰子次数」，文档 §1 要的
         「今天获得了多少颗星星」反而没显示 -->
    <div class="dash-grid">
      <div class="stat-card">
        <div class="stat-label">当前星星</div>
        <div class="stat-value number">{{ dice.currentStars }}</div>
        <div class="stat-unit">⭐</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">掷骰子次数</div>
        <div class="stat-value number">{{ dice.diceCount }}</div>
        <div class="stat-unit">🎲</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">今日获得星星</div>
        <div class="stat-value number">{{ dice.todayStars }}</div>
        <div class="stat-unit">✨</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">其中时间型</div>
        <div class="stat-value number">{{ dice.todayTimeStars }}</div>
        <div class="stat-unit">⏱</div>
      </div>
    </div>

    <!-- 掷骰子。原来是自己一个页面（/dice），但那页上面两张卡跟这里重了、
         点「掷骰子」也只是跳过去再看一遍同两个数，所以整页并进来：
         骰子 + 按钮 + 结果 + 线下补记的入口，就是它的全部内容 -->
    <div class="card roll-card">
      <div class="roll-main">
        <div class="dice" :class="{ rolling }">
          <span
            v-for="i in pips"
            :key="i"
            class="pip"
            :style="{ gridArea: `${Math.floor(i / 3) + 1} / ${(i % 3) + 1}` }"
          />
        </div>

        <div class="roll-side">
          <button
            class="btn btn-warning btn-roll"
            :disabled="dice.diceCount <= 0 || rolling"
            @click="rollDice"
          >
            🎲 掷骰子
          </button>

          <p v-if="dice.diceCount <= 0" class="roll-note">
            没有次数了 —— 时间型每 5 颗星星换 1 次
          </p>

          <!-- 线下补记的入口。**没有次数时也不置灰**，照样点得开 —— 置灰的链接点下去
               什么都不发生，跟坏了没区别（真有人这么报过 bug）。现在点开之后弹窗里
               会明说「没有次数了」，比一个没反应的灰链接清楚。 -->
          <button class="roll-link" @click="showManualDice = true">
            线下掷的？自己记一笔 →
          </button>
        </div>
      </div>

      <!-- 掷出来的结果。放在骰子下面，视线不用来回跳 -->
      <div v-if="rollResult" class="roll-result">
        <span class="roll-result-dice">点数 <b class="number">{{ rollResult.diceResult }}</b></span>
        <span class="roll-result-star">
          +{{ rollResult.starsEarned }}<span class="roll-result-unit">颗星星</span>
        </span>
      </div>
    </div>

    <!-- 快捷操作 -->
    <div class="quick-actions">
      <h2 class="section-title">快捷操作</h2>
      <div class="actions-grid">
        <button class="action-btn" @click="$router.push('/tasks')">
          <span class="action-icon">✓</span>
          <span class="action-text">完成任务</span>
        </button>
        <button class="action-btn" @click="showQuickRecord = true">
          <span class="action-icon">⚡</span>
          <span class="action-text">快速记录</span>
        </button>
        <button class="action-btn" @click="$router.push('/wishes')">
          <span class="action-icon">🎰</span>
          <span class="action-text">抽卡</span>
        </button>
      </div>
    </div>

    <!-- 快速记录弹框 -->
    <div v-if="showQuickRecord" class="modal-overlay" @click.self="showQuickRecord = false">
      <div class="modal">
        <h3 class="modal-title">快速记录</h3>
        <div class="form-group">
          <label class="label">任务名称</label>
          <input v-model="quickTaskName" class="input" placeholder="输入任务名称" />
        </div>
        <div class="form-group">
          <label class="label">获得星星</label>
          <input v-model.number="quickStars" type="number" class="input" placeholder="输入星星数量" />
        </div>
        <div class="form-group">
          <label class="label">任务类型</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" value="general" v-model="quickType" />
              ✅ 通用型
            </label>
            <label class="radio-label">
              <input type="radio" value="time" v-model="quickType" />
              ⏱ 时间型（星星计入掷骰子次数）
            </label>
          </div>

          <!-- 标成时间型才会折算工时。这里实时算一遍，省得去记录页才发现对不上 -->
          <p v-if="quickType === 'time'" class="quick-time-hint">
            本次 = <strong>{{ quickMinutesText }}</strong> 工时（1 颗星 = 25 分钟）
            <template v-if="isWeekendToday">
              <br />今天周末，星星会翻倍，但<b>工时按翻倍前的星数算</b>，不会跟着翻倍
            </template>
          </p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" @click="submitQuickRecord">提交</button>
          <button class="btn" @click="showQuickRecord = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 线下掷骰子：从骰子那块点进来，不占首页的地方 -->
    <div v-if="showManualDice" class="modal-overlay" @click.self="showManualDice = false">
      <div class="modal">
        <h3 class="modal-title">线下掷骰子</h3>
        <p class="modal-hint">
          在线下掷了骰子就在这里记一笔，同样消耗 1 次掷骰子次数
        </p>
        <!-- 没次数时把原因说出来。上面的掷骰子按钮是置灰的，那是看得见的；
             但入口点进来只看见一个灰的「记录」就只剩困惑，所以这里必须解释 -->
        <p v-if="dice.diceCount <= 0" class="modal-warn">
          没有掷骰子次数了 —— 当日时间型星星每满 5 颗换 1 次，用掉的不退回
        </p>
        <div class="form-group">
          <label class="label">点数（1-6）</label>
          <input
            v-model.number="manualDiceValue"
            class="input"
            type="number"
            min="1"
            max="6"
            placeholder="输入点数"
          />
        </div>
        <div class="modal-actions">
          <button
            class="btn btn-primary"
            :disabled="dice.diceCount <= 0 || manualDiceValue < 1 || manualDiceValue > 6"
            @click="submitManualDice"
          >
            记录
          </button>
          <button class="btn" @click="showManualDice = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useUserStore } from '../stores/user'
import { recordApi, diceApi } from '../api'

const userStore = useUserStore()
const showQuickRecord = ref(false)
const quickTaskName = ref('')
const quickStars = ref(5)
// 只有时间型的星星能换掷骰子次数，所以快速记录也得说清楚是哪一型
const quickType = ref('general')

// 骰子相关的状态。四个数字全从 /dice 来（它一次给全：当前星星、次数、
// 今日星星、其中时间型），只有这一个来源，不会出现「卡片显示 1 次、
// 按钮却按 0 次算」这种两处对不上的情况
const dice = ref({ currentStars: 0, diceCount: 0, todayStars: 0, todayTimeStars: 0 })
const rollResult = ref(null)
const diceValue = ref(1)
const rolling = ref(false)
const showManualDice = ref(false)
const manualDiceValue = ref(null)

// 骰子面上的点位，下标是 3×3 格子的位置（0 左上、8 右下）。
// 画成真正的骰子面（1 点居中、6 点两列各三个）而不是一个方块里写个数字。
const PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8]
}

const pips = computed(() => PIPS[diceValue.value] || PIPS[1])

// ---- 快速记录的工时预览 ----
//
// 规则跟后端 records.js 的 minutesOf() 必须一致，不然预览和记录页会对不上：
//   - 只有标成「时间型」的才折算工时
//   - 1 颗星 = 25 分钟
//   - 周末星星翻倍，但那是奖励不是工时，要按翻倍前的星数算

// 今天是不是周末。用本地日期，跟后端 completions.js 的 now.getDay() 是同一套。
const isWeekendToday = computed(() => {
  const day = new Date().getDay()
  return day === 0 || day === 6
})

const quickMinutes = computed(() => {
  if (quickType.value !== 'time') return 0
  return Math.max(0, parseInt(quickStars.value) || 0) * 25
})

// 跟记录页一个格式：1h15min / 1h / 25min
const quickMinutesText = computed(() => {
  const m = quickMinutes.value
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h > 0) return rest > 0 ? `${h}h${rest}min` : `${h}h`
  return `${rest}min`
})

// 首页上每个会动星星/次数的操作之后都要跑一遍：
// 快速记录和骰子都改这几个数，只刷一半就会出现「星星变了、次数没变」
const refreshAll = async () => {
  await userStore.fetchStats()
  await fetchDiceStatus()
}

const fetchDiceStatus = async () => {
  const res = await diceApi.checkStatus(userStore.userId)
  if (res.code === 0) {
    dice.value = {
      currentStars: res.data.currentStars || 0,
      diceCount: res.data.diceCount || 0,
      todayStars: res.data.todayStars || 0,
      todayTimeStars: res.data.todayTimeStars || 0
    }
  }
}

onMounted(async () => {
  await userStore.initUser()
  await refreshAll()
})

const rollDice = async () => {
  if (rolling.value) return

  // 先发送请求获取结果
  let res
  try {
    res = await diceApi.roll(userStore.userId)
  } catch (error) {
    alert('掷骰子失败')
    return
  }

  if (res.code !== 0) {
    alert(res.message)
    return
  }

  // 动画效果
  rolling.value = true
  let times = 0
  const interval = setInterval(() => {
    diceValue.value = Math.floor(Math.random() * 6) + 1
    times++
    if (times > 10) {
      clearInterval(interval)
      // 动画结束后设置为服务端返回的真实结果
      diceValue.value = res.data.diceResult
      rollResult.value = res.data
      rolling.value = false
      refreshAll()
    }
  }, 80)
}

const submitManualDice = async () => {
  if (!manualDiceValue.value || manualDiceValue.value < 1 || manualDiceValue.value > 6) {
    alert('请输入1-6的点数')
    return
  }

  try {
    const res = await diceApi.submitManual(userStore.userId, manualDiceValue.value)
    if (res.code === 0) {
      showManualDice.value = false
      manualDiceValue.value = null
      alert(`记录成功！获得 ${res.data.starsEarned} 颗星星`)
      await refreshAll()
    } else {
      alert(res.message || '记录失败')
    }
  } catch (error) {
    alert('记录失败')
  }
}

const submitQuickRecord = async () => {
  if (!quickTaskName.value || !quickStars.value) return

  try {
    const res = await recordApi.quickRecord({
      userId: userStore.userId,
      taskName: quickTaskName.value,
      stars: quickStars.value,
      recordType: quickType.value
    })

    if (res.code === 0) {
      showQuickRecord.value = false
      quickTaskName.value = ''
      quickStars.value = 5
      quickType.value = 'general'
      await refreshAll()
    } else {
      alert(res.message || '记录失败')
    }
  } catch (error) {
    alert('记录失败')
  }
}
</script>

<style scoped>
/* 四个数的仪表盘，跟记录页/星光值页同一套卡片 */
.dash-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 1.5rem;
  text-align: center;
  border: 1px solid rgba(74, 144, 217, 0.2);
}

.stat-label {
  color: #B0B0B0;
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #FFD700;
}

.stat-unit {
  color: #B0B0B0;
  font-size: 0.9rem;
  margin-top: 0.25rem;
}

/* 掷骰子：骰子在左、按钮在右，横着排。
   竖着排会把这页拉得很长，而它上面才是每天要看的数字 */
.roll-card {
  margin-bottom: 1.5rem;
}

.roll-main {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2rem;
}

.roll-side {
  text-align: center;
}

/* 骰子面：3×3 的格子，点位按点数摆在对应格子上（见脚本里的 PIPS） */
.dice {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 5px;
  width: 120px;
  height: 120px;
  padding: 14px;
  flex-shrink: 0;
  border-radius: 20px;
  background: linear-gradient(135deg, #FFD700, #FFA500);
  box-shadow: 0 12px 32px rgba(255, 215, 0, 0.28);
}

.pip {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #1A1A2E;
}

/* 掷的时候晃两下。只有一个数字在跳的话看不出是在掷 */
.dice.rolling {
  animation: diceShake 0.4s ease-in-out infinite;
}

@keyframes diceShake {
  0%, 100% { transform: rotate(0deg) scale(1); }
  25% { transform: rotate(-7deg) scale(1.04); }
  75% { transform: rotate(7deg) scale(1.04); }
}

.btn-roll {
  padding: 1rem 2rem;
  font-size: 1.05rem;
}

.roll-note {
  margin-top: 0.75rem;
  color: #B0B0B0;
  font-size: 0.8rem;
}

/* 线下补记的入口。做成文字链而不是按钮：它是「另一条路」，
   跟上面那个主按钮抢注意力就不好了。**没有次数时也不置灰**（见模板里的注释） */
.roll-link {
  display: block;
  margin: 0.75rem auto 0;
  padding: 0;
  border: none;
  background: none;
  color: #7FB2FF;
  font-family: 'Nunito', sans-serif;
  font-size: 0.85rem;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.roll-link:hover {
  opacity: 0.75;
}

.roll-result {
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid rgba(74, 144, 217, 0.2);
  text-align: center;
  animation: fadeIn 0.3s ease;
}

.roll-result-dice {
  color: #B0B0B0;
}

.roll-result-dice b {
  font-size: 1.6rem;
  color: #fff;
  margin-left: 0.25rem;
}

.roll-result-star {
  margin-left: 1rem;
  font-size: 1.6rem;
  font-weight: 700;
  color: #FFD700;
}

.roll-result-unit {
  font-size: 0.9rem;
  font-weight: 400;
  color: #B0B0B0;
  margin-left: 0.25rem;
}

.section-title {
  font-size: 1.3rem;
  margin-bottom: 1rem;
  color: #B0B0B0;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.action-btn {
  background: rgba(22, 33, 62, 0.8);
  border: 1px solid rgba(74, 144, 217, 0.3);
  border-radius: 12px;
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.action-btn:hover {
  background: rgba(74, 144, 217, 0.2);
  transform: translateY(-2px);
}

.action-icon {
  font-size: 2rem;
}

.action-text {
  color: #B0B0B0;
  font-weight: 600;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}

.modal-hint {
  color: #B0B0B0;
  font-size: 0.85rem;
  margin: -0.75rem 0 1rem;
}

/* 说明「为什么记录是灰的」。是提示不是报错，所以用暖色不用红 */
.modal-warn {
  margin: 0 0 1rem;
  padding: 0.6rem 0.85rem;
  border-radius: 8px;
  background: rgba(255, 165, 0, 0.12);
  border: 1px solid rgba(255, 165, 0, 0.3);
  color: #FFC46B;
  font-size: 0.85rem;
  line-height: 1.5;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
}

/* 工时预览：是注解不是表单，所以压小、压暗，别抢上面的输入框 */
.quick-time-hint {
  margin: 0.75rem 0 0;
  font-size: 0.8rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.5);
}

.quick-time-hint strong {
  color: #7FB2FF;
}

@media (max-width: 768px) {
  .dash-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .actions-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  /* 窄屏放不下横排，骰子回到上面、按钮在下面 */
  .roll-main {
    flex-direction: column;
    gap: 1rem;
  }
}
</style>

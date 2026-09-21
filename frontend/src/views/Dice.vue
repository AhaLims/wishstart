<template>
  <div class="dice-page">
    <h1 class="page-title">掷骰子</h1>
    <p class="page-subtitle">
      时间型每获得 5 颗星星 = 1 次掷骰子机会，通用型的星星不算
    </p>

    <!-- 仪表盘：四个数一眼看完，跟记录页 / 星光值页同一套卡片。
         原来是四行 <p> 挤在一个小盒子里，跟别的页面完全不成一套 -->
    <div class="dash-grid">
      <div class="stat-card">
        <div class="stat-label">当前星星</div>
        <div class="stat-value number">{{ currentStars }}</div>
        <div class="stat-unit">⭐</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">掷骰子次数</div>
        <div class="stat-value number">{{ diceCount }}</div>
        <div class="stat-unit">🎲</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">今日获得星星</div>
        <div class="stat-value number">{{ todayStars }}</div>
        <div class="stat-unit">✨</div>
      </div>

      <!-- 跟「今日获得星星」并排，就是为了看出这俩差多少 ——
           差值就是通用型那些，它们换不出掷骰子次数 -->
      <div class="stat-card">
        <div class="stat-label">其中时间型</div>
        <div class="stat-value number">{{ todayTimeStars }}</div>
        <div class="stat-unit">⏱</div>
      </div>
    </div>

    <!-- 骰子 + 掷 -->
    <div class="card roll-card">
      <div class="dice" :class="{ rolling }">
        <span
          v-for="i in pips"
          :key="i"
          class="pip"
          :style="{ gridArea: `${Math.floor(i / 3) + 1} / ${(i % 3) + 1}` }"
        />
      </div>

      <button
        class="btn btn-warning btn-roll"
        :disabled="diceCount <= 0 || rolling"
        @click="rollDice"
      >
        🎲 在线掷骰子
      </button>

      <p v-if="diceCount <= 0" class="roll-note">
        没有掷骰子次数了 —— 去完成几个时间型任务，每 5 颗星星换 1 次
      </p>

      <!-- 掷出来的结果。放在骰子下面而不是另起一块，视线不用来回跳 -->
      <div v-if="result" class="roll-result">
        <span class="roll-result-dice">点数 <b class="number">{{ result.diceResult }}</b></span>
        <span class="roll-result-star">
          +{{ result.starsEarned }}<span class="roll-result-unit">颗星星</span>
        </span>
      </div>
    </div>

    <!-- 线下掷骰子 -->
    <div class="card manual-card">
      <h2 class="section-title">线下掷骰子记录</h2>
      <p class="manual-hint">
        在线下掷了骰子就在这里记一笔，同样消耗 1 次掷骰子次数
      </p>

      <div class="manual-input">
        <input
          v-model.number="manualDiceValue"
          class="input dice-input"
          type="number"
          min="1"
          max="6"
          placeholder="点数 1-6"
        />
        <button
          class="btn btn-primary"
          :disabled="diceCount <= 0 || manualDiceValue < 1 || manualDiceValue > 6"
          @click="submitManualDice"
        >
          记录
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { diceApi } from '../api'

const userStore = useUserStore()
const diceCount = ref(0)
const diceValue = ref(1)
const result = ref(null)
const todayStars = ref(0)
const todayTimeStars = ref(0)
const manualDiceValue = ref(null)
// 掷骰子的动画在飞。动画期间把按钮禁掉：不然连点两下会真的掷两次、
// 扣掉 2 次机会，而页面上只显示后一次的结果，看着像少了一次
const rolling = ref(false)

const currentStars = computed(() => userStore.stats?.currentStars || 0)

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

const fetchDiceStatus = async () => {
  const res = await diceApi.checkStatus(userStore.userId)
  if (res.code === 0) {
    diceCount.value = res.data.diceCount || 0
    todayStars.value = res.data.todayStars || 0
    todayTimeStars.value = res.data.todayTimeStars || 0
  }
}

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
      result.value = res.data
      rolling.value = false
      userStore.fetchStats()
      fetchDiceStatus()
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
      alert(`记录成功！获得 ${res.data.starsEarned} 颗星星`)
      manualDiceValue.value = null
      await userStore.fetchStats()
      await fetchDiceStatus()
    } else {
      alert(res.message || '记录失败')
    }
  } catch (error) {
    alert('记录失败')
  }
}

onMounted(async () => {
  await userStore.fetchStats()
  await fetchDiceStatus()
})
</script>

<style scoped>
/* 跟星光值页的副标题一个样式：负的上边距吃掉 .page-title 的下边距，
   不然标题和它之间空一大截 */
.page-subtitle {
  margin: -1rem 0 1.5rem;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.45);
}

/* 四个数的仪表盘，跟记录页同一套卡片 */
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

.roll-card {
  text-align: center;
  padding: 2.5rem 1.5rem;
  margin-bottom: 1.5rem;
}

/* 骰子面：3×3 的格子，点位按点数摆在对应格子上（见脚本里的 PIPS） */
.dice {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 6px;
  width: 152px;
  height: 152px;
  padding: 18px;
  margin: 0 auto;
  border-radius: 22px;
  background: linear-gradient(135deg, #FFD700, #FFA500);
  box-shadow: 0 12px 32px rgba(255, 215, 0, 0.28);
}

.pip {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #1A1A2E;
}

/* 掷的时候晃两下。以前只有一个数字在跳，看不出是在掷 */
.dice.rolling {
  animation: diceShake 0.4s ease-in-out infinite;
}

@keyframes diceShake {
  0%, 100% { transform: rotate(0deg) scale(1); }
  25% { transform: rotate(-7deg) scale(1.04); }
  75% { transform: rotate(7deg) scale(1.04); }
}

.btn-roll {
  margin-top: 1.75rem;
  padding: 1rem 2.5rem;
  font-size: 1.1rem;
}

.roll-note {
  margin-top: 1rem;
  color: #B0B0B0;
  font-size: 0.85rem;
}

.roll-result {
  margin-top: 1.75rem;
  padding-top: 1.25rem;
  border-top: 1px solid rgba(74, 144, 217, 0.2);
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

.manual-card {
  text-align: center;
}

.manual-card .section-title {
  font-size: 1.2rem;
  color: #fff;
  margin-bottom: 0.5rem;
}

.manual-hint {
  color: #B0B0B0;
  font-size: 0.85rem;
}

.manual-input {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  align-items: center;
  margin-top: 1.25rem;
}

/* 盖掉全局 .input 的 width:100%，不然输入框会撑满整张卡 */
.dice-input {
  width: 160px;
  text-align: center;
}

@media (max-width: 768px) {
  .dash-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>

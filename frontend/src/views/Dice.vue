<template>
  <div class="dice">
    <h1 class="page-title">掷骰子</h1>

    <!-- 当前星星 -->
    <div class="current-stars">
      <span class="star-icon">⭐</span>
      <span class="number">{{ currentStars }}</span>
      <span class="label">颗星星</span>
    </div>

    <!-- 骰子区域 -->
    <div class="dice-area">
      <div class="dice-container" :class="{ rolling: isRolling }">
        <div class="dice" :class="`dice-${diceResult}`">
          {{ diceResult }}
        </div>
      </div>

      <p v-if="!diceStatus?.canRoll && !diceStatus?.used" class="dice-hint">
        需要至少 {{ diceStatus?.starsRequired || 5 }} 颗星星才能掷骰子
      </p>
      <p v-else-if="diceStatus?.used" class="dice-hint">
        今日骰子次数已用完
      </p>
      <p v-else class="dice-hint">
        消耗5颗星星，掷出几点就获得几点星星！
      </p>

      <button
        class="btn btn-warning roll-btn"
        :disabled="!diceStatus?.canRoll || isRolling"
        @click="rollDice"
      >
        {{ isRolling ? '掷中...' : '掷骰子' }}
      </button>
    </div>

    <!-- 结果展示 -->
    <div v-if="lastResult" class="result-card">
      <h3>本次结果</h3>
      <div class="result-dice">🎲 点数：{{ lastResult.diceResult }}</div>
      <div class="result-stars">
        <span class="star-icon">⭐</span>
        +{{ lastResult.starsEarned }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useUserStore } from '../stores/user'
import { diceApi } from '../api'

const userStore = useUserStore()
const diceStatus = ref(null)
const diceResult = ref(1)
const isRolling = ref(false)
const lastResult = ref(null)

const currentStars = computed(() => userStore.stats?.currentStars || 0)

const fetchDiceStatus = async () => {
  try {
    const res = await diceApi.checkStatus(userStore.userId)
    if (res.code === 0) {
      diceStatus.value = res.data
    }
  } catch (error) {
    console.error('Fetch dice status error:', error)
  }
}

const rollDice = async () => {
  isRolling.value = true

  // 动画效果
  let count = 0
  const interval = setInterval(() => {
    diceResult.value = Math.floor(Math.random() * 6) + 1
    count++
    if (count > 10) {
      clearInterval(interval)
    }
  }, 100)

  try {
    const res = await diceApi.roll(userStore.userId)

    if (res.code === 0) {
      diceResult.value = res.data.diceResult
      lastResult.value = res.data
      await userStore.fetchStats()
      await fetchDiceStatus()
    } else {
      alert(res.message || '掷骰子失败')
    }
  } catch (error) {
    alert('掷骰子失败')
  } finally {
    isRolling.value = false
  }
}

onMounted(async () => {
  await userStore.fetchStats()
  await fetchDiceStatus()
})
</script>

<style scoped>
.current-stars {
  text-align: center;
  font-size: 1.5rem;
  margin-bottom: 2rem;
}

.current-stars .number {
  font-size: 2.5rem;
  font-weight: 700;
  color: #FFD700;
  margin: 0 0.5rem;
}

.dice-area {
  text-align: center;
}

.dice-container {
  margin: 2rem auto;
  perspective: 1000px;
}

.dice {
  width: 120px;
  height: 120px;
  background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 4rem;
  font-weight: 700;
  color: #1A1A2E;
  margin: 0 auto;
  box-shadow: 0 10px 30px rgba(255, 215, 0, 0.3);
}

.dice.rolling {
  animation: shake 0.5s ease-in-out;
}

@keyframes shake {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-10deg); }
  75% { transform: rotate(10deg); }
}

.dice-hint {
  color: #B0B0B0;
  margin-bottom: 1.5rem;
}

.roll-btn {
  padding: 1rem 3rem;
  font-size: 1.2rem;
}

.result-card {
  margin-top: 2rem;
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 2rem;
  text-align: center;
  border: 1px solid rgba(255, 215, 0, 0.3);
}

.result-card h3 {
  color: #FFD700;
  margin-bottom: 1rem;
}

.result-dice {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.result-stars {
  font-size: 2rem;
  font-weight: 700;
  color: #FFD700;
}
</style>

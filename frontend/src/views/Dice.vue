<template>
  <div class="dice-page">
    <h1>掷骰子</h1>

    <div class="info-box">
      <p>当前星星: {{ currentStars }}</p>
      <p>掷骰子次数: {{ diceCount }}</p>
    </div>

    <div class="dice-box">
      <div class="dice">{{ diceValue }}</div>
    </div>

    <p class="hint">每获得5颗星星 = 1次掷骰子机会</p>

    <button
      class="btn-roll"
      :disabled="diceCount <= 0"
      @click="rollDice"
    >
      掷骰子
    </button>

    <div v-if="result" class="result">
      <p>点数: {{ result.diceResult }}</p>
      <p>获得星星: +{{ result.starsEarned }}</p>
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

const currentStars = computed(() => userStore.stats?.currentStars || 0)

const fetchDiceStatus = async () => {
  const res = await diceApi.checkStatus(userStore.userId)
  if (res.code === 0) {
    diceCount.value = res.data.diceCount || 0
  }
}

const rollDice = async () => {
  // 动画效果
  let times = 0
  const interval = setInterval(() => {
    diceValue.value = Math.floor(Math.random() * 6) + 1
    times++
    if (times > 10) {
      clearInterval(interval)
    }
  }, 80)

  try {
    const res = await diceApi.roll(userStore.userId)
    if (res.code === 0) {
      diceValue.value = res.data.diceResult
      result.value = res.data
      await userStore.fetchStats()
      await fetchDiceStatus()
    } else {
      alert(res.message)
    }
  } catch (error) {
    alert('掷骰子失败')
  }
}

onMounted(async () => {
  await userStore.fetchStats()
  await fetchDiceStatus()
})
</script>

<style scoped>
.dice-page {
  text-align: center;
  padding: 20px;
}

h1 {
  color: #FFD700;
  margin-bottom: 30px;
}

.info-box {
  background: rgba(22, 33, 62, 0.8);
  padding: 15px;
  border-radius: 10px;
  margin-bottom: 30px;
  display: inline-block;
}

.info-box p {
  margin: 5px 0;
  color: #fff;
}

.dice-box {
  margin: 30px 0;
}

.dice {
  width: 100px;
  height: 100px;
  background: linear-gradient(135deg, #FFD700, #FFA500);
  border-radius: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 50px;
  font-weight: bold;
  color: #1A1A2E;
}

.hint {
  color: #aaa;
  margin-bottom: 20px;
}

.btn-roll {
  background: linear-gradient(135deg, #FFD700, #FFA500);
  border: none;
  padding: 15px 40px;
  font-size: 18px;
  border-radius: 10px;
  cursor: pointer;
  color: #1A1A2E;
  font-weight: bold;
}

.btn-roll:disabled {
  background: #555;
  cursor: not-allowed;
}

.result {
  margin-top: 30px;
  background: rgba(22, 33, 62, 0.8);
  padding: 20px;
  border-radius: 10px;
}

.result p {
  color: #fff;
  margin: 10px 0;
}
</style>

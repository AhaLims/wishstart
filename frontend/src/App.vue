<template>
  <div class="app">
    <nav class="navbar">
      <div class="nav-brand">⭐ 许愿星计划</div>
      <div class="nav-links">
        <router-link to="/">首页</router-link>
        <router-link to="/tasks">任务</router-link>
        <router-link to="/records">记录</router-link>
        <router-link to="/dice">骰子</router-link>
        <router-link to="/wishes">愿望</router-link>
        <router-link to="/draw">抽卡</router-link>
        <router-link to="/stats">统计</router-link>
        <router-link v-if="isDesktop()" to="/work">工作时间</router-link>
        <router-link to="/settings">设置</router-link>
      </div>
    </nav>
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { isDesktop } from './utils/env'
</script>

<style scoped>
.app {
  min-height: 100vh;
  background: linear-gradient(135deg, #1A1A2E 0%, #16213E 100%);
  color: #fff;
}

.navbar {
  background: rgba(22, 33, 62, 0.9);
  backdrop-filter: blur(10px);
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid rgba(74, 144, 217, 0.2);
}

.nav-brand {
  font-family: 'Nunito', sans-serif;
  font-weight: 800;
  font-size: 1.5rem;
  background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.nav-links {
  display: flex;
  gap: 1rem;
}

.nav-links a {
  color: #B0B0B0;
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  transition: all 0.3s ease;
  font-family: 'Nunito', sans-serif;
  font-weight: 600;
}

.nav-links a:hover {
  color: #fff;
  background: rgba(74, 144, 217, 0.2);
}

.nav-links a.router-link-active {
  color: #FFD700;
  background: rgba(255, 215, 0, 0.1);
}

.main-content {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

@media (max-width: 768px) {
  .navbar {
    flex-direction: column;
    gap: 1rem;
  }

  .nav-links {
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>

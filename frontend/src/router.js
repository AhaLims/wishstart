import { createRouter, createWebHistory } from 'vue-router'
import Home from './views/Home.vue'
import Tasks from './views/Tasks.vue'
import Records from './views/Records.vue'
import Starlight from './views/Starlight.vue'
import Wishes from './views/Wishes.vue'
import Stats from './views/Stats.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/tasks', component: Tasks },
  { path: '/records', component: Records },
  { path: '/starlight', component: Starlight },
  { path: '/wishes', component: Wishes },
  { path: '/stats', component: Stats },
  // 「设置」并进了统计页（那页本来就是同步，不是设置），
  // 老链接转到新位置，别扔给下面的兜底弹回首页
  { path: '/settings', redirect: '/stats' },
  // 兜底：工作时间页删掉后，浏览器历史/收藏里还留着的 /work 会落在这里，
  // 不然匹配不到路由会渲染成一张空白页。
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router

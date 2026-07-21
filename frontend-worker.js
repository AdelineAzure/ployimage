// 前端静态站 worker：把所有请求交给 ASSETS 绑定（dist/）。
// 存在的意义是覆盖掉 `a` 上遗留的旧代理 script，让静态资源正常服务。
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};

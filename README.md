# VolleyballRotation

排球裁判协同微信小程序（甲/乙双方站位、轮转、比分、局间配置与结果留存）。

## 功能列表

- 裁判团队创建/加入（团队编号 + 密码）
- 赛前配置（赛制、队名、颜色、首发与队长）
- 比赛主界面（计分、轮转、换边、暂停、操作记录、撤回）
- 局间配置（沿用阵容、编辑球员、确认场上队长）
- 结果页（按局比分与记录回看）
- 深色模式适配

## 技术架构

- 前端：微信小程序（TypeScript + WXML + LESS）
- 后端：微信云开发（云函数 + 云数据库）
- 核心云函数：`cloudfunctions/roomApi`
- 核心集合：
  - `rooms`：房间与比赛主状态
  - `room_locks`：创建阶段房间号占用锁

## 同步与一致性方案

- 所有关键写操作统一走云函数，前端不直接改数据库
- 实时同步采用 `watch` 订阅，断连场景由轻量补拉兜底
- 通过 `syncVersion` / `updatedAt` 处理并发写入顺序
- 在线人数通过心跳 + TTL 清理机制维护

## 房间生命周期策略

- 创建后基础有效期：6 小时
- 比赛进行中且首次到期：额外延长 3 小时（仅一次）
- 比赛敲定后：结果保留 24 小时

## 页面结构

- `pages/home/home`：首页
- `pages/join-match/join-match`：加入比赛
- `pages/create-room/create-room`：创建比赛与赛前配置
- `pages/match/match`：比赛页（横屏）
- `pages/lineup-adjust/lineup-adjust`：局间配置页（横屏）
- `pages/result/result`：比赛结果页

## 开发与部署

1. 安装依赖：`npm install`
2. 在微信开发者工具导入项目并选择云开发环境
3. 创建集合：`rooms`、`room_locks`
4. 部署云函数：`cloudfunctions/roomApi`
5. 在 `miniprogram/app.ts` 中配置 `wx.cloud.init` 的 `env`

## 推荐权限策略

- 客户端：读权限
- 写权限：经云函数统一校验与写入

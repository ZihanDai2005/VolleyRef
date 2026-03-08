# VolleyballRotation

排球裁判协同微信小程序，覆盖从建房、赛前配置、比赛执裁、局间配置到结果回看的完整链路。

当前首页版本文案：`V1.3.1 BUILD 20260308`

## 主要能力

- 6 位裁判团队编号 + 6 位密码创建/加入房间
- 赛前配置（赛制、队名、队色、首发 6 人 + 自由人、队长）
- 比赛页：计分、自动/手动轮转、暂停、换边、操作记录、撤回
- 局间配置页：沿用上一局配置并支持再编辑
- 比赛结果页：按局汇总、记录回看、到期倒计时
- 深色模式适配
- A/B 裁判协作（主控裁判/观赛裁判）与接管

## 页面路由

- `pages/home/home`：首页
- `pages/join-match/join-match`：加入房间
- `pages/create-room/create-room`：创建房间 + 赛前配置
- `pages/match/match`：比赛页（横屏主页面）
- `pages/lineup-adjust/lineup-adjust`：局间配置页（横屏）
- `pages/result/result`：比赛结果页（竖屏）

## 权限与协作模型

房间在 `collaboration` 中维护三个关键字段：

- `ownerClientId`：创建者标识
- `operatorClientId`：当前有操作权限的裁判
- `observerSideMap`：观赛裁判的本地视角偏好

规则：

- 当前 `operatorClientId` 对应 A 类裁判（可操作）
- 非 `operatorClientId` 为 B 类裁判（观赛）
- B 类可点击“接管”，通过 `transferRoomOperatorAsync` 把控制权转给自己
- 接管发生在局间配置阶段时，会同时切换配置控制权并清空旧操作者临时草稿，避免脏状态

## 数据与后端

- 前端：微信小程序（TypeScript + WXML + WXSS/LESS）
- 后端：微信云开发（云函数 + 云数据库）
- 云函数：`cloudfunctions/roomApi`
- 主要集合：`rooms`（房间主状态）、`room_locks`（房间号占用锁）

`roomApi` 主要 action：

- `getRoom`
- `upsertRoom`
- `createRoom`
- `verifyRoomPassword`
- `heartbeatRoom`
- `leaveRoom`
- `cleanupExpiredRooms`
- `isRoomIdBlocked` / `reserveRoomId` / `releaseRoomId`

## 状态同步与一致性

核心策略在 `miniprogram/utils/room-service.ts`：

- 写入路径统一通过 `updateRoomAsync` / 云函数 `upsertRoom`
- 读取优先本地快照，后台低频向云端补拉
- `watch` 订阅 `rooms/{roomId}` 实时变更
- `watch` 抖动返回空 docs 时，不直接判死房间，而是补拉 + 保留本地快照
- 用 `syncVersion` + `updatedAt` 过滤过旧数据

为减少“动画被刷新打断”，轮转相关页面增加了动作锁：

- 轮转动作执行中，`loadRoom` 延迟到动作结束后再补读
- 覆盖手动轮转、比分撤回触发轮转撤回、局间配置轮转、加分触发自动轮转

## 连接状态与调用频率

连接状态文案统一为：

- `已连接`
- `连接中`
- `已离线`

并设置了状态最短停留时间（5 秒）以避免抖动。

各页调用节奏（当前代码）：

| 页面 | 心跳 | 轮询 | watch | 备注 |
| --- | --- | --- | --- | --- |
| `create-room` | `5s` | `3s` | 开启 | 创建阶段同步最频繁 |
| `match` | `15s` | `60s` | 开启 | 另有 `3s` 本地看门狗（不发请求） |
| `lineup-adjust` | `20s` | 无 | 开启 | 仅探活 + watch |
| `home` / `join-match` | 无 | 无 | 无 | 仅用户触发请求 |
| `result` | 无 | 无 | 无 | 仅本地倒计时 |

在线人数机制：

- 心跳更新 `participants`
- 参与者 TTL：`40s`
- 低频/抖动时会有短暂人数不同步，后续心跳会收敛

## 房间生命周期

- 创建后基础有效期：`6h`
- 比赛进行中首次到期：自动延长 `3h`（仅一次）
- 比赛结果锁定后：保留 `24h`，到期清理

## 本地容错

为避免网络抖动导致误退房：

- 先用内存/本地缓存快照维持页面渲染
- 弹出“连接中，正在重试”提示并后台重试
- 再调用 `getRoomExistenceFromServerAsync` 做存在性复核
- 仅在确认 `missing` 时弹窗并返回首页

## 开发与部署

1. 安装依赖：`npm install`
2. 微信开发者工具导入项目，选择云开发环境
3. 创建集合：`rooms`、`room_locks`
4. 部署云函数：`cloudfunctions/roomApi`
5. 配置 `miniprogram/app.ts` 的 `wx.cloud.init({ env })`
6. 建议提交前执行：`npx tsc --noEmit`

## 发布配置说明

`project.config.json` 当前关键开关：

- `minified: true`（上传时压缩脚本）
- `minifyWXSS: true`
- `minifyWXML: true`
- `uploadWithSourceMap: true`

说明：

- 压缩会减小包体、提高加载效率，通常建议开启
- 若线上排查需要更直观堆栈，可在排查阶段临时关闭压缩或关闭 source map 上传

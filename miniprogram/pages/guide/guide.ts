import { applyNavigationBarTheme, bindThemeChange } from "../../utils/theme";

type GuideItem = {
  id: string;
  title: string;
  body: string;
  keywords?: string[];
};

type GuideSection = {
  id: string;
  no: string;
  shortTitle: string;
  title: string;
  summary: string;
  keywords?: string[];
  items: GuideItem[];
};

type GuideItemView = GuideItem & {
  no: string;
  anchorId: string;
};

type GuideSectionView = Omit<GuideSection, "items"> & {
  anchorId: string;
  items: GuideItemView[];
};

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "home",
    no: "01",
    shortTitle: "首页",
    title: "首页入口与房间时效",
    summary: "先说明从哪里进入、房间会保存多久，以及什么时候能快速回到上一场比赛。",
    keywords: ["首页", "创建比赛", "加入比赛", "继续上次比赛", "房间时效", "客服", "指南"],
    items: [
      {
        id: "create-entry",
        title: "创建比赛入口",
        body: "首页“创建比赛”会先生成新的 6 位裁判团队编号，再进入创建房间页继续录入双方信息。",
        keywords: ["创建", "裁判团队编号", "6位"],
      },
      {
        id: "join-entry",
        title: "加入比赛入口",
        body: "首页“加入比赛”用于输入 6 位裁判团队编号和 6 位密码；从分享链接进入时，编号和密码也可自动带入。",
        keywords: ["加入", "密码", "分享链接"],
      },
      {
        id: "resume-entry",
        title: "继续上次比赛",
        body: "本机保存过最近一次有效房间后，首页会显示“继续上次比赛”或“返回上次比赛结果”，可直接回到比赛页或结果页。",
        keywords: ["继续上次比赛", "返回上次比赛结果", "快速进入"],
      },
      {
        id: "footer-entry",
        title: "联系我们与使用指南",
        body: "首页底部“联系我们”可直接进入微信客服会话；“使用指南”进入本页查看所有操作说明。",
        keywords: ["联系我们", "客服", "使用指南"],
      },
      {
        id: "room-ttl",
        title: "房间保留时间",
        body: "比赛房间默认保留约 6 小时，必要时系统可追加约 3 小时；比赛结束后的结果页默认保留约 24 小时，建议尽快回房间继续或复核。",
        keywords: ["保留时间", "6小时", "24小时", "结果页"],
      },
    ],
  },
  {
    id: "create",
    no: "02",
    shortTitle: "创建",
    title: "创建房间与赛前录入",
    summary: "创建房间页负责完成比赛基础信息、双方阵容、自由人和队长设置。",
    keywords: ["创建房间", "队名", "颜色", "自由人", "队长", "首发"],
    items: [
      {
        id: "name-rule",
        title: "队名与颜色规则",
        body: "队名最多 8 个字，不能只填空格，甲乙队名称不能相同；两队颜色也不能选成同一种。",
        keywords: ["队名", "颜色", "8个字", "不能相同"],
      },
      {
        id: "lineup-rule",
        title: "首发与号码规则",
        body: "I 到 VI 六个首发位置必须全部填写；同一队内普通球员和自由人号码都不能重复。",
        keywords: ["首发", "I", "VI", "号码重复"],
      },
      {
        id: "libero-input",
        title: "自由人录入方式",
        body: "可录入 0 到 2 名自由人；如果只填写了第二个自由人槽位，系统会自动整理到第一个自由人槽位。",
        keywords: ["自由人", "L1", "L2", "自动整理"],
      },
      {
        id: "captain-input",
        title: "队长号码与场上队长",
        body: "创建页填写的是球队队长号码；进入比赛后，系统仍会根据当前场上 6 人要求确认本场场上队长。",
        keywords: ["队长号码", "场上队长", "确认"],
      },
      {
        id: "draw-config",
        title: "发球与场区设置",
        body: "创建页可直接设置首局发球队和甲队所在场区，比赛页会按这里的设置初始化第一局。",
        keywords: ["发球", "场区", "首局"],
      },
      {
        id: "save-enter",
        title: "进入比赛与邀请",
        body: "房间密码必须是 6 位数字。保存成功后会进入比赛页，并把当前房间编号和密码保存为本机最近一次比赛记录。",
        keywords: ["6位密码", "进入比赛", "最近记录"],
      },
    ],
  },
  {
    id: "join",
    no: "03",
    shortTitle: "加入",
    title: "加入房间与接管规则",
    summary: "加入房间不只决定能否进入，也决定进入后是操作态还是观赛态。",
    keywords: ["加入房间", "接管", "观赛", "操作权"],
    items: [
      {
        id: "join-rule",
        title: "加入条件",
        body: "裁判团队编号和密码都必须是 6 位数字；校验通过后，系统会根据房间当前状态进入创建页、比赛页或结果页。",
        keywords: ["6位", "创建页", "比赛页", "结果页"],
      },
      {
        id: "share-join",
        title: "分享链接加入",
        body: "收到带房间参数的分享链接后，可直接落到加入流程；系统会自动带出可识别的编号和密码。",
        keywords: ["分享链接", "自动带入"],
      },
      {
        id: "takeover",
        title: "谁能操作比赛",
        body: "同一时刻只有当前操作端可以记分、换人、暂停和改配置；其他设备进入后默认只读，需要点击“接管”后才能继续操作。",
        keywords: ["接管", "只读", "操作端"],
      },
      {
        id: "takeover-loss",
        title: "被其他裁判接管后",
        body: "如果当前设备的操作权被其他裁判拿走，本机会立即退回观赛态；继续操作前必须重新接管。",
        keywords: ["被接管", "观赛态", "重新接管"],
      },
    ],
  },
  {
    id: "score",
    no: "04",
    shortTitle: "记分",
    title: "开赛前确认与记分流程",
    summary: "比赛页先确认场上队长，再进入记分；记分后系统会自动处理发球权与轮转。",
    keywords: ["记分", "场上队长", "轮转", "决胜局", "自动换边"],
    items: [
      {
        id: "captain-confirm",
        title: "首分前先确认场上队长",
        body: "正式记分前，必须先为两队确认本场场上队长；如果球队队长本来就在场上 6 人内，系统会自动锁定该号码。",
        keywords: ["场上队长", "自动锁定", "首分前"],
      },
      {
        id: "score-add",
        title: "加分后的自动处理",
        body: "每次加分都会同步更新比分，并按当前发球权自动处理轮转；用户不需要手动再补一次常规轮转。",
        keywords: ["加分", "自动轮转", "发球权"],
      },
      {
        id: "score-block",
        title: "不能加分的情况",
        body: "未完成场上队长确认、暂停进行中或比赛已结束时，都不能继续加分。",
        keywords: ["暂停中", "比赛结束", "不能加分"],
      },
      {
        id: "deciding-set",
        title: "决胜局 8 分换边",
        body: "进入决胜局后，当一方先到 8 分，系统会弹出是否换边的确认；确认后可直接完成换边。",
        keywords: ["决胜局", "8分", "换边"],
      },
      {
        id: "set-end",
        title: "单局结束后的去向",
        body: "每局结束后，系统会自动进入局间流程；如果整场比赛已经结束，则转入结果确认和结果页。",
        keywords: ["单局结束", "局间流程", "结果页"],
      },
    ],
  },
  {
    id: "control",
    no: "05",
    shortTitle: "控场",
    title: "暂停、换边、手动轮转与撤回",
    summary: "这些都是比赛页内的控制操作，适合处理暂停、纠偏和最后一分撤回。",
    keywords: ["暂停", "换边", "轮转", "撤回", "提前结束暂停"],
    items: [
      {
        id: "timeout-limit",
        title: "暂停次数与时长",
        body: "每队每局最多 2 次暂停；暂停开始后会进入倒计时状态，比赛页会显示剩余时间。",
        keywords: ["暂停", "2次", "倒计时"],
      },
      {
        id: "timeout-end",
        title: "暂停可提前结束",
        body: "如果暂停已提前结束，可直接结束当前暂停并继续比赛，不需要等待倒计时自然归零。",
        keywords: ["提前结束暂停"],
      },
      {
        id: "manual-rotate",
        title: "手动轮转",
        body: "手动轮转用于修正当前轮次站位，不等同于局中换人；执行后会计入比赛日志。",
        keywords: ["手动轮转", "修正站位", "日志"],
      },
      {
        id: "manual-switch",
        title: "手动换边",
        body: "手动换边需要单独确认，通常用于裁判人工纠偏；比赛结束后不能再执行手动换边。",
        keywords: ["手动换边", "纠偏"],
      },
      {
        id: "undo",
        title: "撤回最后一分",
        body: "可撤回当前局最近一次可回退的比赛操作；如果本局没有可撤回内容，页面会直接提示。",
        keywords: ["撤回最后一分", "撤回", "当前局"],
      },
    ],
  },
  {
    id: "quick-sub",
    no: "06",
    shortTitle: "快捷换人",
    title: "局中换人的快捷入口",
    summary: "普通球员和自由人的快捷入口并不一样，先分清入口，再看后面的限制规则。",
    keywords: ["快捷换人", "局中换人", "拖拽", "点击球员", "换人按钮"],
    items: [
      {
        id: "open-panel",
        title: "从按钮打开换人窗",
        body: "点击队伍对应的换人入口，可打开局中换人窗口，并查看普通换人、特殊换人和换人记录。",
        keywords: ["换人按钮", "换人窗口", "换人记录"],
      },
      {
        id: "tap-player",
        title: "点击场上普通球员直接换人",
        body: "普通球员位于场上 6 人区时，可直接点击该球员牌，快速进入该队、该位置的局中换人窗口，不必先点换人按钮。",
        keywords: ["点击球员", "场上6人区", "快速进入"],
      },
      {
        id: "quick-special",
        title: "普通换人满 6 次后的快捷行为",
        body: "如果该队本局普通换人已经用满 6 次，再从快捷入口打开换人窗时，系统会直接切到特殊换人模式。",
        keywords: ["6次", "自动切到特殊换人"],
      },
      {
        id: "normal-in-libero-zone",
        title: "普通球员在自由人区时不能走快捷普通换人",
        body: "普通球员被自由人替换到 2 人自由人区后，不能在那里直接进行普通换人；必须先换回场上 6 人区，再做普通换人。",
        keywords: ["自由人区", "普通球员", "先换回场上6人区"],
      },
      {
        id: "libero-quick-entry",
        title: "自由人不走换人窗快捷入口",
        body: "自由人常规换人不通过局中换人窗口完成，而是在比赛页直接拖拽自由人到目标球员位置。",
        keywords: ["自由人", "拖拽", "不走换人窗"],
      },
    ],
  },
  {
    id: "normal-sub",
    no: "07",
    shortTitle: "普通换人",
    title: "普通换人的执行方式与限制",
    summary: "普通换人只服务于场上 6 人的常规上、下场交换，次数和配对都会被严格校验。",
    keywords: ["普通换人", "配对", "次数上限", "锁定"],
    items: [
      {
        id: "normal-target",
        title: "普通换人只针对场上 6 人",
        body: "普通换人只能对场上 6 人区的非自由人执行，不能直接对自由人位置操作，也不能把自由人号码换上普通球员位置。",
        keywords: ["场上6人", "非自由人", "不能换上自由人"],
      },
      {
        id: "normal-limit",
        title: "每队每局最多 6 次",
        body: "普通换人按队、按局分别计数；同一队在同一局内达到 6 次后，就不能再继续做普通换人。",
        keywords: ["6次", "每队每局"],
      },
      {
        id: "normal-pair",
        title: "必须遵守既有配对",
        body: "一旦某个号码和另一名球员形成普通换人配对，后续只能按这组配对互换，不能跨配对换人。",
        keywords: ["配对", "不能跨配对"],
      },
      {
        id: "normal-lock",
        title: "配对互换 2 次后锁定",
        body: "同一组普通换人配对在本局完成两次互换后会被锁定，不能继续按普通换人方式再互换。",
        keywords: ["2次互换", "锁定"],
      },
      {
        id: "normal-number-check",
        title: "换上号码的基本校验",
        body: "换上号码不能为空，不能与换下号码相同，不能已在场上，也不能填写自由人号码、当局禁赛号码或全场禁赛号码。",
        keywords: ["号码校验", "禁赛", "不能相同", "不能已在场上"],
      },
      {
        id: "normal-captain",
        title: "影响场上队长时会立即追认",
        body: "如果普通换人导致原场上队长离场或当前队长状态改变，系统会立刻弹出场上队长确认窗；确认后换人窗会继续保留。",
        keywords: ["场上队长", "追认", "换人窗保留"],
      },
    ],
  },
  {
    id: "special-sub",
    no: "08",
    shortTitle: "特殊换人",
    title: "特殊换人的开放条件与适用场景",
    summary: "特殊换人不是随时都能切过去，只有满足特定条件时才会开放或自动切换。",
    keywords: ["特殊换人", "伤病", "处罚", "开放条件", "自动切换"],
    items: [
      {
        id: "special-auto",
        title: "普通换人用尽后自动开放",
        body: "当某队本局普通换人已达 6 次上限，再进入局中换人时，系统会自动切到特殊换人。",
        keywords: ["自动切到特殊换人", "6次上限"],
      },
      {
        id: "special-extra",
        title: "普通换人未用尽时的开放条件",
        body: "如果当前存在处罚导致的受限配对，或普通球员仍停留在自由人区，系统也会允许切到特殊换人处理。",
        keywords: ["处罚", "自由人区", "允许切到特殊换人"],
      },
      {
        id: "special-reason",
        title: "特殊换人需要填写原因",
        body: "特殊换人需选择原因，当前支持伤病、本局禁赛、全场禁赛和其他四类原因。",
        keywords: ["伤病", "本局禁赛", "全场禁赛", "其他"],
      },
      {
        id: "special-scope",
        title: "只有符合条件的球员能被选中",
        body: "在受限场景下，特殊换人不会对所有位置开放；只有当前满足规则的球员牌会保持可操作。",
        keywords: ["符合条件", "可操作", "受限场景"],
      },
      {
        id: "special-libero",
        title: "涉及自由人的特殊场景也在这里处理",
        body: "如果自由人本身涉及伤病或处罚等特殊情况，也是在特殊换人流程里处理，系统会同步更新相关名单与记录。",
        keywords: ["自由人特殊换人", "名单", "记录"],
      },
    ],
  },
  {
    id: "libero",
    no: "09",
    shortTitle: "自由人",
    title: "自由人常规换人与轮转限制",
    summary: "自由人和普通球员的规则完全不同，日常上下场靠拖拽，且受后排、发球位和同分限制约束。",
    keywords: ["自由人", "常规换人", "拖拽", "后排", "发球位", "同一分"],
    items: [
      {
        id: "libero-drag",
        title: "自由人常规换人只能拖拽",
        body: "自由人常规换人只能在比赛页完成，操作方式是把自由人从自由人区拖到目标球员位置，或从场上拖回自由人区。",
        keywords: ["拖拽", "自由人区", "比赛页"],
      },
      {
        id: "libero-back-row",
        title: "只能与后排球员交换",
        body: "自由人只能与符合规则的后排球员进行常规交换，不能直接替换前排球员。",
        keywords: ["后排", "不能替换前排"],
      },
      {
        id: "libero-server",
        title: "发球队自由人不能替换发球位",
        body: "如果自由人所在一方当前是发球队，则该自由人不能再去替换当前发球位球员。",
        keywords: ["发球队", "发球位"],
      },
      {
        id: "libero-one-on-court",
        title: "同一时刻只能有 1 名自由人在场",
        body: "系统会持续校验自由人上场数量；一方同一时刻只允许 1 名自由人位于场上 6 人区。",
        keywords: ["1名自由人", "在场数量"],
      },
      {
        id: "libero-normal-player",
        title: "被换下去的普通球员会留在自由人区",
        body: "普通球员被自由人替换后会暂存于 2 人自由人区；此时该普通球员不能在自由人区直接做普通换人。",
        keywords: ["普通球员", "自由人区", "不能直接普通换人"],
      },
      {
        id: "libero-front-rotate",
        title: "自由人轮转到前排会自动换回",
        body: "当自由人随轮转进入前排时，系统会弹出提醒，并自动换回原位置普通球员，避免非法站位继续存在。",
        keywords: ["前排", "自动换回", "轮转提醒"],
      },
      {
        id: "libero-same-point",
        title: "前排自动换回后同一分内不能再上场",
        body: "如果自由人刚因前排轮转被系统自动换回，该自由人在同一分内不能再次替换后排球员；要到下一分才恢复可拖拽。",
        keywords: ["同一分", "不能再次替换", "下一分恢复"],
      },
    ],
  },
  {
    id: "between-sets",
    no: "10",
    shortTitle: "局间配置",
    title: "局间配置、修正录入与继续下一局",
    summary: "除了局中操作外，比赛页还支持修正录入和局间配置，这两种流程都不等于局中换人。",
    keywords: ["局间配置", "修正录入", "继续下一局", "编辑球员"],
    items: [
      {
        id: "edit-mode",
        title: "修正录入只用于改错",
        body: "“修正录入错误”用于更正赛前或刚才录入错的阵容信息，不是局中换人，因此不会计入换人记录。",
        keywords: ["修正录入", "不计入换人记录"],
      },
      {
        id: "between-sets-setup",
        title: "局间配置沿用上一局再微调",
        body: "每局结束后，系统会把上一局结束时的阵容和场区作为下一局的基础，用户可在此基础上继续核对或修改。",
        keywords: ["上一局", "下一局", "沿用"],
      },
      {
        id: "between-sets-side",
        title: "局间可继续调整发球与场区",
        body: "局间配置阶段可重新确认下一局发球队、场区和场上 6 人，确认后才会进入下一局。",
        keywords: ["发球队", "场区", "场上6人"],
      },
      {
        id: "between-sets-captain",
        title: "确认下一局前仍要追认场上队长",
        body: "无论是修正录入还是局间配置，只要会影响当前上场阵容，继续记分前都可能再次要求确认场上队长。",
        keywords: ["场上队长", "继续记分前", "再次确认"],
      },
    ],
  },
  {
    id: "result",
    no: "11",
    shortTitle: "结果",
    title: "结果页、比赛记录与赛后回看",
    summary: "比赛结束后，结果页既是总览页，也是复核比分、换人和暂停记录的主要入口。",
    keywords: ["结果页", "比赛记录", "得分进程", "记分表", "回看"],
    items: [
      {
        id: "result-score",
        title: "比分与胜负总览",
        body: "结果页会展示整场大比分、各局小比分、每局胜方和局时，适合赛后快速复核。",
        keywords: ["大比分", "小比分", "胜方", "局时"],
      },
      {
        id: "result-progress",
        title: "得分进程",
        body: "可按局查看本局的得分进程，用来回看比分是如何逐步形成的。",
        keywords: ["得分进程", "按局查看"],
      },
      {
        id: "result-log",
        title: "比赛记录",
        body: "比赛记录会保留记分、暂停、普通换人、特殊换人、自由人常规换人、手动轮转、换边和撤回等信息。",
        keywords: ["比赛记录", "暂停", "普通换人", "特殊换人", "自由人常规换人", "撤回"],
      },
      {
        id: "result-sheet",
        title: "记分表",
        body: "结果页可进一步查看记分表，用于赛后核对每局的暂停、换人和比分汇总。",
        keywords: ["记分表", "汇总"],
      },
      {
        id: "result-resume",
        title: "从首页回看最近一次结果",
        body: "如果最近一次保存的是已结束比赛，首页会直接提供返回结果页入口，便于再次查看最终记录。",
        keywords: ["返回结果页", "最近一次结果"],
      },
    ],
  },
];

function buildSectionViews(sections: GuideSection[]): GuideSectionView[] {
  return sections.map((section, sectionIndex) => ({
    ...section,
    anchorId: "guide-section-" + section.id,
    items: section.items.map((item, index) => ({
      ...item,
      no: String(sectionIndex + 1) + "." + String(index + 1),
      anchorId: "guide-item-" + section.id + "-" + item.id,
    })),
  }));
}

Page({
  data: {
    customNavTop: "10px",
    customNavOffset: "54px",
    scrollIntoView: "",
    displaySections: buildSectionViews(GUIDE_SECTIONS) as GuideSectionView[],
    activeSectionId: "",
  },
  themeOff: null as null | (() => void),

  onLoad() {
    this.syncCustomNavTop();
    this.applyNavigationTheme();
    const sections = buildSectionViews(GUIDE_SECTIONS);
    const initialSection = sections[0] || null;
    this.setData({
      displaySections: sections,
      activeSectionId: initialSection ? initialSection.id : "",
    });
  },

  onShow() {
    this.syncCustomNavTop();
    this.applyNavigationTheme();
    if (!this.themeOff) {
      this.themeOff = bindThemeChange(() => {
        this.applyNavigationTheme();
      });
    }
  },

  onUnload() {
    if (this.themeOff) {
      this.themeOff();
      this.themeOff = null;
    }
  },

  syncCustomNavTop() {
    const sys = wx.getSystemInfoSync();
    const fallback = Number(sys.statusBarHeight || 0) + 6;
    let navTop = fallback;
    try {
      const menu = wx.getMenuButtonBoundingClientRect();
      if (
        menu &&
        typeof menu.top === "number" &&
        typeof menu.height === "number" &&
        menu.top >= 0 &&
        menu.height > 0
      ) {
        navTop = menu.top - (44 - menu.height) / 2;
      }
    } catch (_e) {}
    const roundedTop = Math.max(0, Math.round(navTop));
    this.setData({
      customNavTop: String(roundedTop) + "px",
      customNavOffset: String(roundedTop + 44) + "px",
    });
  },

  applyNavigationTheme() {
    applyNavigationBarTheme();
  },

  onJumpSection(e: WechatMiniprogram.TouchEvent) {
    const id = String(((e.currentTarget && e.currentTarget.dataset) as { id?: string }).id || "");
    if (!id) {
      return;
    }
    this.setData({
      activeSectionId: id,
      scrollIntoView: "guide-section-" + id,
    });
  },

  onBackTap() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.reLaunch({ url: "/pages/home/home" });
  },
});

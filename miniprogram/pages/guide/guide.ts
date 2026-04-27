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

type GuideSectionAnchor = {
  id: string;
  top: number;
};

const GUIDE_SECTION_SWITCH_OFFSET = 56;

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "welcome",
    no: "01",
    shortTitle: "欢迎",
    title: "欢迎使用",
    summary: "为排球比赛记录而设计。一个人可以完成整场，多人也能顺畅协同。",
    keywords: ["欢迎", "关于我们", "协同", "接管", "时限", "数据留存"],
    items: [
      {
        id: "about-app",
        title: "它负责什么",
        body: "从赛前录入，到比赛中的记分、暂停、换人，再到赛后结果查看，一场比赛需要记录的核心流程都集中在这里。",
        keywords: ["关于我们", "记分", "换人", "结果", "协同"],
      },
      {
        id: "basic-mechanism",
        title: "一个人可以，多人也可以",
        body: "它既可以作为单人记分工具，也可以把同一场比赛共享给多名裁判。进入同一房间后，大家看到的是同一份比赛数据。",
        keywords: ["单人", "多人", "协作", "同一房间"],
      },
      {
        id: "authority-rule",
        title: "协同如何进行",
        body: "多人同时进入时，任一时刻只会保留一台设备的操作权，其余设备同步查看。需要继续记录时，再接管即可。",
        keywords: ["操作权", "旁观", "接管", "多人协作"],
      },
      {
        id: "room-ttl",
        title: "数据会保留多久",
        body: "房间默认保留约 6 小时；到时如果比赛已经开始但仍未结束，会一次性再延长约 3 小时。比赛结束后的结果默认保留约 24 小时，建议尽早留存。",
        keywords: ["6小时", "3小时", "24小时", "数据留存", "不可恢复"],
      },
    ],
  },
  {
    id: "create",
    no: "02",
    shortTitle: "创建",
    title: "创建一场比赛",
    summary: "把基础信息确认完整，再决定自己继续，还是邀请其他裁判一起进入。",
    keywords: ["创建", "队名", "颜色", "队长", "邀请其他裁判", "继续进入比赛"],
    items: [
      {
        id: "create-purpose",
        title: "从一个人开始也可以",
        body: "创建房间后，可以由创建者独立完成整场比赛；如果之后需要协同，再把房间分享给其他裁判即可。",
        keywords: ["单人使用", "共享", "协作"],
      },
      {
        id: "create-required-info",
        title: "进入比赛前要确认什么",
        body: "创建时需要确认双方队名、球队颜色、首发与自由人号码、球队队长，以及首局发球和场区。进入比赛页后，这些基础信息会被锁定，不再修改。",
        keywords: ["队名", "颜色", "球队队长", "锁定", "不可修改"],
      },
      {
        id: "create-share",
        title: "邀请协同，或直接继续",
        body: "如果需要多人协作，可以点击“邀请其他裁判”发送分享卡片；如果只打算自己使用，直接继续进入比赛即可。",
        keywords: ["邀请其他裁判", "分享卡片", "继续进入比赛"],
      },
    ],
  },
  {
    id: "join",
    no: "03",
    shortTitle: "加入",
    title: "加入现有比赛",
    summary: "可以从分享卡片进入，也可以手动输入房间号和密码，或直接回到最近一次处理过的比赛。",
    keywords: ["加入房间", "分享卡片", "房间号", "密码", "继续上次比赛"],
    items: [
      {
        id: "join-share-card",
        title: "从分享卡片进入",
        body: "点击创建者分享的小程序卡片后，系统会自动识别房间号和密码，并直接进入加入流程，通常不需要再手动补填。",
        keywords: ["分享卡片", "自动解析", "自动带入密码"],
      },
      {
        id: "join-manual",
        title: "手动输入加入",
        body: "也可以在首页点击“加入比赛”，手动输入 6 位裁判团队编号和 6 位密码。房间号和密码会显示在比赛页顶部，方便直接照着填写。",
        keywords: ["首页加入", "手动输入", "房间号", "密码"],
      },
      {
        id: "join-resume",
        title: "回到最近一次比赛",
        body: "如果本机刚刚处理过一场比赛，且本地缓存仍在，首页顶部会直接给出返回入口，回到比赛页或结果页。",
        keywords: ["继续上次比赛", "返回上次比赛结果", "缓存"],
      },
      {
        id: "join-control-role",
        title: "协同中的控制权限",
        body: "比赛进行时，同一时刻只保留一台设备处于裁判模式，其余设备默认进入观赛模式。需要继续记录时，可以随时点击“接管”。如果当前房间已经没有正在控制的设备，后来进入的第一位裁判会直接进入裁判模式。",
        keywords: ["裁判模式", "观赛模式", "接管", "控制权限"],
      },
    ],
  },
  {
    id: "control",
    no: "04",
    shortTitle: "控场",
    title: "了解比赛页的控制流程",
    summary: "开始比赛、每局前确认、暂停、轮转、换边、局间配置和编辑球员，都从这里完成。",
    keywords: ["控场", "开始比赛", "场上队长", "暂停", "换边", "手动轮转", "局间配置", "编辑球员"],
    items: [
      {
        id: "control-start",
        title: "每局开始前",
        body: "每局比赛前，都需要先确认两队场上队长，再点击“开始比赛”。如果球队队长就在场上 6 人中，系统会自动锁定为本局场上队长。",
        keywords: ["每局比赛前", "场上队长", "开始比赛", "自动锁定"],
      },
      {
        id: "control-timeout",
        title: "暂停功能",
        body: "两队的暂停都在比赛页直接发起。开始暂停后，页面会同步显示 30 秒倒计时，并记录到操作记录里。",
        keywords: ["暂停", "30秒", "操作记录"],
      },
      {
        id: "control-rotate",
        title: "轮转功能",
        body: "记分会按规则自动带动轮转；如果现场需要手动调整，也可以直接使用比赛页的轮转入口完成修正。",
        keywords: ["轮转", "自动轮转", "手动轮转", "修正"],
      },
      {
        id: "control-switch-side",
        title: "换边功能",
        body: "比赛页提供手动换边入口。决胜局到 8 分时，如需换边，页面也会给出对应提示。",
        keywords: ["换边", "手动换边", "决胜局", "8分"],
      },
      {
        id: "control-edit-players",
        title: "编辑球员功能",
        body: "如果录入有误，可以进入编辑球员模式修正场上号码。这一流程只用于修正录入，不计入换人记录。",
        keywords: ["编辑球员", "修正录入", "不计入换人记录"],
      },
      {
        id: "control-between-sets",
        title: "局间配置",
        body: "每局结束后会进入局间配置。这里会回到上一局首发阵容，用来确认下一局的场上人员、发球方和场区，再继续进入下一局。",
        keywords: ["局间配置", "上一局首发", "下一局", "发球方", "场区"],
      },
    ],
  },
  {
    id: "score",
    no: "05",
    shortTitle: "计分",
    title: "把每一分记下",
    summary: "比分、发球权和轮转会跟着每一次记分一起推进，也可以及时撤回。",
    keywords: ["计分", "加分", "发球权", "轮转", "撤回"],
    items: [
      {
        id: "score-how",
        title: "如何计分",
        body: "点击对应球队的加分按钮后，系统会同步更新比分、发球权，以及需要轮转的一侧。",
        keywords: ["加分", "比分", "发球权", "轮转"],
      },
      {
        id: "score-undo",
        title: "如何退回",
        body: "如果刚刚记录有误，可以直接撤回最后一分。撤回会连同这一分带来的轮转和记录一起退回。",
        keywords: ["撤回最后一分", "回退", "轮转"],
      },
      {
        id: "score-review",
        title: "记录会实时更新",
        body: "得分进程和操作记录会随着比赛同步更新，方便在记录过程中随时核对当前局面。",
        keywords: ["得分进程", "操作记录", "实时更新"],
      },
    ],
  },
  {
    id: "normal-sub",
    no: "06",
    shortTitle: "普通换人",
    title: "处理普通换人",
    summary: "这是场上 6 名普通球员之间的常规换人，也是比赛里最常用的一条换人路径。",
    keywords: ["普通换人", "快捷换人", "场上6人", "配对", "6次"],
    items: [
      {
        id: "normal-sub-entry",
        title: "发起入口",
        body: "可以先点球队的换人按钮进入换人面板，也可以直接点击场上 6 人区的普通球员牌，快速进入同一套普通换人流程。",
        keywords: ["换人按钮", "球员牌", "快捷换人"],
      },
      {
        id: "normal-sub-scope",
        title: "适用于哪些球员",
        body: "普通换人只适用于场上 6 名普通球员，不适用于自由人，也不能直接把自由人换上到普通球员位置。",
        keywords: ["场上6人", "普通球员", "自由人"],
      },
      {
        id: "normal-sub-limit",
        title: "主要限制是什么",
        body: "同一局每队最多 6 次普通换人，并且需要按既有配对完成换回。球员如果已经完成来回两次，或当前停在自由人区，也不能继续按普通换人处理。",
        keywords: ["6次", "配对换回", "锁定", "自由人区"],
      },
    ],
  },
  {
    id: "special-sub",
    no: "07",
    shortTitle: "特殊换人",
    title: "处理特殊换人",
    summary: "当普通换人不再适用时，页面会开放特殊换人的入口，继续完成这次调整。",
    keywords: ["特殊换人", "普通换人已满", "限制条件"],
    items: [
      {
        id: "special-sub-when",
        title: "开放条件",
        body: "通常在普通换人次数已满，或当前球员已经不满足普通换人条件时，系统才会开放特殊换人。",
        keywords: ["开放条件", "普通换人已满", "不满足普通换人"],
      },
      {
        id: "special-sub-how",
        title: "如何完成这次换人",
        body: "仍然是在同一个换人面板里完成：先选要换下的球员，再输入换上号码，确认后记录会直接写入本局操作记录。",
        keywords: ["换人面板", "换下", "换上", "操作记录"],
      },
      {
        id: "special-sub-impact",
        title: "换人后的限制",
        body: "一旦按特殊换人处理，被换下的球员本场不再上场。页面里也不会再区分伤病或处罚原因，记录会统一显示为特殊换人。",
        keywords: ["本场不能再上", "统一显示", "特殊换人"],
      },
    ],
  },
  {
    id: "libero",
    no: "08",
    shortTitle: "自由人常规换人",
    title: "处理自由人常规换人",
    summary: "自由人常规换人不通过换人面板，而是直接在比赛页完成。",
    keywords: ["自由人常规换人", "拖拽", "后排", "自动换回"],
    items: [
      {
        id: "libero-how",
        title: "完成方式",
        body: "自由人常规换人不通过换人弹窗。请直接在比赛页把自由人拖到目标位置完成替换。",
        keywords: ["拖拽", "比赛页", "目标位置"],
      },
      {
        id: "libero-scope",
        title: "适用位置",
        body: "它只发生在自由人区和场上后排之间，前排位置不能直接执行自由人常规换人。",
        keywords: ["自由人区", "后排", "前排不可替换"],
      },
      {
        id: "libero-auto-return",
        title: "前排处理",
        body: "如果自由人因为轮转来到前排，页面会提示自动换回。被自动换下的自由人，同一分内不能再次替换后排球员。",
        keywords: ["前排", "自动换回", "同一分限制"],
      },
    ],
  },
  {
    id: "result",
    no: "09",
    shortTitle: "结果",
    title: "回看比赛结果",
    summary: "比赛结束后，这里用来快速复核整场比赛，也适合把需要的内容保存下来。",
    keywords: ["结果页", "比局", "小比分", "局时间", "得分进程", "计分表"],
    items: [
      {
        id: "result-what",
        title: "结果页会显示什么",
        body: "结果页会展示整场比局、各局小比分、局时间、得分进程和比赛记录，适合赛后快速复核。",
        keywords: ["整场比局", "各局小比分", "局时间", "得分进程", "比赛记录"],
      },
      {
        id: "result-sheet",
        title: "可以直接留存计分表",
        body: "如果需要留存或转发，可以直接生成计分表图片，把这场比赛的记录保存下来。",
        keywords: ["计分表", "图片", "留存", "转发"],
      },
    ],
  },
  {
    id: "support",
    no: "10",
    shortTitle: "反馈",
    title: "联系我们",
    summary: "指南会继续补充，产品也会继续打磨。遇到问题，或有新的想法，都可以直接联系。",
    keywords: ["反馈", "支持", "联系我们", "建议", "问题"],
    items: [
      {
        id: "support-issue",
        title: "遇到使用问题",
        body: "如果在使用过程中遇到操作疑问、显示异常，或比赛流程和预期不一致，可以在首页点击“联系我们”，直接反馈给开发者。",
        keywords: ["使用问题", "显示异常", "联系我们", "反馈"],
      },
      {
        id: "support-idea",
        title: "有新的想法",
        body: "如果你对功能设计、交互方式，或比赛记录流程有更好的想法，也欢迎通过首页“联系我们”继续交流。",
        keywords: ["建议", "想法", "讨论", "联系我们"],
      },
    ],
  },
];

function buildSectionViews(sections: GuideSection[]): GuideSectionView[] {
  const safeSections = Array.isArray(sections) ? sections : [];
  return safeSections.map((section, sectionIndex) => {
    const safeItems = Array.isArray((section as GuideSection).items) ? (section as GuideSection).items : [];
    return {
      ...section,
      anchorId: "guide-section-" + String(section && section.id ? section.id : sectionIndex),
      items: safeItems.map((item, index) => ({
        ...item,
        no: String(sectionIndex + 1) + "." + String(index + 1),
        anchorId:
          "guide-item-" +
          String(section && section.id ? section.id : sectionIndex) +
          "-" +
          String(item && item.id ? item.id : index),
      })),
    };
  });
}

Page({
  data: {
    customNavTop: "10px",
    customNavOffset: "54px",
    scrollIntoView: "",
    displaySections: [] as GuideSectionView[],
    activeSectionId: "",
  },
  themeOff: null as null | (() => void),
  sectionAnchors: [] as GuideSectionAnchor[],
  sectionMeasureTimer: 0 as number,
  pageActive: true as boolean,
  routePending: false as boolean,

  onLoad() {
    this.pageActive = true;
    this.routePending = false;
    this.syncCustomNavTop();
    this.applyNavigationTheme();
    const sections = buildSectionViews(GUIDE_SECTIONS);
    const initialSection = sections[0] || null;
    this.setData({
      displaySections: sections,
      activeSectionId: initialSection ? initialSection.id : "",
    });
  },

  onReady() {
    this.measureSectionAnchors();
    this.scheduleSectionAnchorMeasure();
  },

  onShow() {
    this.pageActive = true;
    this.routePending = false;
    this.syncCustomNavTop();
    this.applyNavigationTheme();
    if (!this.themeOff) {
      this.themeOff = bindThemeChange(() => {
        this.applyNavigationTheme();
      });
    }
    this.scheduleSectionAnchorMeasure();
  },

  onHide() {
    this.pageActive = false;
  },

  onUnload() {
    this.pageActive = false;
    if (this.themeOff) {
      this.themeOff();
      this.themeOff = null;
    }
    if (this.sectionMeasureTimer) {
      clearTimeout(this.sectionMeasureTimer);
      this.sectionMeasureTimer = 0;
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

  scheduleSectionAnchorMeasure() {
    if (this.sectionMeasureTimer) {
      clearTimeout(this.sectionMeasureTimer);
    }
    this.sectionMeasureTimer = setTimeout(() => {
      this.sectionMeasureTimer = 0;
      this.measureSectionAnchors();
    }, 120) as unknown as number;
  },

  measureSectionAnchors() {
    const sections = Array.isArray(this.data.displaySections) ? this.data.displaySections : [];
    if (!sections.length) {
      this.sectionAnchors = [];
      return;
    }
    wx.nextTick(() => {
      const query = this.createSelectorQuery();
      query.select(".guide-scroll-content").boundingClientRect();
      query.selectAll(".guide-section").boundingClientRect();
      query.exec((res) => {
        const contentRect = (res && res[0]) as WechatMiniprogram.BoundingClientRectCallbackResult | null;
        const sectionRects = (res && res[1]) as WechatMiniprogram.BoundingClientRectCallbackResult[] | null;
        if (!contentRect || !Array.isArray(sectionRects) || !sectionRects.length) {
          return;
        }
        this.sectionAnchors = sections
          .map((section, index) => {
            const rect = sectionRects[index];
            if (!rect || typeof rect.top !== "number") {
              return null;
            }
            return {
              id: section.id,
              top: rect.top - contentRect.top,
            };
          })
          .filter((item): item is GuideSectionAnchor => Boolean(item));
      });
    });
  },

  updateActiveSectionByScrollTop(scrollTop: number) {
    const anchors = Array.isArray(this.sectionAnchors) ? this.sectionAnchors : [];
    if (!anchors.length) {
      return;
    }
    const currentTop = Math.max(0, Number(scrollTop || 0) + GUIDE_SECTION_SWITCH_OFFSET);
    let nextSectionId = anchors[0].id;
    anchors.forEach((anchor) => {
      if (currentTop >= anchor.top) {
        nextSectionId = anchor.id;
      }
    });
    if (nextSectionId !== this.data.activeSectionId) {
      this.setData({
        activeSectionId: nextSectionId,
      });
    }
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

  onContentScroll(e: WechatMiniprogram.ScrollViewScroll) {
    const scrollTop = Number((e.detail && e.detail.scrollTop) || 0);
    this.updateActiveSectionByScrollTop(scrollTop);
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

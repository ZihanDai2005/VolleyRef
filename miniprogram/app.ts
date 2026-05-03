// app.ts
App<IAppOption>({
  globalData: {
    clientId: "",
  },
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        appid: "wx83f91976f6791d9a",
        env: "cloudbase-2gckz40md6b7a105",
        traceUser: true,
      } as any);
    } else {
      console.warn("当前基础库不支持云开发，请升级后重试。");
    }

    const rawShowToast = wx.showToast.bind(wx);
    (wx as any).showToast = (options: WechatMiniprogram.ShowToastOption) => {
      return rawShowToast({
        duration: options && typeof options.duration === "number" ? options.duration : 3000,
        ...options,
      });
    };

    const storedLogs = wx.getStorageSync("logs");
    const logs = Array.isArray(storedLogs) ? storedLogs : [];
    logs.unshift(Date.now());
    wx.setStorageSync("logs", logs.slice(0, 20));

    const existingClientId = wx.getStorageSync("volleyball.clientId");
    const clientId =
      existingClientId ||
      "c_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e6).toString(36);
    this.globalData.clientId = clientId;
    wx.setStorageSync("volleyball.clientId", clientId);
  },
});

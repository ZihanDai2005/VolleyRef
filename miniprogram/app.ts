// app.ts
App<IAppOption>({
  globalData: {
    clientId: "",
  },
  onLaunch() {
    const logs = wx.getStorageSync("logs") || [];
    logs.unshift(Date.now());
    wx.setStorageSync("logs", logs);

    const existingClientId = wx.getStorageSync("volleyball.clientId");
    const clientId =
      existingClientId ||
      "c_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e6).toString(36);
    this.globalData.clientId = clientId;
    wx.setStorageSync("volleyball.clientId", clientId);

    wx.login({
      success: (res) => {
        console.log(res.code);
      },
    });
  },
});

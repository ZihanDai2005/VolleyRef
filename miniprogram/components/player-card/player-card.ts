Component({
  properties: {
    number: { type: null, value: "?" }, // 兼容number|string
    pos: { type: String, value: "" },
    color: { type: String, value: "#fff" },
    active: { type: Boolean, value: false },
  },
  methods: {
    onTouchStart() {
      this.setData({ active: true });
      this.triggerEvent("dragstart", {
        number: this.data.number,
        pos: this.data.pos,
      });
    },
    onTouchEnd() {
      this.setData({ active: false });
      this.triggerEvent("dragend", {
        number: this.data.number,
        pos: this.data.pos,
      });
    },
  },
});

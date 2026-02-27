Component({
  properties: {
    aScore: {
      type: Number,
      value: 0,
      observer(this: any, _newVal: number, oldVal: number) {
        if (typeof oldVal === "number") {
          this.triggerPulse("A");
        }
      },
    },
    bScore: {
      type: Number,
      value: 0,
      observer(this: any, _newVal: number, oldVal: number) {
        if (typeof oldVal === "number") {
          this.triggerPulse("B");
        }
      },
    },
    lastScoringTeam: {
      type: String,
      value: "",
    },
  },
  data: {
    pulseA: false,
    pulseB: false,
  },
  methods: {
    triggerPulse(team: "A" | "B") {
      if (team === "A") {
        this.setData({ pulseA: false });
        setTimeout(() => this.setData({ pulseA: true }), 0);
        setTimeout(() => this.setData({ pulseA: false }), 240);
      } else {
        this.setData({ pulseB: false });
        setTimeout(() => this.setData({ pulseB: true }), 0);
        setTimeout(() => this.setData({ pulseB: false }), 240);
      }
    },
    onAddScoreA() {
      this.triggerEvent("scoreChange", { team: "A", type: "add" });
    },
    onAddScoreB() {
      this.triggerEvent("scoreChange", { team: "B", type: "add" });
    },
  },
});

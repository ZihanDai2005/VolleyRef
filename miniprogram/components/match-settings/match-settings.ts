Component({
  properties: {
    sets: { type: Number, value: 5 },
    maxScore: { type: Number, value: 25 },
    finalSetScore: { type: Number, value: 15 },
  },
  data: {
    sets: 5,
    maxScore: 25,
    finalSetScore: 15,
  },
  methods: {
    onInputSets(e: any) {
      this.setData({ sets: Number(e.detail.value) });
    },
    onInputMaxScore(e: any) {
      this.setData({ maxScore: Number(e.detail.value) });
    },
    onInputFinalSetScore(e: any) {
      this.setData({ finalSetScore: Number(e.detail.value) });
    },
    onConfirm() {
      this.triggerEvent("confirm", {
        sets: this.data.sets,
        maxScore: this.data.maxScore,
        finalSetScore: this.data.finalSetScore,
      });
    },
  },
});

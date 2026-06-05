/* Calc — pure calculation helpers. Mirrors the Excel formulas. */
(function (global) {
  const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const Calc = {
    /* Concrete cubic yards: (L_ft * W_ft * (D_in/12)) / 27 */
    concreteCuYd(lengthFt, widthFt, depthIn) {
      return (num(lengthFt) * num(widthFt) * (num(depthIn) / 12)) / 27;
    },

    /* Footing cubic yards: length in ft, width & depth in inches.
       (L_ft * (W_in/12) * (D_in/12)) / 27 */
    footingCuYd(lengthFt, widthIn, depthIn) {
      return (num(lengthFt) * (num(widthIn) / 12) * (num(depthIn) / 12)) / 27;
    },

    /* Area square feet = L * W */
    areaSqFt(lengthFt, widthFt) {
      return num(lengthFt) * num(widthFt);
    },

    /* Estimated rebar count = area / spacing (Excel uses area/16) */
    rebarEstimate(areaSqFt, spacing) {
      const s = num(spacing) || 16;
      return num(areaSqFt) / s;
    },

    sqftPrice(areaSqFt, pricePerSqFt) {
      return num(areaSqFt) * num(pricePerSqFt);
    },

    lineTotal(qty, unitPrice) {
      return num(qty) * num(unitPrice);
    },

    round2(n) {
      return Math.round((num(n) + Number.EPSILON) * 100) / 100;
    },

    fmtNum(n, decimals) {
      const d = decimals == null ? 2 : decimals;
      return num(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    },

    fmtMoney(n) {
      return '$' + this.fmtNum(n, 2);
    },

    num
  };

  global.Calc = Calc;
})(window);

const enabled = String(process.env.COST_GUARDRAILS_ENABLED || "").toLowerCase() === "true";
const MAX_IMAGEN_PER_VIDEO = Number(process.env.MAX_IMAGEN_PER_VIDEO || 5);
const VIDEO_BUDGET_USD = Number(process.env.VIDEO_BUDGET_USD || 10);
const DAILY_BUDGET_USD = Number(process.env.DAILY_BUDGET_USD || 50);
const COSTS = {
  imagen_gen: Number(process.env.COST_IMAGEN_USD || 0.2),
  vision_analysis: Number(process.env.COST_VISION_USD || 0.01),
  prediction: Number(process.env.COST_PREDICT_USD || 0.01),
  caption_gen: Number(process.env.COST_CAPTION_USD || 0.01),
};

const state = {
  perVideo: new Map(),
  dailyTotal: 0,
  dayStartMs: Date.now(),
};

function resetDailyIfNeeded() {
  const now = Date.now();
  if (now - state.dayStartMs > 24 * 60 * 60 * 1000) {
    state.dailyTotal = 0;
    state.dayStartMs = now;
  }
}

function getVideoSpend(videoId) {
  const v = state.perVideo.get(videoId) || { spend: 0, imagenCount: 0 };
  state.perVideo.set(videoId, v);
  return v;
}

function check(videoId, type, units) {
  if (!enabled) return { allowed: true };
  resetDailyIfNeeded();
  const costPerUnit = COSTS[type] || 0;
  const increment = costPerUnit * Math.max(1, Number(units || 1));
  const v = getVideoSpend(videoId);
  if (type === "imagen_gen" && v.imagenCount + Math.max(1, Number(units || 1)) > MAX_IMAGEN_PER_VIDEO) {
    return { allowed: false, reason: "per_video_imagen_limit", remaining: Math.max(0, MAX_IMAGEN_PER_VIDEO - v.imagenCount) };
  }
  if (v.spend + increment > VIDEO_BUDGET_USD) {
    return { allowed: false, reason: "per_video_budget", remaining: Math.max(0, VIDEO_BUDGET_USD - v.spend) };
  }
  if (state.dailyTotal + increment > DAILY_BUDGET_USD) {
    return { allowed: false, reason: "daily_budget", remaining: Math.max(0, DAILY_BUDGET_USD - state.dailyTotal) };
  }
  return { allowed: true, increment };
}

function commit(videoId, type, units) {
  if (!enabled) return;
  const res = check(videoId, type, units);
  if (!res.allowed) return;
  const v = getVideoSpend(videoId);
  const countUnits = Math.max(1, Number(units || 1));
  if (type === "imagen_gen") v.imagenCount += countUnits;
  v.spend += res.increment;
  state.dailyTotal += res.increment;
}

function getStatus(videoId) {
  const v = getVideoSpend(videoId);
  resetDailyIfNeeded();
  return {
    enabled,
    perVideo: { spendUSD: Number(v.spend.toFixed(4)), imagenCount: v.imagenCount, budgetUSD: VIDEO_BUDGET_USD },
    daily: { spendUSD: Number(state.dailyTotal.toFixed(4)), budgetUSD: DAILY_BUDGET_USD },
    costs: COSTS,
    limits: { MAX_IMAGEN_PER_VIDEO },
  };
}

module.exports = { enabled, check, commit, getStatus };

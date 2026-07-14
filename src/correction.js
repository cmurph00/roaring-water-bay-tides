/**
 * Opt-in secondary-port correction for a saved "home spot" whose nearest bundled gauge is distant.
 * correction = { timeOffsetMin: { high, low } }. Undefined/null ⇒ passthrough.
 * This is the explicit, local, correct version of the origin app's global offset hack.
 */
export function applyCorrection(tides, correction) {
  if (!correction || !correction.timeOffsetMin) return tides;
  const { high, low } = correction.timeOffsetMin;
  return tides.map((t) => {
    const offsetMin = t.type === "high" ? high : low;
    return { ...t, time: new Date(t.time.getTime() + offsetMin * 60000) };
  });
}

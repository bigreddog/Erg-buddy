export const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
export function variation(values) {
  if (values.length < 2 || mean(values) <= 0) return null;
  const avg = mean(values);
  return Math.sqrt(mean(values.map(v => (v - avg) ** 2))) / avg;
}
export const validStroke = s => ['drive','recovery','driveLength','work'].every(key => Number.isFinite(s[key]) && s[key] > 0);
export function analyse(strokes, { targetRate = 22, targetRatio = 2 } = {}) {
  const window = strokes.slice(-12).filter(validStroke);
  if (window.length < 8) return { score: null, title: 'Find your rhythm', cue: `Row ${8 - window.length} more complete strokes to build a baseline.`, sample: window.length };
  const ratios = window.map(s => s.recovery / s.drive);
  const ratio = mean(ratios), rate = mean(window.map(s => 60 / (s.drive + s.recovery)));
  const workCV = variation(window.map(s => s.work));
  const lengthCV = variation(window.map(s => s.driveLength));
  const timingCV = variation(window.map(s => s.drive + s.recovery));
  const consistency = Math.max(0, 100 - (workCV * 0.5 + timingCV * 0.3 + lengthCV * 0.2) * 400);
  const rhythm = Math.max(0, 100 - Math.abs(ratio - targetRatio) / targetRatio * 80);
  const score = Math.round(consistency * 0.7 + rhythm * 0.3);
  let title = 'Keep that rhythm', cue = 'Keep the drive connected and the recovery relaxed.';
  if (ratio < targetRatio * 0.8) { title = 'Give the recovery time'; cue = 'Hands away, body forward, then slide. Give the recovery more time.'; }
  else if (workCV > 0.12) { title = 'Repeat each drive'; cue = 'Match the pressure on your next few drives.'; }
  else if (lengthCV > 0.08) { title = 'Match stroke length'; cue = 'Aim for a comfortable, repeatable reach. Avoid forcing extra length.'; }
  else if (Math.abs(rate - targetRate) > 2) { title = rate > targetRate ? 'Ease the rate' : 'Lift the rate'; cue = `Aim for ${targetRate} spm. Adjust the recovery; keep the drive controlled.`; }
  else if (ratio > targetRatio * 1.25) { title = 'Balance the rhythm'; cue = 'Ease the recovery toward your target, if it suits this session.'; }
  return { score, consistency: Math.round(consistency), rhythm: Math.round(rhythm), ratio, rate, workCV, lengthCV, timingCV, title, cue, sample: window.length };
}

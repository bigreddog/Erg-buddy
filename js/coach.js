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
  let title = 'Keep that rhythm', cue = 'Repeat this effort. Keep the drive connected and the recovery relaxed.';
  if (ratio < targetRatio * 0.8) { title = 'Give the recovery time'; cue = 'Let the handle move away, hinge forward, then slide. Try a little more recovery time at the same effort.'; }
  else if (workCV > 0.12) { title = 'Make each drive repeatable'; cue = 'Your work per stroke is varying. Try matching the pressure on the next few drives.'; }
  else if (lengthCV > 0.08) { title = 'Repeat your stroke length'; cue = 'The monitor reports changing drive length. Aim for a comfortable, repeatable reach; avoid forcing extra length.'; }
  else if (Math.abs(rate - targetRate) > 2) { title = rate > targetRate ? 'Ease the stroke rate' : 'Lift the stroke rate gently'; cue = `Aim for ${targetRate} spm. Adjust the recovery gradually while keeping the drive controlled.`; }
  else if (ratio > targetRatio * 1.25) { title = 'Bring the rhythm together'; cue = 'Your recovery is longer than your chosen target. Bring it in gently if that suits this session.'; }
  return { score, consistency: Math.round(consistency), rhythm: Math.round(rhythm), ratio, rate, workCV, lengthCV, timingCV, title, cue, sample: window.length };
}

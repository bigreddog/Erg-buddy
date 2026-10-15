import { validStroke } from './coach.js';
export class Recording {
  constructor(source, settings, startedAt = new Date().toISOString()) {
    this.version = 1; this.source = source; this.settings = { ...settings }; this.startedAt = startedAt; this.strokes = [];
  }
  add(stroke) {
    if (!validStroke(stroke)) return false;
    const previous = this.strokes.at(-1);
    if (previous && (stroke.elapsed < previous.elapsed || stroke.distance < previous.distance || stroke.count < previous.count)) return 'reset';
    if (previous && stroke.count === previous.count) return false;
    this.strokes.push({ ...stroke }); return true;
  }
  finish() {
    if (!this.strokes.length) return null;
    const first = this.strokes[0], last = this.strokes.at(-1);
    return { version: this.version, source: this.source, settings: this.settings, startedAt: this.startedAt, endedAt: new Date().toISOString(), duration: this.strokes.reduce((sum,s) => sum + s.drive + s.recovery,0), distance: this.strokes.reduce((sum,s) => sum + s.strokeDistance,0), monitorElapsedSpan: Math.max(0,last.elapsed - first.elapsed), strokes: this.strokes, forceCurves: this.curves || [], forceCurveDiagnostics: this.curveDiagnostics || null };
  }
}
export function csv(session) {
  const fields = ['elapsed','distance','count','pace','rate','power','hr','drive','recovery','driveLength','strokeDistance','work','peakForceLbs','averageForceLbs','score'];
  return `# Erg Buddy ${session.source} session\n` + fields.join(',') + '\n' + session.strokes.map(s => fields.map(f => Number.isFinite(s[f]) ? s[f] : '').join(',')).join('\n');
}

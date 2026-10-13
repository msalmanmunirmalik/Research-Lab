/** Lab Tools library - calculators, designers, simulators, visualizers */

export type ToolCategoryId =
  | 'solutions'
  | 'molecular'
  | 'cells'
  | 'sequence'
  | 'kinetics'
  | 'design';

export type ToolKind = 'calculator' | 'designer' | 'simulator' | 'visualizer';

export type FieldKind = 'number' | 'text' | 'select';

export type ToolField = {
  id: string;
  label: string;
  unit?: string;
  kind: FieldKind;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
};

export type ChartSeries = {
  id: string;
  label: string;
  xUnit?: string;
  yUnit?: string;
  points: { x: number; y: number }[];
};

export type ResultBar = {
  label: string;
  value: number;
  max: number;
  display: string;
  tone?: 'ok' | 'warn' | 'bad' | 'neutral';
};

export type SequenceHighlight = {
  start: number;
  end: number;
  label: string;
  tone?: 'ok' | 'warn' | 'accent';
};

export type ToolResult = {
  scalars: Record<string, string>;
  series?: ChartSeries[];
  bars?: ResultBar[];
  sequenceMap?: { seq: string; highlights: SequenceHighlight[] };
  tips?: string[];
};

export type ToolDef = {
  id: string;
  name: string;
  summary: string;
  category: ToolCategoryId;
  kind: ToolKind;
  formula?: string;
  fields: ToolField[];
  defaults?: Record<string, string>;
  /** One-click demo inputs so researchers can see graphs immediately */
  sample?: Record<string, string>;
  compute: (values: Record<string, string>) => ToolResult;
};

export type WorkflowKit = {
  id: string;
  name: string;
  summary: string;
  toolIds: string[];
};

export const TOOL_CATEGORIES: { id: ToolCategoryId | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'solutions', label: 'Solutions' },
  { id: 'molecular', label: 'PCR & cloning' },
  { id: 'design', label: 'Designers' },
  { id: 'sequence', label: 'Sequence' },
  { id: 'cells', label: 'Culture' },
  { id: 'kinetics', label: 'Kinetics' },
];

export const KIND_LABEL: Record<ToolKind, string> = {
  calculator: 'Calculator',
  designer: 'Designer',
  simulator: 'Simulator',
  visualizer: 'Visualizer',
};

export const num = (v: string | undefined) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const fmt = (n: number, digits = 4) => {
  if (!Number.isFinite(n)) return '-';
  if (Math.abs(n) >= 1e4 || (Math.abs(n) > 0 && Math.abs(n) < 0.001)) {
    return n.toExponential(3);
  }
  return Number(n.toFixed(digits)).toString();
};

const empty = (hint: string): ToolResult => ({
  scalars: { hint },
  tips: [hint],
});

export const cleanDna = (seq: string) => seq.toUpperCase().replace(/[^ATGC]/g, '');

/** Shared demo DNA with common restriction sites for Load example */
const DEMO_DNA =
  'ATGGCCATGGAATTCGGATCCGTCGACAAGCTTCTCGAGGCGGCCGCATGCATCATCATCATCATCACGGATCCGAATTCAAGCTTGTCGAC';

export const gcContent = (seq: string) => {
  const s = cleanDna(seq);
  if (!s.length) return 0;
  return ((s.match(/[GC]/g) || []).length / s.length) * 100;
};

/** Wallace / Marmur–Schildkraut–Doty hybrid for oligo Tm */
export const oligoTm = (seq: string) => {
  const s = cleanDna(seq);
  if (!s.length) return 0;
  if (s.length < 14) {
    const at = (s.match(/[AT]/g) || []).length;
    const gc = (s.match(/[GC]/g) || []).length;
    return 2 * at + 4 * gc;
  }
  return 81.5 + 0.41 * gcContent(s) - 675 / s.length;
};

export const revComp = (seq: string) =>
  cleanDna(seq)
    .split('')
    .reverse()
    .map((b) => ({ A: 'T', T: 'A', C: 'G', G: 'C' }[b] || b))
    .join('');

const RESTRICTION_ENZYMES = [
  { name: 'EcoRI', sequence: 'GAATTC' },
  { name: 'BamHI', sequence: 'GGATCC' },
  { name: 'HindIII', sequence: 'AAGCTT' },
  { name: 'XhoI', sequence: 'CTCGAG' },
  { name: 'NotI', sequence: 'GCGGCCGC' },
  { name: 'SalI', sequence: 'GTCGAC' },
  { name: 'PstI', sequence: 'CTGCAG' },
  { name: 'KpnI', sequence: 'GGTACC' },
  { name: 'SmaI', sequence: 'CCCGGG' },
  { name: 'SacI', sequence: 'GAGCTC' },
  { name: 'NdeI', sequence: 'CATATG' },
  { name: 'NcoI', sequence: 'CCATGG' },
];

const CODONS: Record<string, string> = {
  TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L',
  TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S',
  TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*',
  TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W',
  CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
  CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
  CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
  CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
  ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M',
  ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T',
  AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K',
  AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R',
  GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
  GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
  GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
  GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G',
};

const hairpinScore = (seq: string) => {
  const s = cleanDna(seq);
  if (s.length < 8) return 0;
  const rc = revComp(s);
  let max = 0;
  for (let i = 0; i < s.length - 3; i++) {
    for (let j = 0; j < rc.length - 3; j++) {
      let match = 0;
      while (i + match < s.length && j + match < rc.length && s[i + match] === rc[j + match]) {
        match++;
      }
      if (match > max) max = match;
    }
  }
  return max;
};

const primerTone = (tm: number, gc: number, len: number): ResultBar['tone'] => {
  const tmOk = tm >= 55 && tm <= 65;
  const gcOk = gc >= 40 && gc <= 60;
  const lenOk = len >= 18 && len <= 30;
  const score = [tmOk, gcOk, lenOk].filter(Boolean).length;
  if (score === 3) return 'ok';
  if (score >= 2) return 'warn';
  return 'bad';
};

export const LAB_TOOLS: ToolDef[] = [
  {
    id: 'molar-solution',
    name: 'Molar solution',
    summary: 'Solve mass, volume, concentration, or MW from C = n/V.',
    category: 'solutions',
    kind: 'calculator',
    formula: 'C = m / (MW × V)',
    fields: [
      { id: 'concentration', label: 'Concentration', unit: 'M', kind: 'number' },
      { id: 'mass', label: 'Mass', unit: 'g', kind: 'number' },
      { id: 'volume', label: 'Volume', unit: 'L', kind: 'number' },
      { id: 'mw', label: 'Molecular weight', unit: 'g/mol', kind: 'number' },
    ],
    sample: { concentration: '0.1', volume: '0.5', mw: '58.44' },
    compute: (v) => {
      const c = num(v.concentration);
      const m = num(v.mass);
      const vol = num(v.volume);
      const mw = num(v.mw);
      const scalars: Record<string, string> = {};
      if (c != null && vol != null && mw != null && m == null) scalars.mass = `${fmt(c * vol * mw)} g`;
      if (m != null && vol != null && mw != null && c == null) scalars.concentration = `${fmt(m / (mw * vol))} M`;
      if (m != null && c != null && mw != null && vol == null) scalars.volume = `${fmt(m / (c * mw))} L`;
      if (m != null && c != null && vol != null && mw == null) scalars.mw = `${fmt(m / (c * vol))} g/mol`;
      if (!Object.keys(scalars).length) return empty('Fill any three fields to solve the fourth.');
      return { scalars };
    },
  },
  {
    id: 'dilution',
    name: 'Dilution planner',
    summary: 'C₁V₁ = C₂V₂ with a visual dilution ladder.',
    category: 'solutions',
    kind: 'calculator',
    formula: 'C₁V₁ = C₂V₂',
    fields: [
      { id: 'c1', label: 'Stock (C₁)', unit: 'any', kind: 'number', placeholder: '100' },
      { id: 'c2', label: 'Target (C₂)', unit: 'any', kind: 'number', placeholder: '10' },
      { id: 'v2', label: 'Final volume (V₂)', unit: 'mL', kind: 'number', placeholder: '10' },
      { id: 'steps', label: 'Serial steps', kind: 'number', placeholder: '1', hint: '1 = single dilution; >1 builds a serial ladder' },
    ],
    defaults: { c1: '100', c2: '10', v2: '10', steps: '1' },
    sample: { c1: '100', c2: '10', v2: '10', steps: '4' },
    compute: (v) => {
      const c1 = num(v.c1);
      const c2 = num(v.c2);
      const v2 = num(v.v2);
      const steps = Math.max(1, Math.min(8, Math.round(num(v.steps) ?? 1)));
      if (c1 == null || c2 == null || v2 == null || c1 <= 0 || c2 <= 0) {
        return empty('Enter stock, target, and final volume.');
      }
      if (c2 > c1) return empty('Target must be lower than stock for a dilution.');
      const factor = c1 / c2;
      const perStep = Math.pow(factor, 1 / steps);
      const stockVol = v2 / perStep;
      const diluent = v2 - stockVol;
      const points = Array.from({ length: steps + 1 }, (_, i) => ({
        x: i,
        y: c1 / Math.pow(perStep, i),
      }));
      return {
        scalars: {
          dilutionFactor: `${fmt(factor, 2)}×`,
          stockVolume: `${fmt(stockVol, 3)} mL per step`,
          diluent: `${fmt(diluent, 3)} mL diluent`,
          stepFactor: steps > 1 ? `${fmt(perStep, 2)}× each step` : 'Single step',
        },
        series: [
          {
            id: 'ladder',
            label: 'Concentration ladder',
            xUnit: 'step',
            yUnit: 'conc.',
            points,
          },
        ],
        tips: steps > 1 ? ['Transfer the same stock volume into each next tube of diluent.'] : undefined,
      };
    },
  },
  {
    id: 'ph-buffer',
    name: 'Buffer & titration curve',
    summary: 'Henderson–Hasselbalch pH plus a titration visualization.',
    category: 'solutions',
    kind: 'visualizer',
    formula: 'pH = pKa + log([A⁻]/[HA])',
    fields: [
      { id: 'pka', label: 'pKa', kind: 'number', placeholder: '4.76' },
      { id: 'base', label: '[A⁻]', unit: 'M', kind: 'number', placeholder: '0.1' },
      { id: 'acid', label: '[HA]', unit: 'M', kind: 'number', placeholder: '0.1' },
    ],
    defaults: { pka: '4.76', base: '0.1', acid: '0.1' },
    sample: { pka: '4.76', base: '0.1', acid: '0.1' },
    compute: (v) => {
      const pka = num(v.pka);
      const base = num(v.base);
      const acid = num(v.acid);
      if (pka == null || base == null || acid == null || acid === 0) {
        return empty('Enter pKa, [A⁻], and [HA].');
      }
      const ph = pka + Math.log10(base / acid);
      const points = Array.from({ length: 41 }, (_, i) => {
        const ratio = Math.pow(10, (i - 20) / 10);
        return { x: Math.log10(ratio), y: pka + Math.log10(ratio) };
      });
      return {
        scalars: {
          pH: fmt(ph, 3),
          ratio: fmt(base / acid, 3),
          buffering: Math.abs(ph - pka) < 1 ? 'Near pKa - good buffering' : 'Far from pKa - weak buffering',
        },
        series: [
          {
            id: 'titration',
            label: 'pH vs log([A⁻]/[HA])',
            xUnit: 'log ratio',
            yUnit: 'pH',
            points,
          },
        ],
        bars: [
          {
            label: 'Distance from pKa',
            value: Math.min(3, Math.abs(ph - pka)),
            max: 3,
            display: `${fmt(Math.abs(ph - pka), 2)} units`,
            tone: Math.abs(ph - pka) < 1 ? 'ok' : Math.abs(ph - pka) < 2 ? 'warn' : 'bad',
          },
        ],
      };
    },
  },
  {
    id: 'beer-lambert',
    name: 'Beer–Lambert',
    summary: 'Absorbance ↔ concentration with a linear calibration preview.',
    category: 'kinetics',
    kind: 'calculator',
    formula: 'A = ε × l × c',
    fields: [
      { id: 'a', label: 'Absorbance (A)', kind: 'number' },
      { id: 'eps', label: 'ε', unit: 'L·mol⁻¹·cm⁻¹', kind: 'number', placeholder: '10000' },
      { id: 'path', label: 'Path length', unit: 'cm', kind: 'number', placeholder: '1' },
      { id: 'c', label: 'Concentration', unit: 'M', kind: 'number' },
    ],
    defaults: { eps: '10000', path: '1' },
    sample: { a: '0.75', eps: '10000', path: '1' },
    compute: (v) => {
      const a = num(v.a);
      const eps = num(v.eps);
      const path = num(v.path) ?? 1;
      const c = num(v.c);
      if (eps == null || !path) return empty('Enter ε and path length.');
      const scalars: Record<string, string> = {};
      let conc = c;
      if (a != null && c == null) {
        conc = a / (eps * path);
        scalars.concentration = `${fmt(conc)} M`;
      }
      if (c != null && a == null) {
        scalars.absorbance = fmt(eps * path * c, 4);
        conc = c;
      }
      if (!Object.keys(scalars).length && conc == null) {
        return empty('Provide A or concentration with ε.');
      }
      const maxC = Math.max(conc ?? 0.0001, 0.0001) * 2;
      const points = Array.from({ length: 21 }, (_, i) => {
        const x = (maxC * i) / 20;
        return { x, y: eps * path * x };
      });
      return {
        scalars,
        series: [{ id: 'calib', label: 'Calibration line', xUnit: 'M', yUnit: 'A', points }],
      };
    },
  },
  {
    id: 'enzyme-kinetics',
    name: 'Michaelis–Menten simulator',
    summary: 'Velocity curve from Vmax and Km - explore saturation.',
    category: 'kinetics',
    kind: 'simulator',
    formula: 'v = Vmax · [S] / (Km + [S])',
    fields: [
      { id: 'vmax', label: 'Vmax', unit: 'μmol/min', kind: 'number', placeholder: '100' },
      { id: 'km', label: 'Km', unit: 'μM', kind: 'number', placeholder: '50' },
      { id: 's', label: 'Current [S]', unit: 'μM', kind: 'number', placeholder: '50' },
      { id: 'smax', label: 'Plot max [S]', unit: 'μM', kind: 'number', placeholder: '500' },
    ],
    defaults: { vmax: '100', km: '50', s: '50', smax: '500' },
    sample: { vmax: '100', km: '50', s: '50', smax: '500' },
    compute: (v) => {
      const vmax = num(v.vmax);
      const km = num(v.km);
      const s = num(v.s);
      const smax = num(v.smax) ?? 500;
      if (vmax == null || km == null) return empty('Enter Vmax and Km.');
      const velocity = s != null ? (vmax * s) / (km + s) : null;
      const points = Array.from({ length: 41 }, (_, i) => {
        const x = (smax * i) / 40;
        return { x, y: (vmax * x) / (km + x) };
      });
      return {
        scalars: {
          velocity: velocity != null ? `${fmt(velocity, 3)} μmol/min` : '-',
          saturation: s != null ? `${fmt((100 * s) / (km + s), 1)}% of Vmax` : '-',
          halfVmaxAt: `Km = ${fmt(km)} μM`,
        },
        series: [{ id: 'mm', label: 'v vs [S]', xUnit: 'μM', yUnit: 'μmol/min', points }],
        bars:
          velocity != null
            ? [
                {
                  label: 'Fraction of Vmax',
                  value: (velocity / vmax) * 100,
                  max: 100,
                  display: `${fmt((100 * velocity) / vmax, 1)}%`,
                  tone: velocity / vmax > 0.8 ? 'ok' : velocity / vmax > 0.4 ? 'warn' : 'neutral',
                },
              ]
            : undefined,
      };
    },
  },
  {
    id: 'primer-designer',
    name: 'Primer designer',
    summary: 'Suggest primers from a template window with Tm/GC scoring.',
    category: 'design',
    kind: 'designer',
    formula: 'Tm ≈ Wallace / GC-adjusted',
    fields: [
      { id: 'template', label: 'Template (5′→3′)', kind: 'text', placeholder: 'Paste amplicon or gene region…' },
      { id: 'ampliconStart', label: 'Amplicon start', unit: 'bp (1-based)', kind: 'number', placeholder: '1' },
      { id: 'ampliconEnd', label: 'Amplicon end', unit: 'bp', kind: 'number' },
      { id: 'primerLen', label: 'Primer length', unit: 'bp', kind: 'number', placeholder: '20' },
      { id: 'targetTm', label: 'Target Tm', unit: '°C', kind: 'number', placeholder: '60' },
    ],
    defaults: { primerLen: '20', targetTm: '60', ampliconStart: '1' },
    sample: {
      template: DEMO_DNA,
      ampliconStart: '1',
      ampliconEnd: '90',
      primerLen: '20',
      targetTm: '60',
    },
    compute: (v) => {
      const template = cleanDna(v.template || '');
      if (template.length < 40) return empty('Paste a template of at least ~40 bp.');
      const len = Math.max(16, Math.min(35, Math.round(num(v.primerLen) ?? 20)));
      const start = Math.max(1, Math.round(num(v.ampliconStart) ?? 1));
      const end = Math.min(template.length, Math.round(num(v.ampliconEnd) ?? template.length));
      const targetTm = num(v.targetTm) ?? 60;
      if (end - start + 1 < len * 2) return empty('Amplicon window is too short for the primer length.');

      const scoreWindow = (seq: string) => {
        const tm = oligoTm(seq);
        const gc = gcContent(seq);
        const hairpin = hairpinScore(seq);
        const tmPenalty = Math.abs(tm - targetTm);
        const gcPenalty = Math.abs(gc - 50);
        return tmPenalty * 2 + gcPenalty + hairpin * 3;
      };

      let bestFwd = { seq: '', score: Infinity, pos: start };
      for (let i = start - 1; i <= end - len; i++) {
        const seq = template.slice(i, i + len);
        if (seq.length < len) break;
        const score = scoreWindow(seq);
        if (score < bestFwd.score) bestFwd = { seq, score, pos: i + 1 };
      }

      let bestRev = { seq: '', score: Infinity, pos: end };
      for (let i = end - len; i >= start - 1; i--) {
        if (i < 0) break;
        const seq = revComp(template.slice(i, i + len));
        if (seq.length < len) continue;
        const score = scoreWindow(seq);
        if (score < bestRev.score) bestRev = { seq, score, pos: i + 1 };
      }

      const fwdTm = oligoTm(bestFwd.seq);
      const revTm = oligoTm(bestRev.seq);
      const fwdGc = gcContent(bestFwd.seq);
      const revGc = gcContent(bestRev.seq);

      return {
        scalars: {
          forward: bestFwd.seq,
          reverse: bestRev.seq,
          forwardPos: `${bestFwd.pos}–${bestFwd.pos + len - 1}`,
          reversePos: `${bestRev.pos}–${bestRev.pos + len - 1}`,
          ampliconSize: `${end - start + 1} bp`,
          tmDelta: `${fmt(Math.abs(fwdTm - revTm), 1)} °C`,
        },
        bars: [
          {
            label: 'Forward Tm',
            value: fwdTm,
            max: 80,
            display: `${fmt(fwdTm, 1)} °C`,
            tone: primerTone(fwdTm, fwdGc, len),
          },
          {
            label: 'Forward GC',
            value: fwdGc,
            max: 100,
            display: `${fmt(fwdGc, 1)}%`,
            tone: primerTone(fwdTm, fwdGc, len),
          },
          {
            label: 'Reverse Tm',
            value: revTm,
            max: 80,
            display: `${fmt(revTm, 1)} °C`,
            tone: primerTone(revTm, revGc, len),
          },
          {
            label: 'Reverse GC',
            value: revGc,
            max: 100,
            display: `${fmt(revGc, 1)}%`,
            tone: primerTone(revTm, revGc, len),
          },
        ],
        sequenceMap: {
          seq: template.slice(Math.max(0, start - 1), end),
          highlights: [
            {
              start: 0,
              end: Math.min(len, end - start + 1),
              label: 'Fwd',
              tone: 'accent',
            },
            {
              start: Math.max(0, end - start + 1 - len),
              end: end - start + 1,
              label: 'Rev',
              tone: 'ok',
            },
          ],
        },
        tips: [
          'Heuristic local search - validate with your oligo vendor / IDT tools before ordering.',
          Math.abs(fwdTm - revTm) > 3 ? 'ΔTm > 3 °C - consider adjusting length.' : 'Tm pair looks balanced.',
        ],
      };
    },
  },
  {
    id: 'primer-check',
    name: 'Primer pair check',
    summary: 'Score existing primers for Tm, GC, length, and hairpin risk.',
    category: 'molecular',
    kind: 'calculator',
    fields: [
      { id: 'fwd', label: 'Forward (5′→3′)', kind: 'text', placeholder: 'ATGC…' },
      { id: 'rev', label: 'Reverse (5′→3′)', kind: 'text', placeholder: 'ATGC…' },
    ],
    sample: { fwd: 'ATGGCCATGGAATTCGGATC', rev: 'GTCGACAAGCTTGTCGACGG' },
    compute: (v) => {
      const fwd = cleanDna(v.fwd || '');
      const rev = cleanDna(v.rev || '');
      if (!fwd && !rev) return empty('Paste at least one primer.');
      const scalars: Record<string, string> = {};
      const bars: ResultBar[] = [];
      if (fwd) {
        const tm = oligoTm(fwd);
        const gc = gcContent(fwd);
        scalars.forwardLength = `${fwd.length} bp`;
        scalars.forwardTm = `${fmt(tm, 1)} °C`;
        scalars.forwardGC = `${fmt(gc, 1)}%`;
        scalars.forwardHairpin = `${hairpinScore(fwd)} bp self-match`;
        bars.push(
          { label: 'Fwd Tm', value: tm, max: 80, display: `${fmt(tm, 1)} °C`, tone: primerTone(tm, gc, fwd.length) },
          { label: 'Fwd GC', value: gc, max: 100, display: `${fmt(gc, 1)}%`, tone: primerTone(tm, gc, fwd.length) }
        );
      }
      if (rev) {
        const tm = oligoTm(rev);
        const gc = gcContent(rev);
        scalars.reverseLength = `${rev.length} bp`;
        scalars.reverseTm = `${fmt(tm, 1)} °C`;
        scalars.reverseGC = `${fmt(gc, 1)}%`;
        scalars.reverseHairpin = `${hairpinScore(rev)} bp self-match`;
        bars.push(
          { label: 'Rev Tm', value: tm, max: 80, display: `${fmt(tm, 1)} °C`, tone: primerTone(tm, gc, rev.length) },
          { label: 'Rev GC', value: gc, max: 100, display: `${fmt(gc, 1)}%`, tone: primerTone(tm, gc, rev.length) }
        );
      }
      if (fwd && rev) scalars.tmDifference = `${fmt(Math.abs(oligoTm(fwd) - oligoTm(rev)), 1)} °C`;
      return { scalars, bars };
    },
  },
  {
    id: 'pcr-simulator',
    name: 'PCR amplification simulator',
    summary: 'Estimate product yield across cycles with an exponential curve.',
    category: 'molecular',
    kind: 'simulator',
    formula: 'N = N₀ · (1 + E)^n',
    fields: [
      { id: 'templateNg', label: 'Template', unit: 'ng', kind: 'number', placeholder: '10' },
      { id: 'efficiency', label: 'Efficiency', unit: '0–1', kind: 'number', placeholder: '0.95' },
      { id: 'cycles', label: 'Cycles', kind: 'number', placeholder: '30' },
      { id: 'productBp', label: 'Amplicon size', unit: 'bp', kind: 'number', placeholder: '500' },
    ],
    defaults: { templateNg: '10', efficiency: '0.95', cycles: '30', productBp: '500' },
    sample: { templateNg: '10', efficiency: '0.95', cycles: '30', productBp: '500' },
    compute: (v) => {
      const n0 = num(v.templateNg);
      const e = num(v.efficiency) ?? 0.95;
      const cycles = Math.max(1, Math.min(45, Math.round(num(v.cycles) ?? 30)));
      const bp = num(v.productBp) ?? 500;
      if (n0 == null || n0 <= 0) return empty('Enter starting template mass.');
      const eff = Math.min(1, Math.max(0.1, e));
      // Rough: treat ng as relative copy mass; product mass scales with amplification
      const points = Array.from({ length: cycles + 1 }, (_, n) => ({
        x: n,
        y: n0 * Math.pow(1 + eff, n),
      }));
      const final = points[points.length - 1].y;
      const plateauHint = cycles > 35 ? 'Late cycles often plateau in real PCR - treat as upper bound.' : undefined;
      return {
        scalars: {
          finalRelative: `${fmt(final, 2)}× starting mass (relative)`,
          fold: `${fmt(Math.pow(1 + eff, cycles), 1)}-fold`,
          approxCopiesNote: `Assumes constant efficiency ${fmt(eff * 100, 0)}% · ${bp} bp product`,
        },
        series: [
          {
            id: 'pcr',
            label: 'Relative product',
            xUnit: 'cycle',
            yUnit: 'rel. mass',
            points,
          },
        ],
        tips: [plateauHint, 'Does not model primer depletion or polymerase decay.'].filter(Boolean) as string[],
      };
    },
  },
  {
    id: 'pcr-master-mix',
    name: 'PCR master mix',
    summary: 'Scale component volumes for n reactions.',
    category: 'molecular',
    kind: 'calculator',
    fields: [
      { id: 'rxn', label: 'Reaction volume', unit: 'μL', kind: 'number', placeholder: '50' },
      { id: 'nRxn', label: 'Reactions', kind: 'number', placeholder: '8' },
      { id: 'templatePct', label: 'Template fraction', kind: 'number', placeholder: '0.1' },
      { id: 'primerPct', label: 'Each primer fraction', kind: 'number', placeholder: '0.05' },
      { id: 'masterPct', label: '2× mix fraction', kind: 'number', placeholder: '0.5' },
    ],
    defaults: { rxn: '50', nRxn: '8', templatePct: '0.1', primerPct: '0.05', masterPct: '0.5' },
    sample: { rxn: '50', nRxn: '8', templatePct: '0.1', primerPct: '0.05', masterPct: '0.5' },
    compute: (v) => {
      const rxn = num(v.rxn) ?? 50;
      const n = Math.max(1, num(v.nRxn) ?? 1);
      const t = num(v.templatePct) ?? 0.1;
      const p = num(v.primerPct) ?? 0.05;
      const m = num(v.masterPct) ?? 0.5;
      const template = rxn * t;
      const primer = rxn * p;
      const master = rxn * m;
      const water = Math.max(0, rxn - template - primer * 2 - master);
      const scale = (x: number) => fmt(x * n, 2);
      return {
        scalars: {
          template: `${scale(template)} μL`,
          forwardPrimer: `${scale(primer)} μL`,
          reversePrimer: `${scale(primer)} μL`,
          masterMix: `${scale(master)} μL`,
          water: `${scale(water)} μL`,
          total: `${fmt(rxn * n, 1)} μL`,
        },
        tips: ['Heuristic kit template - confirm against your master-mix protocol.'],
      };
    },
  },
  {
    id: 'cloning-ligation',
    name: 'Ligation ratio planner',
    summary: 'Insert:vector molar ratios with volumes.',
    category: 'molecular',
    kind: 'calculator',
    formula: 'ng insert = ratio × (insert bp / vector bp) × ng vector',
    fields: [
      { id: 'insertBp', label: 'Insert', unit: 'bp', kind: 'number' },
      { id: 'vectorBp', label: 'Vector', unit: 'bp', kind: 'number' },
      { id: 'vectorNg', label: 'Vector mass', unit: 'ng', kind: 'number', placeholder: '50' },
      { id: 'ratio', label: 'Molar ratio', kind: 'number', placeholder: '3' },
      { id: 'insertConc', label: 'Insert conc.', unit: 'ng/μL', kind: 'number' },
      { id: 'vectorConc', label: 'Vector conc.', unit: 'ng/μL', kind: 'number' },
    ],
    defaults: { vectorNg: '50', ratio: '3' },
    sample: {
      insertBp: '800',
      vectorBp: '5400',
      vectorNg: '50',
      ratio: '3',
      insertConc: '20',
      vectorConc: '50',
    },
    compute: (v) => {
      const iBp = num(v.insertBp);
      const vBp = num(v.vectorBp);
      const vNg = num(v.vectorNg) ?? 50;
      const ratio = num(v.ratio) ?? 3;
      const iConc = num(v.insertConc);
      const vConc = num(v.vectorConc);
      if (iBp == null || vBp == null || vBp === 0) return empty('Enter insert and vector sizes.');
      const insertNg = ratio * (iBp / vBp) * vNg;
      const scalars: Record<string, string> = {
        insertMass: `${fmt(insertNg, 2)} ng`,
        vectorMass: `${fmt(vNg, 2)} ng`,
        ratio: `${ratio}:1`,
      };
      if (iConc && iConc > 0) scalars.insertVolume = `${fmt(insertNg / iConc, 2)} μL`;
      if (vConc && vConc > 0) scalars.vectorVolume = `${fmt(vNg / vConc, 2)} μL`;
      const ratios = [1, 3, 5, 7];
      return {
        scalars,
        series: [
          {
            id: 'ratios',
            label: 'Insert mass vs ratio',
            xUnit: 'ratio',
            yUnit: 'ng',
            points: ratios.map((r) => ({ x: r, y: r * (iBp / vBp) * vNg })),
          },
        ],
      };
    },
  },
  {
    id: 'sequence-browser',
    name: 'Sequence browser',
    summary: 'GC%, sliding GC window, MW, and composition plot.',
    category: 'sequence',
    kind: 'visualizer',
    fields: [
      { id: 'seq', label: 'DNA sequence', kind: 'text', placeholder: 'Paste ATGC…' },
      { id: 'window', label: 'GC window', unit: 'bp', kind: 'number', placeholder: '50' },
    ],
    defaults: { window: '50' },
    sample: { seq: DEMO_DNA, window: '50' },
    compute: (v) => {
      const seq = cleanDna(v.seq || '');
      if (!seq) return empty('Paste a DNA sequence.');
      const win = Math.max(10, Math.min(200, Math.round(num(v.window) ?? 50)));
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i <= seq.length - win; i += Math.max(1, Math.floor(win / 5))) {
        points.push({ x: i + 1, y: gcContent(seq.slice(i, i + win)) });
      }
      const g = (seq.match(/G/g) || []).length;
      const c = (seq.match(/C/g) || []).length;
      const a = (seq.match(/A/g) || []).length;
      const t = (seq.match(/T/g) || []).length;
      const skew = g + c === 0 ? 0 : (g - c) / (g + c);
      return {
        scalars: {
          length: `${seq.length} bp`,
          gc: `${fmt(gcContent(seq), 2)}%`,
          gcSkew: fmt(skew, 3),
          composition: `A ${a} · T ${t} · G ${g} · C ${c}`,
          approxMW: `${fmt(seq.length * 330, 0)} Da (ssDNA rough)`,
          approxTm: `${fmt(oligoTm(seq), 1)} °C`,
        },
        series: [
          {
            id: 'gcwin',
            label: `GC% (${win} bp window)`,
            xUnit: 'pos',
            yUnit: '%GC',
            points: points.length ? points : [{ x: 1, y: gcContent(seq) }],
          },
        ],
        bars: [
          { label: 'A', value: a, max: seq.length, display: `${fmt((100 * a) / seq.length, 1)}%`, tone: 'neutral' },
          { label: 'T', value: t, max: seq.length, display: `${fmt((100 * t) / seq.length, 1)}%`, tone: 'neutral' },
          { label: 'G', value: g, max: seq.length, display: `${fmt((100 * g) / seq.length, 1)}%`, tone: 'ok' },
          { label: 'C', value: c, max: seq.length, display: `${fmt((100 * c) / seq.length, 1)}%`, tone: 'warn' },
        ],
      };
    },
  },
  {
    id: 'restriction-scan',
    name: 'Restriction mapper',
    summary: 'Map common restriction sites along your sequence.',
    category: 'sequence',
    kind: 'visualizer',
    fields: [{ id: 'seq', label: 'DNA sequence', kind: 'text', placeholder: 'Paste ATGC…' }],
    sample: { seq: DEMO_DNA },
    compute: (v) => {
      const seq = cleanDna(v.seq || '');
      if (!seq) return empty('Paste a DNA sequence.');
      const highlights: SequenceHighlight[] = [];
      const found: string[] = [];
      for (const enz of RESTRICTION_ENZYMES) {
        let idx = seq.indexOf(enz.sequence);
        while (idx !== -1) {
          highlights.push({
            start: idx,
            end: idx + enz.sequence.length,
            label: enz.name,
            tone: 'accent',
          });
          found.push(`${enz.name} @ ${idx + 1}`);
          idx = seq.indexOf(enz.sequence, idx + 1);
        }
      }
      return {
        scalars: {
          sitesFound: found.length ? `${found.length} site(s)` : 'None in built-in set',
          list: found.length ? found.join(' · ') : '-',
        },
        sequenceMap: { seq, highlights },
        tips: found.length ? undefined : ['Try a longer sequence or different enzyme set.'],
      };
    },
  },
  {
    id: 'revcomp',
    name: 'Reverse complement',
    summary: 'Reverse, complement, and reverse-complement.',
    category: 'sequence',
    kind: 'calculator',
    fields: [{ id: 'seq', label: 'DNA sequence', kind: 'text', placeholder: 'Paste ATGC…' }],
    sample: { seq: DEMO_DNA },
    compute: (v) => {
      const seq = cleanDna(v.seq || '');
      if (!seq) return empty('Paste a DNA sequence.');
      const complement = seq
        .split('')
        .map((b) => ({ A: 'T', T: 'A', C: 'G', G: 'C' }[b] || b))
        .join('');
      return {
        scalars: {
          reverse: seq.split('').reverse().join(''),
          complement,
          reverseComplement: revComp(seq),
          length: `${seq.length} bp`,
        },
      };
    },
  },
  {
    id: 'translate',
    name: 'Translate ORF',
    summary: 'Six-frame translation preview for a DNA stretch.',
    category: 'sequence',
    kind: 'designer',
    fields: [
      { id: 'seq', label: 'DNA sequence', kind: 'text', placeholder: 'Paste ATGC…' },
      {
        id: 'frame',
        label: 'Frame',
        kind: 'select',
        options: [
          { value: '1', label: '+1' },
          { value: '2', label: '+2' },
          { value: '3', label: '+3' },
          { value: '-1', label: '−1' },
          { value: '-2', label: '−2' },
          { value: '-3', label: '−3' },
        ],
      },
    ],
    defaults: { frame: '1' },
    sample: { seq: DEMO_DNA, frame: '1' },
    compute: (v) => {
      let seq = cleanDna(v.seq || '');
      if (seq.length < 3) return empty('Need at least one codon.');
      const frame = v.frame || '1';
      if (frame.startsWith('-')) seq = revComp(seq);
      const offset = Math.abs(Number(frame)) - 1;
      let aa = '';
      for (let i = offset; i + 2 < seq.length; i += 3) {
        aa += CODONS[seq.slice(i, i + 3)] || 'X';
      }
      const stops = (aa.match(/\*/g) || []).length;
      return {
        scalars: {
          frame: frame,
          protein: aa || '-',
          aaLength: `${aa.replace(/\*/g, '').length} aa (excluding stops)`,
          stops: `${stops}`,
        },
        tips: stops > 1 ? ['Multiple stops - check frame or ORF boundaries.'] : undefined,
      };
    },
  },
  {
    id: 'cell-count',
    name: 'Hemocytometer count',
    summary: 'Density and viable cells from chamber counts.',
    category: 'cells',
    kind: 'calculator',
    fields: [
      { id: 'count', label: 'Cell count', unit: 'cells', kind: 'number' },
      { id: 'dilution', label: 'Dilution factor', kind: 'number', placeholder: '2' },
      { id: 'volume', label: 'Volume counted', unit: 'μL', kind: 'number', placeholder: '0.1' },
      { id: 'viability', label: 'Viability', unit: '%', kind: 'number', placeholder: '95' },
    ],
    defaults: { dilution: '2', volume: '0.1', viability: '95' },
    sample: { count: '120', dilution: '2', volume: '0.1', viability: '95' },
    compute: (v) => {
      const count = num(v.count);
      const dil = num(v.dilution) ?? 1;
      const volume = num(v.volume);
      const viability = num(v.viability) ?? 100;
      if (count == null || volume == null || volume === 0) return empty('Enter count and volume.');
      const density = (count * dil) / volume;
      const viable = density * (viability / 100);
      return {
        scalars: {
          density: `${fmt(density, 2)} cells/μL`,
          densityMl: `${fmt(density * 1000, 2)} cells/mL`,
          viableDensity: `${fmt(viable * 1000, 2)} viable/mL`,
        },
        bars: [
          {
            label: 'Viability',
            value: viability,
            max: 100,
            display: `${fmt(viability, 0)}%`,
            tone: viability >= 90 ? 'ok' : viability >= 70 ? 'warn' : 'bad',
          },
        ],
      };
    },
  },
  {
    id: 'growth-curve',
    name: 'Culture growth simulator',
    summary: 'Logistic growth curve for planning harvest timing.',
    category: 'cells',
    kind: 'simulator',
    formula: 'N(t) = K / (1 + ((K−N₀)/N₀)·e^(−r t))',
    fields: [
      { id: 'n0', label: 'Start density', unit: 'cells/mL', kind: 'number', placeholder: '1e5' },
      { id: 'k', label: 'Carrying capacity K', unit: 'cells/mL', kind: 'number', placeholder: '2e6' },
      { id: 'r', label: 'Growth rate r', unit: '1/h', kind: 'number', placeholder: '0.15' },
      { id: 'hours', label: 'Horizon', unit: 'h', kind: 'number', placeholder: '48' },
      { id: 'harvest', label: 'Harvest target', unit: 'cells/mL', kind: 'number', placeholder: '1e6' },
    ],
    defaults: { n0: '100000', k: '2000000', r: '0.15', hours: '48', harvest: '1000000' },
    sample: { n0: '100000', k: '2000000', r: '0.15', hours: '48', harvest: '1000000' },
    compute: (v) => {
      const n0 = num(v.n0);
      const k = num(v.k);
      const r = num(v.r);
      const hours = num(v.hours) ?? 48;
      const harvest = num(v.harvest);
      if (n0 == null || k == null || r == null || n0 <= 0 || k <= n0) {
        return empty('Enter N₀, K (> N₀), and growth rate.');
      }
      const nAt = (t: number) => k / (1 + ((k - n0) / n0) * Math.exp(-r * t));
      const points = Array.from({ length: 49 }, (_, i) => {
        const t = (hours * i) / 48;
        return { x: t, y: nAt(t) };
      });
      let tHarvest = '-';
      if (harvest != null && harvest > n0 && harvest < k) {
        const ratio = (k - harvest) / harvest;
        const inner = ((k - n0) / n0) / ratio;
        if (inner > 0) tHarvest = `${fmt(Math.log(inner) / r, 1)} h`;
      }
      return {
        scalars: {
          doublingApprox: `${fmt(Math.log(2) / r, 1)} h (early exponential)`,
          harvestTime: tHarvest,
          finalDensity: `${fmt(nAt(hours), 0)} cells/mL`,
        },
        series: [{ id: 'growth', label: 'Density vs time', xUnit: 'h', yUnit: 'cells/mL', points }],
      };
    },
  },
  {
    id: 'seeding',
    name: 'Seeding calculator',
    summary: 'Volume to seed to hit a target density.',
    category: 'cells',
    kind: 'calculator',
    fields: [
      { id: 'stock', label: 'Stock density', unit: 'cells/mL', kind: 'number' },
      { id: 'target', label: 'Target density', unit: 'cells/mL', kind: 'number' },
      { id: 'finalVol', label: 'Final volume', unit: 'mL', kind: 'number' },
    ],
    sample: { stock: '1000000', target: '50000', finalVol: '10' },
    compute: (v) => {
      const stock = num(v.stock);
      const target = num(v.target);
      const finalVol = num(v.finalVol);
      if (stock == null || target == null || finalVol == null || stock === 0) {
        return empty('Enter stock, target, and final volume.');
      }
      const seedVol = (target * finalVol) / stock;
      return {
        scalars: {
          seedVolume: `${fmt(seedVol, 3)} mL`,
          mediaToAdd: `${fmt(Math.max(0, finalVol - seedVol), 3)} mL`,
        },
      };
    },
  },
  {
    id: 'protein-assay',
    name: 'Protein assay',
    summary: 'Concentration from standard-curve slope.',
    category: 'kinetics',
    kind: 'calculator',
    formula: 'c = (A − b) / m × dilution',
    fields: [
      { id: 'a', label: 'Absorbance', kind: 'number' },
      { id: 'slope', label: 'Slope', unit: 'per mg/mL', kind: 'number' },
      { id: 'intercept', label: 'Intercept', kind: 'number', placeholder: '0' },
      { id: 'dilution', label: 'Dilution factor', kind: 'number', placeholder: '1' },
    ],
    defaults: { intercept: '0', dilution: '1' },
    sample: { a: '0.42', slope: '0.85', intercept: '0.05', dilution: '2' },
    compute: (v) => {
      const a = num(v.a);
      const slope = num(v.slope);
      const intercept = num(v.intercept) ?? 0;
      const dil = num(v.dilution) ?? 1;
      if (a == null || slope == null || slope === 0) return empty('Enter absorbance and slope.');
      return {
        scalars: { concentration: `${fmt(((a - intercept) / slope) * dil, 4)} mg/mL` },
      };
    },
  },
  {
    id: 'dose-response',
    name: 'Dose–response (IC₅₀)',
    summary: 'Hill-curve simulator for inhibitor screening - estimate IC₅₀ visually.',
    category: 'kinetics',
    kind: 'simulator',
    formula: 'y = bottom + (top − bottom) / (1 + (x/IC₅₀)^Hill)',
    fields: [
      { id: 'ic50', label: 'IC₅₀', unit: 'nM', kind: 'number', placeholder: '50' },
      { id: 'hill', label: 'Hill slope', kind: 'number', placeholder: '1' },
      { id: 'top', label: 'Top (% activity)', kind: 'number', placeholder: '100' },
      { id: 'bottom', label: 'Bottom (% activity)', kind: 'number', placeholder: '0' },
      { id: 'dose', label: 'Current dose', unit: 'nM', kind: 'number', placeholder: '50' },
      { id: 'xmax', label: 'Plot max dose', unit: 'nM', kind: 'number', placeholder: '10000' },
    ],
    defaults: { ic50: '50', hill: '1', top: '100', bottom: '0', dose: '50', xmax: '10000' },
    sample: { ic50: '50', hill: '1.2', top: '100', bottom: '5', dose: '50', xmax: '10000' },
    compute: (v) => {
      const ic50 = num(v.ic50);
      const hill = num(v.hill) ?? 1;
      const top = num(v.top) ?? 100;
      const bottom = num(v.bottom) ?? 0;
      const dose = num(v.dose);
      const xmax = num(v.xmax) ?? 10000;
      if (ic50 == null || ic50 <= 0) return empty('Enter a positive IC₅₀.');
      const yAt = (x: number) => {
        if (x <= 0) return top;
        return bottom + (top - bottom) / (1 + Math.pow(x / ic50, hill));
      };
      const points = Array.from({ length: 48 }, (_, i) => {
        const logMin = Math.log10(ic50 / 1000);
        const logMax = Math.log10(Math.max(xmax, ic50 * 100));
        const x = Math.pow(10, logMin + ((logMax - logMin) * i) / 47);
        return { x, y: yAt(x) };
      });
      const activity = dose != null ? yAt(dose) : null;
      return {
        scalars: {
          ic50: `${fmt(ic50, 2)} nM`,
          activityAtDose:
            activity != null ? `${fmt(activity, 1)}% at ${fmt(dose!, 2)} nM` : '-',
          dynamicRange: `${fmt(top - bottom, 1)}%`,
        },
        series: [
          {
            id: 'hill',
            label: 'Activity vs dose (log scale x)',
            xUnit: 'nM',
            yUnit: '%',
            points,
          },
        ],
        bars:
          activity != null
            ? [
                {
                  label: 'Remaining activity',
                  value: Math.max(0, activity),
                  max: Math.max(top, 100),
                  display: `${fmt(activity, 1)}%`,
                  tone: activity < 50 ? 'ok' : activity < 80 ? 'warn' : 'neutral',
                },
              ]
            : undefined,
        tips: ['Log-spaced doses; validate with your plate layout and DMSO controls.'],
      };
    },
  },
  {
    id: 'qpcr-ct',
    name: 'qPCR Ct estimator',
    summary: 'Relative quantification (ΔΔCt) with fold-change readout.',
    category: 'molecular',
    kind: 'calculator',
    formula: 'fold = 2^(−ΔΔCt)',
    fields: [
      { id: 'ctTargetSample', label: 'Target Ct (sample)', kind: 'number', placeholder: '22' },
      { id: 'ctRefSample', label: 'Reference Ct (sample)', kind: 'number', placeholder: '18' },
      { id: 'ctTargetCtrl', label: 'Target Ct (control)', kind: 'number', placeholder: '25' },
      { id: 'ctRefCtrl', label: 'Reference Ct (control)', kind: 'number', placeholder: '18' },
      { id: 'efficiency', label: 'Assay efficiency', unit: '0–1', kind: 'number', placeholder: '1' },
    ],
    defaults: {
      ctTargetSample: '22',
      ctRefSample: '18',
      ctTargetCtrl: '25',
      ctRefCtrl: '18',
      efficiency: '1',
    },
    sample: {
      ctTargetSample: '22',
      ctRefSample: '18',
      ctTargetCtrl: '25',
      ctRefCtrl: '18',
      efficiency: '1',
    },
    compute: (v) => {
      const ts = num(v.ctTargetSample);
      const rs = num(v.ctRefSample);
      const tc = num(v.ctTargetCtrl);
      const rc = num(v.ctRefCtrl);
      const e = Math.min(1, Math.max(0.5, num(v.efficiency) ?? 1));
      if (ts == null || rs == null || tc == null || rc == null) {
        return empty('Enter all four Ct values.');
      }
      const dCtS = ts - rs;
      const dCtC = tc - rc;
      const ddCt = dCtS - dCtC;
      const base = 1 + e;
      const fold = Math.pow(base, -ddCt);
      return {
        scalars: {
          deltaCtSample: fmt(dCtS, 3),
          deltaCtControl: fmt(dCtC, 3),
          deltaDeltaCt: fmt(ddCt, 3),
          foldChange: `${fmt(fold, 3)}×`,
          direction: fold >= 1 ? 'Up vs control' : 'Down vs control',
        },
        bars: [
          {
            label: 'Fold change (capped display)',
            value: Math.min(10, Math.abs(fold)),
            max: 10,
            display: `${fmt(fold, 2)}×`,
            tone: Math.abs(Math.log2(fold)) >= 1 ? 'ok' : 'neutral',
          },
        ],
        tips: ['Assumes reference gene is stable; report efficiency-corrected RQ when e ≠ 1.'],
      };
    },
  },
  {
    id: 'thermocycler',
    name: 'Thermocycler program',
    summary: 'Build a standard PCR cycle timeline with total run time.',
    category: 'design',
    kind: 'designer',
    fields: [
      { id: 'denatureC', label: 'Denature °C', kind: 'number', placeholder: '95' },
      { id: 'denatureS', label: 'Denature sec', kind: 'number', placeholder: '30' },
      { id: 'annealC', label: 'Anneal °C', kind: 'number', placeholder: '58' },
      { id: 'annealS', label: 'Anneal sec', kind: 'number', placeholder: '30' },
      { id: 'extendC', label: 'Extend °C', kind: 'number', placeholder: '72' },
      { id: 'extendS', label: 'Extend sec', kind: 'number', placeholder: '60' },
      { id: 'cycles', label: 'Cycles', kind: 'number', placeholder: '30' },
      { id: 'initDenatureS', label: 'Initial denature', unit: 'sec', kind: 'number', placeholder: '180' },
      { id: 'finalExtendS', label: 'Final extend', unit: 'sec', kind: 'number', placeholder: '300' },
      { id: 'ramp', label: 'Ramp', unit: '°C/s', kind: 'number', placeholder: '3' },
    ],
    defaults: {
      denatureC: '95',
      denatureS: '30',
      annealC: '58',
      annealS: '30',
      extendC: '72',
      extendS: '60',
      cycles: '30',
      initDenatureS: '180',
      finalExtendS: '300',
      ramp: '3',
    },
    sample: {
      denatureC: '95',
      denatureS: '30',
      annealC: '58',
      annealS: '30',
      extendC: '72',
      extendS: '60',
      cycles: '30',
      initDenatureS: '180',
      finalExtendS: '300',
      ramp: '3',
    },
    compute: (v) => {
      const dC = num(v.denatureC) ?? 95;
      const dS = num(v.denatureS) ?? 30;
      const aC = num(v.annealC) ?? 58;
      const aS = num(v.annealS) ?? 30;
      const eC = num(v.extendC) ?? 72;
      const eS = num(v.extendS) ?? 60;
      const cycles = Math.max(1, Math.round(num(v.cycles) ?? 30));
      const init = num(v.initDenatureS) ?? 180;
      const fin = num(v.finalExtendS) ?? 300;
      const ramp = Math.max(0.5, num(v.ramp) ?? 3);
      const rampPerCycle =
        Math.abs(dC - aC) / ramp + Math.abs(aC - eC) / ramp + Math.abs(eC - dC) / ramp;
      const holdPerCycle = dS + aS + eS;
      const cycleSec = holdPerCycle + rampPerCycle;
      const totalSec = init + cycles * cycleSec + fin;
      const points: { x: number; y: number }[] = [];
      let t = 0;
      points.push({ x: t, y: 25 });
      t += 10;
      points.push({ x: t, y: dC });
      t += init;
      points.push({ x: t, y: dC });
      const previewCycles = Math.min(cycles, 3);
      for (let c = 0; c < previewCycles; c++) {
        t += Math.abs(dC - aC) / ramp;
        points.push({ x: t, y: aC });
        t += aS;
        points.push({ x: t, y: aC });
        t += Math.abs(aC - eC) / ramp;
        points.push({ x: t, y: eC });
        t += eS;
        points.push({ x: t, y: eC });
        t += Math.abs(eC - dC) / ramp;
        points.push({ x: t, y: dC });
        t += dS;
        points.push({ x: t, y: dC });
      }
      const mins = totalSec / 60;
      return {
        scalars: {
          program: `${dC}° ${dS}s → ${aC}° ${aS}s → ${eC}° ${eS}s × ${cycles}`,
          cycleTime: `${fmt(cycleSec, 0)} s / cycle`,
          totalTime: `${fmt(mins, 1)} min (~${fmt(mins / 60, 2)} h)`,
          rampNote: `Ramp ${ramp} °C/s included`,
        },
        series: [
          {
            id: 'thermo',
            label: `Temperature profile (first ${previewCycles} cycles)`,
            xUnit: 's',
            yUnit: '°C',
            points,
          },
        ],
        tips: ['Tune anneal from primer Tm − 3 to 5 °C; extend ~1 min/kb for Taq.'],
      };
    },
  },
  {
    id: 'unit-lab',
    name: 'Lab unit converter',
    summary: 'Quick conversions for volumes, masses, and molarity helpers.',
    category: 'solutions',
    kind: 'calculator',
    fields: [
      {
        id: 'mode',
        label: 'Convert',
        kind: 'select',
        options: [
          { value: 'volume', label: 'Volume (μL ↔ mL ↔ L)' },
          { value: 'mass', label: 'Mass (μg ↔ mg ↔ g)' },
          { value: 'molar', label: 'Molarity (mM ↔ μM ↔ nM)' },
          { value: 'cells', label: 'Cell density (cells/μL ↔ cells/mL)' },
        ],
      },
      { id: 'value', label: 'Value', kind: 'number', placeholder: '100' },
      {
        id: 'from',
        label: 'From unit',
        kind: 'select',
        options: [
          { value: 'uL', label: 'μL' },
          { value: 'mL', label: 'mL' },
          { value: 'L', label: 'L' },
          { value: 'ug', label: 'μg' },
          { value: 'mg', label: 'mg' },
          { value: 'g', label: 'g' },
          { value: 'mM', label: 'mM' },
          { value: 'uM', label: 'μM' },
          { value: 'nM', label: 'nM' },
          { value: 'peruL', label: 'cells/μL' },
          { value: 'permL', label: 'cells/mL' },
        ],
      },
    ],
    defaults: { mode: 'volume', value: '100', from: 'uL' },
    sample: { mode: 'volume', value: '100', from: 'uL' },
    compute: (v) => {
      const value = num(v.value);
      if (value == null) return empty('Enter a value.');
      const mode = v.mode || 'volume';
      const from = v.from || 'uL';
      const out: Record<string, string> = {};
      if (mode === 'volume') {
        const toUL =
          from === 'L' ? value * 1e6 : from === 'mL' ? value * 1e3 : from === 'uL' ? value : null;
        if (toUL == null) return empty('Pick μL, mL, or L for volume mode.');
        out.uL = `${fmt(toUL, 4)} μL`;
        out.mL = `${fmt(toUL / 1e3, 4)} mL`;
        out.L = `${fmt(toUL / 1e6, 6)} L`;
      } else if (mode === 'mass') {
        const toUg =
          from === 'g' ? value * 1e6 : from === 'mg' ? value * 1e3 : from === 'ug' ? value : null;
        if (toUg == null) return empty('Pick μg, mg, or g for mass mode.');
        out.ug = `${fmt(toUg, 4)} μg`;
        out.mg = `${fmt(toUg / 1e3, 4)} mg`;
        out.g = `${fmt(toUg / 1e6, 6)} g`;
      } else if (mode === 'molar') {
        const toNM =
          from === 'mM' ? value * 1e6 : from === 'uM' ? value * 1e3 : from === 'nM' ? value : null;
        if (toNM == null) return empty('Pick mM, μM, or nM for molarity mode.');
        out.nM = `${fmt(toNM, 4)} nM`;
        out.uM = `${fmt(toNM / 1e3, 4)} μM`;
        out.mM = `${fmt(toNM / 1e6, 6)} mM`;
      } else {
        const perUL = from === 'permL' ? value / 1000 : from === 'peruL' ? value : null;
        if (perUL == null) return empty('Pick cells/μL or cells/mL.');
        out.peruL = `${fmt(perUL, 4)} cells/μL`;
        out.permL = `${fmt(perUL * 1000, 4)} cells/mL`;
      }
      return { scalars: out };
    },
  },
  {
    id: 'gel-map',
    name: 'Agarose gel ladder map',
    summary: 'Estimate migration of fragments vs a reference ladder (log-linear).',
    category: 'sequence',
    kind: 'visualizer',
    formula: 'mobility ∝ −log₁₀(bp)',
    fields: [
      { id: 'fragments', label: 'Fragment sizes (bp, comma-separated)', kind: 'text', placeholder: '500, 1200, 3000' },
      {
        id: 'ladder',
        label: 'Ladder',
        kind: 'select',
        options: [
          { value: '1kb', label: '1 kb ladder (0.5–10 kb)' },
          { value: '100bp', label: '100 bp ladder (100–1500)' },
        ],
      },
    ],
    defaults: { fragments: '500, 1200, 3000', ladder: '1kb' },
    sample: { fragments: '400, 850, 2100', ladder: '1kb' },
    compute: (v) => {
      const frags = (v.fragments || '')
        .split(/[,;\s]+/)
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (!frags.length) return empty('Enter fragment sizes in bp.');
      const ladder =
        v.ladder === '100bp'
          ? [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1500]
          : [500, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000, 10000];
      // Map log(bp) to relative migration 0 (top/large) → 1 (bottom/small)
      const mig = (bp: number) => {
        const lo = Math.log10(Math.min(...ladder));
        const hi = Math.log10(Math.max(...ladder));
        return (Math.log10(bp) - hi) / (lo - hi);
      };
      const points = ladder.map((bp) => ({ x: mig(bp), y: bp }));
      const fragPoints = frags.map((bp) => ({ x: mig(bp), y: bp }));
      return {
        scalars: {
          fragments: frags.map((f) => `${f} bp`).join(' · '),
          relativeRf: frags.map((f) => `${f} bp → Rf ${fmt(mig(f), 2)}`).join(' · '),
        },
        series: [
          {
            id: 'ladder',
            label: 'Ladder size vs relative migration',
            xUnit: 'Rf',
            yUnit: 'bp',
            points,
          },
          {
            id: 'samples',
            label: 'Your fragments',
            xUnit: 'Rf',
            yUnit: 'bp',
            points: fragPoints,
          },
        ],
        tips: ['Log-linear approximation - real gels depend on %, voltage, and buffer.'],
      };
    },
  },
];

export const getToolById = (id: string) => LAB_TOOLS.find((t) => t.id === id);

export const FEATURED_TOOL_IDS = [
  'primer-designer',
  'dose-response',
  'pcr-simulator',
  'thermocycler',
  'sequence-browser',
  'growth-curve',
];

export const WORKFLOW_KITS: WorkflowKit[] = [
  {
    id: 'pcr-run',
    name: 'Design a PCR',
    summary: 'Primers → check → master mix → amplification curve',
    toolIds: ['primer-designer', 'primer-check', 'pcr-master-mix', 'pcr-simulator', 'thermocycler'],
  },
  {
    id: 'clone',
    name: 'Plan a clone',
    summary: 'Sequence map → cut sites → ligation ratios',
    toolIds: ['sequence-browser', 'restriction-scan', 'cloning-ligation', 'gel-map'],
  },
  {
    id: 'assay',
    name: 'Enzyme / dose assay',
    summary: 'Kinetics → IC₅₀ → absorbance → protein',
    toolIds: ['enzyme-kinetics', 'dose-response', 'beer-lambert', 'protein-assay'],
  },
  {
    id: 'culture',
    name: 'Culture workflow',
    summary: 'Count → seed → growth → harvest',
    toolIds: ['cell-count', 'seeding', 'growth-curve'],
  },
];

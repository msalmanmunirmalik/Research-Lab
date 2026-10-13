import React, { useMemo } from 'react';
import type { ChartSeries, ResultBar, SequenceHighlight, ToolResult } from '../../utils/toolCatalog';

const toneClass = (tone?: ResultBar['tone']) => {
  switch (tone) {
    case 'ok':
      return 'bg-emerald-500';
    case 'warn':
      return 'bg-amber-500';
    case 'bad':
      return 'bg-rose-500';
    case 'neutral':
    default:
      return 'bg-slate-600';
  }
};

const highlightClass = (tone?: SequenceHighlight['tone']) => {
  switch (tone) {
    case 'ok':
      return 'bg-emerald-200 text-emerald-900';
    case 'warn':
      return 'bg-amber-200 text-amber-900';
    case 'accent':
      return 'bg-sky-200 text-sky-900';
    default:
      return 'bg-slate-200 text-slate-800';
  }
};

export const ResultBars: React.FC<{ bars: ResultBar[] }> = ({ bars }) => (
  <div className="space-y-3">
    {bars.map((b) => (
      <div key={b.label}>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-slate-600">{b.label}</span>
          <span className="text-xs font-semibold text-slate-900">{b.display}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${toneClass(b.tone)}`}
            style={{ width: `${Math.max(2, Math.min(100, (b.value / b.max) * 100))}%` }}
          />
        </div>
      </div>
    ))}
  </div>
);

export const LineChart: React.FC<{ series: ChartSeries }> = ({ series }) => {
  const { path, area, ticksX, ticksY, w, h } = useMemo(() => {
    const pts = series.points;
    const width = 420;
    const height = 180;
    const pad = { t: 12, r: 12, b: 28, l: 40 };
    if (!pts.length) {
      return { path: '', area: '', ticksX: [], ticksY: [], w: width, h: height };
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(0, ...ys);
    const maxY = Math.max(...ys) || 1;
    const dx = maxX - minX || 1;
    const dy = maxY - minY || 1;
    const sx = (x: number) => pad.l + ((x - minX) / dx) * (width - pad.l - pad.r);
    const sy = (y: number) => height - pad.b - ((y - minY) / dy) * (height - pad.t - pad.b);
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x)} ${sy(p.y)}`).join(' ');
    const areaPath = `${line} L ${sx(pts[pts.length - 1].x)} ${sy(minY)} L ${sx(pts[0].x)} ${sy(minY)} Z`;
    const formatTick = (n: number) => {
      if (Math.abs(n) >= 1000) return n.toExponential(0);
      return Number(n.toPrecision(3)).toString();
    };
    return {
      path: line,
      area: areaPath,
      ticksX: [minX, minX + dx / 2, maxX].map((x) => ({ x: sx(x), label: formatTick(x) })),
      ticksY: [minY, minY + dy / 2, maxY].map((y) => ({ y: sy(y), label: formatTick(y) })),
      w: width,
      h: height,
    };
  }, [series]);

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-slate-600">{series.label}</span>
        <span className="text-[10px] text-slate-400">
          {[series.xUnit, series.yUnit].filter(Boolean).join(' → ')}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full overflow-visible">
        {ticksY.map((t) => (
          <g key={`y-${t.label}`}>
            <line x1={40} x2={w - 12} y1={t.y} y2={t.y} stroke="#e2e8f0" strokeWidth={1} />
            <text x={36} y={t.y + 3} textAnchor="end" className="fill-slate-400" fontSize={9}>
              {t.label}
            </text>
          </g>
        ))}
        {ticksX.map((t) => (
          <text key={`x-${t.label}`} x={t.x} y={h - 8} textAnchor="middle" className="fill-slate-400" fontSize={9}>
            {t.label}
          </text>
        ))}
        {area && <path d={area} fill="#0f172a" fillOpacity={0.06} />}
        {path && <path d={path} fill="none" stroke="#0f172a" strokeWidth={2} strokeLinejoin="round" />}
      </svg>
    </div>
  );
};

export const SequenceMap: React.FC<{
  seq: string;
  highlights: SequenceHighlight[];
}> = ({ seq, highlights }) => {
  const display = seq.length > 240 ? `${seq.slice(0, 240)}…` : seq;
  const clipped = Math.min(seq.length, 240);

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {highlights.map((h, i) => (
          <span
            key={`${h.label}-${i}`}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${highlightClass(h.tone)}`}
          >
            {h.label} {h.start + 1}–{h.end}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="relative font-mono text-[11px] leading-5 tracking-wider text-slate-700 whitespace-pre-wrap break-all">
          {Array.from({ length: clipped }).map((_, i) => {
            const hit = highlights.find((h) => i >= h.start && i < h.end && h.end <= clipped);
            return (
              <span key={i} className={hit ? highlightClass(hit.tone) : undefined}>
                {display[i]}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const SCALAR_LABELS: Record<string, string> = {
  mass: 'Mass',
  concentration: 'Concentration',
  volume: 'Volume',
  mw: 'Molecular weight',
  dilutionFactor: 'Dilution factor',
  stockVolume: 'Stock volume',
  diluent: 'Diluent',
  stepFactor: 'Step factor',
  pH: 'pH',
  ratio: 'Ratio',
  buffering: 'Buffering',
  absorbance: 'Absorbance',
  velocity: 'Velocity',
  saturation: 'Saturation',
  halfVmaxAt: '½ Vmax at',
  forward: 'Forward primer',
  reverse: 'Reverse primer',
  forwardPos: 'Forward position',
  reversePos: 'Reverse position',
  ampliconSize: 'Amplicon size',
  tmDelta: 'ΔTm',
  forwardLength: 'Forward length',
  forwardTm: 'Forward Tm',
  forwardGC: 'Forward GC',
  forwardHairpin: 'Forward hairpin',
  reverseLength: 'Reverse length',
  reverseTm: 'Reverse Tm',
  reverseGC: 'Reverse GC',
  reverseHairpin: 'Reverse hairpin',
  tmDifference: 'ΔTm',
  finalRelative: 'Final relative yield',
  fold: 'Fold amplification',
  approxCopiesNote: 'Assumptions',
  template: 'Template',
  forwardPrimer: 'Forward primer vol.',
  reversePrimer: 'Reverse primer vol.',
  masterMix: 'Master mix',
  water: 'Water',
  total: 'Total',
  insertMass: 'Insert mass',
  vectorMass: 'Vector mass',
  insertVolume: 'Insert volume',
  vectorVolume: 'Vector volume',
  length: 'Length',
  gc: 'GC content',
  gcSkew: 'GC skew',
  composition: 'Composition',
  approxMW: 'Approx. MW',
  approxTm: 'Approx. Tm',
  sitesFound: 'Sites found',
  list: 'Site list',
  reverseComplement: 'Reverse complement',
  complement: 'Complement',
  frame: 'Frame',
  protein: 'Translation',
  aaLength: 'Protein length',
  stops: 'Stop codons',
  density: 'Density',
  densityMl: 'Density',
  viableDensity: 'Viable density',
  doublingApprox: 'Approx. doubling',
  harvestTime: 'Time to harvest',
  finalDensity: 'Final density',
  seedVolume: 'Seed volume',
  mediaToAdd: 'Media to add',
  ic50: 'IC₅₀',
  activityAtDose: 'Activity at dose',
  dynamicRange: 'Dynamic range',
  deltaCtSample: 'ΔCt sample',
  deltaCtControl: 'ΔCt control',
  deltaDeltaCt: 'ΔΔCt',
  foldChange: 'Fold change',
  direction: 'Direction',
  program: 'Program',
  cycleTime: 'Cycle time',
  totalTime: 'Total run time',
  rampNote: 'Ramp',
  uL: 'μL',
  mL: 'mL',
  L: 'L',
  ug: 'μg',
  mg: 'mg',
  g: 'g',
  nM: 'nM',
  uM: 'μM',
  mM: 'mM',
  peruL: 'cells/μL',
  permL: 'cells/mL',
  fragments: 'Fragments',
  relativeRf: 'Relative migration',
  hint: 'Note',
};

const COPYABLE = new Set([
  'forward',
  'reverse',
  'protein',
  'reverseComplement',
  'complement',
  'list',
  'program',
]);

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const exportSeriesCsv = (series: ChartSeries) => {
  const rows = ['x,y', ...series.points.map((p) => `${p.x},${p.y}`)];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${series.id || 'series'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

export const ToolResultsPanel: React.FC<{ result: ToolResult }> = ({ result }) => {
  const entries = Object.entries(result.scalars).filter(([k]) => k !== 'hint');
  const [copied, setCopied] = React.useState<string | null>(null);
  const primary = entries[0];
  const rest = entries.slice(1);

  return (
    <div className="space-y-5">
      {result.scalars.hint && entries.length === 0 && !result.series && !result.bars ? (
        <p className="text-sm text-slate-600">{result.scalars.hint}</p>
      ) : null}

      {primary ? (
        <div className="rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50/90 to-white px-4 py-3.5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700/80">
            {SCALAR_LABELS[primary[0]] || primary[0]}
          </p>
          <p
            className={`mt-1 text-slate-900 ${
              primary[1].length > 48 || COPYABLE.has(primary[0])
                ? 'break-all font-mono text-sm'
                : 'text-2xl font-semibold tracking-tight'
            }`}
          >
            {primary[1]}
            {COPYABLE.has(primary[0]) ? (
              <button
                type="button"
                className="ml-3 align-middle text-xs font-semibold text-teal-700 hover:underline"
                onClick={() => {
                  void copyText(primary[1]).then((ok) => {
                    if (ok) {
                      setCopied(primary[0]);
                      window.setTimeout(() => setCopied(null), 1200);
                    }
                  });
                }}
              >
                {copied === primary[0] ? 'Copied' : 'Copy'}
              </button>
            ) : null}
          </p>
        </div>
      ) : null}

      {rest.length > 0 ? (
        <dl className="divide-y divide-slate-100 border-t border-slate-100">
          {rest.map(([key, val]) => (
            <div
              key={key}
              className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
            >
              <dt className="shrink-0 text-sm text-slate-500">
                {SCALAR_LABELS[key] || key}
              </dt>
              <dd
                className={`text-sm text-slate-900 ${
                  val.length > 40 || COPYABLE.has(key)
                    ? 'break-all font-mono text-xs'
                    : 'font-medium sm:text-right'
                }`}
              >
                <span>{val}</span>
                {COPYABLE.has(key) ? (
                  <button
                    type="button"
                    className="ml-2 text-xs font-semibold text-teal-700 hover:underline"
                    onClick={() => {
                      void copyText(val).then((ok) => {
                        if (ok) {
                          setCopied(key);
                          window.setTimeout(() => setCopied(null), 1200);
                        }
                      });
                    }}
                  >
                    {copied === key ? 'Copied' : 'Copy'}
                  </button>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {result.bars && result.bars.length > 0 ? <ResultBars bars={result.bars} /> : null}

      {result.series?.map((s) => (
        <div key={s.id} className="border-t border-slate-100 pt-3">
          <div className="mb-1 flex justify-end">
            <button
              type="button"
              onClick={() => exportSeriesCsv(s)}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Export CSV
            </button>
          </div>
          <LineChart series={s} />
        </div>
      ))}

      {result.sequenceMap ? (
        <SequenceMap seq={result.sequenceMap.seq} highlights={result.sequenceMap.highlights} />
      ) : null}

      {result.tips && result.tips.length > 0 ? (
        <ul className="space-y-1 text-sm text-slate-600">
          {result.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Props = {
  headers: string[];
  rows: string[][];
  title?: string;
};

function toNum(v: string): number | null {
  const t = String(v ?? '').trim().replace(/,/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lightweight chart from the active sheet — first label column + numeric columns.
 */
const SheetQuickChart: React.FC<Props> = ({ headers, rows, title }) => {
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');

  const { data, seriesKeys, labelKey } = useMemo(() => {
    const cols = headers.map((h, i) => ({
      i,
      header: h || `Col ${i + 1}`,
      numeric: rows.some((r) => toNum(r[i] ?? '') != null),
    }));
    const labelCol = cols.find((c) => !c.numeric) || cols[0];
    const valueCols = cols.filter((c) => c.numeric && c.i !== labelCol?.i).slice(0, 3);
    if (!labelCol || valueCols.length === 0) {
      return { data: [] as Record<string, string | number>[], seriesKeys: [] as string[], labelKey: 'x' };
    }
    const points = rows
      .map((r) => {
        const label = String(r[labelCol.i] ?? '').trim() || '—';
        const point: Record<string, string | number> = { [labelCol.header]: label };
        let any = false;
        for (const vc of valueCols) {
          const n = toNum(r[vc.i] ?? '');
          if (n != null) {
            point[vc.header] = n;
            any = true;
          }
        }
        return any ? point : null;
      })
      .filter(Boolean) as Record<string, string | number>[];
    return {
      data: points.slice(0, 40),
      seriesKeys: valueCols.map((c) => c.header),
      labelKey: labelCol.header,
    };
  }, [headers, rows]);

  if (data.length === 0 || seriesKeys.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-4 py-10 text-[13px] text-slate-500 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
        <p className="font-medium text-slate-700 mb-1">No chart yet</p>
        <p className="max-w-xs">
          Add a label column and at least one numeric column in the sheet to preview a chart.
        </p>
      </div>
    );
  }

  const colors = ['#0369a1', '#0d9488', '#c2410c'];

  return (
    <div className="h-full flex flex-col min-h-[280px]">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-[13px] font-medium text-slate-800 truncate">{title || 'Preview'}</p>
        <div className="inline-flex rounded-md border border-slate-200 p-0.5 bg-white">
          <button
            type="button"
            onClick={() => setChartType('bar')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded ${
              chartType === 'bar' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Bar
          </button>
          <button
            type="button"
            onClick={() => setChartType('line')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded ${
              chartType === 'line' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Line
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey={labelKey} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              {seriesKeys.map((k, i) => (
                <Bar key={k} dataKey={k} fill={colors[i % colors.length]} radius={[3, 3, 0, 0]} maxBarSize={40} />
              ))}
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey={labelKey} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              {seriesKeys.map((k, i) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stroke={colors[i % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SheetQuickChart;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  colLetter,
  normalizeMatrix,
  parseClipboardMatrix,
} from '../../utils/spreadsheet';
import { displayCellValue } from '../../utils/sheetFormulas';

type Props = {
  headers: string[];
  rows: string[][];
  onChange: (next: { headers: string[]; rows: string[][] }) => void;
  /** Minimum visible empty rows */
  minRows?: number;
  minCols?: number;
  className?: string;
};

type CellPos = { r: number; c: number }; // r=-1 means header row

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Spreadsheet grid — Sheets/Excel feel:
 * click, type, Tab/Enter, Ctrl/Cmd+C/V. No paste/row control buttons.
 */
const SpreadsheetGrid: React.FC<Props> = ({
  headers,
  rows,
  onChange,
  minRows = 15,
  minCols = 6,
  className = '',
}) => {
  const matrix = useMemo(
    () => normalizeMatrix(headers, rows, minCols, minRows),
    [headers, rows, minCols, minRows]
  );

  const [active, setActive] = useState<CellPos>({ r: 0, c: 0 });
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [selEnd, setSelEnd] = useState<CellPos | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const skipBlurCommit = useRef(false);

  const colCount = matrix.headers.length;
  const rowCount = matrix.rows.length;

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing, active]);

  const ensureSize = useCallback(
    (needR: number, needC: number, base = matrix) => {
      let nextHeaders = [...base.headers];
      let nextRows = base.rows.map((r) => [...r]);
      while (nextHeaders.length < needC) {
        nextHeaders.push(`Column ${nextHeaders.length + 1}`);
      }
      nextRows = nextRows.map((r) => {
        const copy = [...r];
        while (copy.length < nextHeaders.length) copy.push('');
        return copy;
      });
      while (nextRows.length < needR) {
        nextRows.push(Array.from({ length: nextHeaders.length }, () => ''));
      }
      return { headers: nextHeaders, rows: nextRows };
    },
    [matrix]
  );

  const commit = useCallback(
    (value: string, move?: CellPos) => {
      const nextValue = value ?? '';
      let nextHeaders = [...matrix.headers];
      let nextRows = matrix.rows.map((row) => [...row]);

      if (active.r === -1) {
        nextHeaders[active.c] = nextValue;
      } else {
        nextRows[active.r] = [...(nextRows[active.r] || Array(colCount).fill(''))];
        while (nextRows[active.r].length < colCount) nextRows[active.r].push('');
        nextRows[active.r][active.c] = nextValue;
      }

      let target = move;
      if (move) {
        // Grow like Sheets when leaving the edge
        if (move.r >= nextRows.length) {
          const grown = ensureSize(move.r + 1, nextHeaders.length, {
            headers: nextHeaders,
            rows: nextRows,
          });
          nextHeaders = grown.headers;
          nextRows = grown.rows;
        }
        if (move.c >= nextHeaders.length) {
          const grown = ensureSize(nextRows.length, move.c + 1, {
            headers: nextHeaders,
            rows: nextRows,
          });
          nextHeaders = grown.headers;
          nextRows = grown.rows;
        }
        target = {
          r: clamp(move.r, -1, nextRows.length - 1),
          c: clamp(move.c, 0, nextHeaders.length - 1),
        };
      }

      onChange({ headers: nextHeaders, rows: nextRows });
      setEditing(false);
      setEditValue('');
      if (target) {
        setActive(target);
        setSelEnd(null);
      }
    },
    [active, matrix, onChange, colCount, ensureSize]
  );

  const cellValue = (pos: CellPos) => {
    if (pos.r === -1) return matrix.headers[pos.c] ?? '';
    return matrix.rows[pos.r]?.[pos.c] ?? '';
  };

  const startEdit = (pos: CellPos, initial?: string) => {
    setActive(pos);
    setSelEnd(null);
    setEditValue(initial !== undefined ? initial : cellValue(pos));
    setEditing(true);
  };

  const selectionBounds = () => {
    const end = selEnd || active;
    return {
      r0: Math.min(active.r, end.r),
      r1: Math.max(active.r, end.r),
      c0: Math.min(active.c, end.c),
      c1: Math.max(active.c, end.c),
    };
  };

  const isSelected = (r: number, c: number) => {
    if (active.r === r && active.c === c) return true;
    if (!selEnd) return false;
    const b = selectionBounds();
    if (b.r0 === -1 && r === -1) return c >= b.c0 && c <= b.c1;
    if (r === -1 || b.r0 === -1) return false;
    return r >= b.r0 && r <= b.r1 && c >= b.c0 && c <= b.c1;
  };

  const copySelection = async () => {
    const b = selectionBounds();
    const lines: string[] = [];
    if (b.r0 === -1) {
      lines.push(matrix.headers.slice(b.c0, b.c1 + 1).join('\t'));
    }
    for (let r = Math.max(0, b.r0); r <= b.r1; r++) {
      if (r < 0) continue;
      lines.push(
        Array.from({ length: b.c1 - b.c0 + 1 }, (_, i) => matrix.rows[r]?.[b.c0 + i] ?? '').join(
          '\t'
        )
      );
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      /* ignore */
    }
  };

  const pasteAtActive = async (text?: string) => {
    let raw = text;
    if (raw == null) {
      try {
        raw = await navigator.clipboard.readText();
      } catch {
        return;
      }
    }
    if (!raw?.trim()) return;

    const parsed = parseClipboardMatrix(raw);
    const pasteRows = [parsed.headers, ...parsed.rows].filter((row) =>
      row.some((c) => String(c).trim() !== '')
    );
    if (!pasteRows.length) return;

    // Paste into empty sheet starting at A1 → first row becomes headers
    const sheetEmpty =
      active.r <= 0 &&
      active.c === 0 &&
      !matrix.headers.some((h) => h && !/^Column\s+\d+$/i.test(h)) &&
      !matrix.rows.some((row) => row.some((c) => String(c).trim() !== ''));

    if (sheetEmpty && pasteRows.length >= 1) {
      const nextHeaders = pasteRows[0];
      const nextBody = pasteRows.slice(1);
      onChange(normalizeMatrix(nextHeaders, nextBody, minCols, minRows));
      setEditing(false);
      setActive({ r: 0, c: 0 });
      setSelEnd(null);
      return;
    }

    const startR = active.r < 0 ? 0 : active.r;
    const startC = active.c;
    const needR = startR + pasteRows.length;
    const needC = startC + Math.max(...pasteRows.map((r) => r.length));
    const next = ensureSize(needR, needC);
    pasteRows.forEach((prow, ri) => {
      prow.forEach((val, ci) => {
        next.rows[startR + ri][startC + ci] = val;
      });
    });
    onChange(next);
    setEditing(false);
    setSelEnd({
      r: startR + pasteRows.length - 1,
      c: startC + (pasteRows[0]?.length || 1) - 1,
    });
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return;

    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      void copySelection();
      return;
    }
    if (meta && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      void pasteAtActive();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      startEdit(active);
      return;
    }
    if (e.key === 'F2') {
      e.preventDefault();
      startEdit(active);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const nextC = e.shiftKey ? active.c - 1 : active.c + 1;
      if (nextC >= colCount && !e.shiftKey) {
        const grown = ensureSize(rowCount, colCount + 1);
        onChange(grown);
        setActive({ r: active.r, c: colCount });
      } else if (nextC < 0) {
        setActive({ r: clamp(active.r - 1, -1, rowCount - 1), c: colCount - 1 });
      } else if (nextC >= colCount) {
        setActive({ r: clamp(active.r + 1, -1, rowCount - 1), c: 0 });
      } else {
        setActive({ ...active, c: nextC });
      }
      setSelEnd(null);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const b = selectionBounds();
      if (b.r0 === -1) {
        const nextHeaders = [...matrix.headers];
        for (let c = b.c0; c <= b.c1; c++) nextHeaders[c] = '';
        onChange({ headers: nextHeaders, rows: matrix.rows });
      } else {
        const nextRows = matrix.rows.map((row) => [...row]);
        for (let r = Math.max(0, b.r0); r <= b.r1; r++) {
          for (let c = b.c0; c <= b.c1; c++) {
            if (!nextRows[r]) nextRows[r] = Array(colCount).fill('');
            nextRows[r][c] = '';
          }
        }
        onChange({ headers: matrix.headers, rows: nextRows });
      }
      return;
    }

    if (e.key.length === 1 && !meta && !e.altKey) {
      e.preventDefault();
      startEdit(active, e.key);
      return;
    }

    const move = (dr: number, dc: number, extend: boolean) => {
      e.preventDefault();
      let nextR = active.r + dr;
      let nextC = active.c + dc;
      if (nextR >= rowCount) {
        onChange(ensureSize(rowCount + 1, colCount));
      }
      if (nextC >= colCount) {
        onChange(ensureSize(Math.max(rowCount, nextR + 1), colCount + 1));
      }
      nextR = clamp(nextR, -1, Math.max(rowCount, nextR + 1) - 1);
      nextC = clamp(nextC, 0, Math.max(colCount, nextC + 1) - 1);
      const next = { r: nextR, c: nextC };
      if (extend) setSelEnd(next);
      else {
        setActive(next);
        setSelEnd(null);
      }
    };

    if (e.key === 'ArrowUp') move(-1, 0, e.shiftKey);
    if (e.key === 'ArrowDown') move(1, 0, e.shiftKey);
    if (e.key === 'ArrowLeft') move(0, -1, e.shiftKey);
    if (e.key === 'ArrowRight') move(0, 1, e.shiftKey);
  };

  const addRow = () => {
    onChange(ensureSize(rowCount + 1, colCount));
  };

  const removeRow = () => {
    if (rowCount <= 1) return;
    const removeAt = active.r >= 0 ? active.r : rowCount - 1;
    onChange({
      headers: matrix.headers,
      rows: matrix.rows.filter((_, i) => i !== removeAt),
    });
    setActive((a) => ({
      ...a,
      r: a.r === -1 ? -1 : clamp(a.r >= removeAt ? a.r - 1 : a.r, 0, rowCount - 2),
    }));
    setSelEnd(null);
  };

  const addCol = () => {
    onChange(ensureSize(rowCount, colCount + 1));
  };

  const removeCol = () => {
    if (colCount <= 1) return;
    const removeAt = active.c;
    onChange({
      headers: matrix.headers.filter((_, i) => i !== removeAt),
      rows: matrix.rows.map((r) => r.filter((_, i) => i !== removeAt)),
    });
    setActive((a) => ({ ...a, c: clamp(a.c >= removeAt ? a.c - 1 : a.c, 0, colCount - 2) }));
    setSelEnd(null);
  };

  const formulaLabel =
    active.r === -1 ? `${colLetter(active.c)}1` : `${colLetter(active.c)}${active.r + 2}`;

  const stepBtn =
    'inline-flex h-6 w-6 items-center justify-center rounded text-[14px] font-medium leading-none text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <div className={`flex flex-col gap-0 ${className}`}>
      {/* Formula bar + compact row/col steppers */}
      <div className="flex items-center gap-2 border border-b-0 border-slate-300 rounded-t-lg bg-white px-2 py-1.5">
        <span className="text-[11px] font-semibold text-slate-500 w-10 shrink-0 tabular-nums text-center">
          {formulaLabel}
        </span>
        <div className="w-px h-4 bg-slate-200" />
        <input
          ref={inputRef}
          value={editing ? (editValue ?? '') : cellValue(active)}
          onChange={(e) => {
            if (!editing) startEdit(active, e.target.value);
            else setEditValue(e.target.value);
          }}
          onFocus={() => {
            if (!editing) startEdit(active);
          }}
          onKeyDown={(e) => {
            const val = (e.target as HTMLInputElement).value ?? '';
            if (e.key === 'Enter') {
              e.preventDefault();
              skipBlurCommit.current = true;
              commit(val, { r: active.r + 1, c: active.c });
              gridRef.current?.focus();
            } else if (e.key === 'Tab') {
              e.preventDefault();
              skipBlurCommit.current = true;
              commit(val, {
                r: active.r,
                c: e.shiftKey ? active.c - 1 : active.c + 1,
              });
              gridRef.current?.focus();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              skipBlurCommit.current = true;
              setEditing(false);
              setEditValue('');
              gridRef.current?.focus();
            }
          }}
          onBlur={(e) => {
            if (skipBlurCommit.current) {
              skipBlurCommit.current = false;
              return;
            }
            if (editing) commit(e.currentTarget.value ?? '');
          }}
          className="flex-1 min-w-0 text-[13px] bg-transparent border-0 focus:outline-none px-1"
          placeholder="Enter a value"
          aria-label="Formula bar"
        />
        <div className="hidden sm:flex items-center gap-2 shrink-0 pl-1 border-l border-slate-200">
          <div className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50/80 p-0.5">
            <span className="px-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Row
            </span>
            <button
              type="button"
              className={stepBtn}
              aria-label="Remove row"
              title="Remove selected row"
              disabled={rowCount <= 1}
              onClick={removeRow}
            >
              −
            </button>
            <button
              type="button"
              className={stepBtn}
              aria-label="Add row"
              title="Add row"
              onClick={addRow}
            >
              +
            </button>
          </div>
          <div className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50/80 p-0.5">
            <span className="px-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Col
            </span>
            <button
              type="button"
              className={stepBtn}
              aria-label="Remove column"
              title="Remove selected column"
              disabled={colCount <= 1}
              onClick={removeCol}
            >
              −
            </button>
            <button
              type="button"
              className={stepBtn}
              aria-label="Add column"
              title="Add column"
              onClick={addCol}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onGridKeyDown}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text');
          if (text) {
            e.preventDefault();
            void pasteAtActive(text);
          }
        }}
        className="overflow-auto rounded-b-lg border border-slate-300 bg-white max-h-[min(70vh,640px)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500/20"
      >
        <table className="border-collapse min-w-full text-[12px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-slate-100 border border-slate-200 w-10 min-w-[2.5rem] text-[10px] text-slate-400 font-medium">
                #
              </th>
              {matrix.headers.map((_, ci) => (
                <th
                  key={`letter-${ci}`}
                  className="bg-slate-100 border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 min-w-[100px]"
                >
                  {colLetter(ci)}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-20 bg-slate-50 border border-slate-200 text-[10px] text-slate-400 font-medium">
                1
              </th>
              {matrix.headers.map((h, ci) => {
                const selected = isSelected(-1, ci);
                const isActive = active.r === -1 && active.c === ci;
                return (
                  <th
                    key={`h-${ci}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      gridRef.current?.focus();
                      if (e.shiftKey) setSelEnd({ r: -1, c: ci });
                      else {
                        setActive({ r: -1, c: ci });
                        setSelEnd(null);
                      }
                    }}
                    onDoubleClick={() => startEdit({ r: -1, c: ci })}
                    className={`border border-slate-200 p-0 font-semibold text-left ${
                      isActive
                        ? 'ring-2 ring-inset ring-sky-500 bg-sky-50'
                        : selected
                          ? 'bg-sky-50/70'
                          : 'bg-amber-50/40'
                    }`}
                  >
                    <div className="px-2 py-1.5 min-h-[32px] text-slate-800 truncate">
                      {h || <span className="text-slate-300 font-normal">Header</span>}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row, ri) => (
              <tr key={ri}>
                <td className="sticky left-0 z-10 bg-slate-50 border border-slate-200 text-center text-[10px] text-slate-400 font-medium">
                  {ri + 2}
                </td>
                {matrix.headers.map((_, ci) => {
                  const selected = isSelected(ri, ci);
                  const isActive = active.r === ri && active.c === ci;
                  const raw = row[ci] ?? '';
                  const { display, formula } = displayCellValue(
                    raw,
                    ri,
                    matrix.headers,
                    matrix.rows
                  );
                  return (
                    <td
                      key={`${ri}-${ci}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        gridRef.current?.focus();
                        if (e.shiftKey) setSelEnd({ r: ri, c: ci });
                        else {
                          setActive({ r: ri, c: ci });
                          setSelEnd(null);
                          setEditing(false);
                        }
                      }}
                      onDoubleClick={() => startEdit({ r: ri, c: ci })}
                      title={formula || undefined}
                      className={`border border-slate-200 p-0 ${
                        isActive
                          ? 'ring-2 ring-inset ring-sky-500 bg-sky-50'
                          : selected
                            ? 'bg-sky-50/60'
                            : formula
                              ? 'bg-teal-50/50'
                              : ri % 2
                                ? 'bg-slate-50/30'
                                : 'bg-white'
                      }`}
                    >
                      <div
                        className={`px-2 py-1.5 min-h-[32px] truncate ${
                          formula ? 'text-teal-900 font-medium tabular-nums' : 'text-slate-800'
                        }`}
                      >
                        {editing && isActive ? '' : display}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile row/col steppers (formula bar hides them on small screens) */}
      <div className="sm:hidden flex items-center gap-2 mt-2">
        <div className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5">
          <span className="px-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Row
          </span>
          <button type="button" className={stepBtn} aria-label="Remove row" disabled={rowCount <= 1} onClick={removeRow}>
            −
          </button>
          <button type="button" className={stepBtn} aria-label="Add row" onClick={addRow}>
            +
          </button>
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5">
          <span className="px-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Col
          </span>
          <button type="button" className={stepBtn} aria-label="Remove column" disabled={colCount <= 1} onClick={removeCol}>
            −
          </button>
          <button type="button" className={stepBtn} aria-label="Add column" onClick={addCol}>
            +
          </button>
        </div>
      </div>

      <p className="mt-1.5 text-[11px] text-slate-400 px-0.5">
        Click · type · Enter / Tab · ⌘V / Ctrl+V to paste · Row/Col + − to resize
      </p>
    </div>
  );
};

export default SpreadsheetGrid;

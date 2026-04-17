import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { applyForward, applyForwardDetailed, pinKey, type PinEndSet } from "./recalc";
import { parseWorkbookToGrid } from "./parseXlsx";
import { getWeekByWeekState, putWeekByWeekState } from "../api";
import { useEditMode } from "../EditModeContext";
import type { FlowCell, GridModel, StreamId } from "./types";
import {
  DC_ROBOTS_ID,
  PILOT_TOTALS_ID,
  ULTRA_ID,
  effectiveOut,
  emptyCell,
} from "./types";
import {
  CUSTOMER_SHIFT_1,
  DC_SHIFT_1,
  DC_SHIFT_2,
  DC_SHIFT_3,
  NON_PILOT_ROBOTS_ID,
  TRAINING_SHIFT_1,
  TRAINING_SHIFT_2,
  TRAINING_SHIFT_3,
  isForcedZeroOutStream,
  isFreeInStream,
  isMirroredInStream,
} from "./flowGraph";
import "./weekbyweek.css";

const COLS_WEEK = 4;
const TOTAL_USABLE_DATA_ID = "Total Usable Data Collected";

type NumField = "in" | "out" | "end" | "outCustomer" | "outNonPilot";

type SheetMode = "flow" | "end";
type GlobalSettings = {
  days_in_week: 5 | 6 | 7;
  percent_usable: number;
  uptime_percent: number;
  hours_shift_1: number;
  hours_shift_2: number;
  hours_shift_3: number;
};

function defaultSettings(): GlobalSettings {
  return {
    days_in_week: 5,
    percent_usable: 100,
    uptime_percent: 100,
    hours_shift_1: 8,
    hours_shift_2: 8,
    hours_shift_3: 8,
  };
}

function defaultStreamOrder(): StreamId[] {
  return [
    ULTRA_ID,
    DC_ROBOTS_ID,
    "Customer Robots",
    "Non Pilot Robots",
    "Training Robots",
    "Training Shift 1",
    "DC Shift 1",
    "Customer Shift 1",
    "Training Shift 2",
    "DC Shift 2",
    "Training Shift 3",
    "DC Shift 3",
    PILOT_TOTALS_ID,
  ];
}

function emptyGrid(weeks = 4): GridModel {
  const start = new Date();
  const day = start.getUTCDay();
  const add = (5 - day + 7) % 7 || 7;
  start.setUTCDate(start.getUTCDate() + add);
  const weekDates: string[] = [];
  for (let i = 0; i < weeks; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i * 7);
    weekDates.push(d.toISOString().slice(0, 10));
  }
  const streamOrder = defaultStreamOrder();
  const cells: GridModel["cells"] = {};
  const n = weekDates.length;
  for (const id of streamOrder) {
    if (id === ULTRA_ID) continue;
    cells[id] = Array.from({ length: n }, () => emptyCell(id));
  }
  return {
    weekDates,
    streamOrder,
    cells,
    ultra: Array(n).fill(""),
  };
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function bandClass(sid: StreamId): string {
  if (sid === ULTRA_ID) return "band-ultra";
  if (sid === PILOT_TOTALS_ID) return "band-pt";
  if (sid.toLowerCase().includes("robot")) return "band-robot";
  if (sid.includes("Shift 3")) return "band-s3";
  if (sid.includes("Shift 2")) return "band-s2";
  return "band-s1";
}

function maxEndRow(model: GridModel, sid: StreamId): number {
  const col = model.cells[sid];
  if (!col?.length) return 1;
  return Math.max(1, ...col.map((c) => c.end));
}

function FlowConn({
  upperId,
  lowerId,
  week,
  model,
}: {
  upperId: StreamId;
  lowerId: StreamId;
  week: number;
  model: GridModel;
}) {
  const u = model.cells[upperId]?.[week] ?? emptyCell(upperId);
  const l = model.cells[lowerId]?.[week] ?? emptyCell(lowerId);
  const oe = effectiveOut(upperId, u);
  const li = l.in;
  const chips: ReactNode[] = [];

  const isLinkedPair =
    (upperId === TRAINING_SHIFT_1 && lowerId === DC_SHIFT_1) ||
    (upperId === DC_SHIFT_1 && lowerId === CUSTOMER_SHIFT_1) ||
    (upperId === TRAINING_SHIFT_2 && lowerId === DC_SHIFT_2) ||
    (upperId === TRAINING_SHIFT_3 && lowerId === DC_SHIFT_3) ||
    (upperId === DC_ROBOTS_ID && lowerId === "Customer Robots");

  if (upperId === DC_ROBOTS_ID && lowerId === "Customer Robots") {
    const dc = model.cells[DC_ROBOTS_ID]?.[week] ?? emptyCell(DC_ROBOTS_ID);
    const oc = dc.outCustomer ?? 0;
    const onp = dc.outNonPilot ?? 0;
    if (oc > 0) {
      chips.push(
        <span key="oc" className="wbw-chip wbw-chip-pass">
          <span className="wbw-chip-arrow" aria-hidden>
            ↓
          </span>
          Pass {oc}
        </span>,
      );
    }
    if (onp > 0) {
      chips.push(
        <span key="onp" className="wbw-chip wbw-chip-pass">
          <span className="wbw-chip-arrow" aria-hidden>
            ↓
          </span>
          Pass NP {onp}
        </span>,
      );
    }
    if (chips.length > 0) return <div className="wbw-flow-chips">{chips}</div>;
  }

  if (isLinkedPair) {
    const passValue = Math.max(oe, li);
    if (passValue <= 0) return null;
    return (
      <div className="wbw-flow-chips">
        <span className="wbw-chip wbw-chip-pass">
          <span className="wbw-chip-arrow" aria-hidden>
            ↓
          </span>
          Pass {passValue}
        </span>
      </div>
    );
  }

  if (oe === 0 && li === 0) return null;
  if (oe > 0) {
    chips.push(
      <span key="o" className="wbw-chip wbw-chip-transfer">
        <span className="wbw-chip-arrow" aria-hidden>
          ↓
        </span>
        Out {oe}
      </span>,
    );
  }
  if (li > 0 && !isFreeInStream(lowerId)) {
    chips.push(
      <span key="i" className="wbw-chip wbw-chip-newin">
        <span className="wbw-chip-arrow" aria-hidden>
          ↓
        </span>
        In {li}
      </span>,
    );
  }
  return <div className="wbw-flow-chips">{chips}</div>;
}

type WeekCellProps = {
  sid: StreamId;
  week: number;
  readOnly: boolean;
  isDc: boolean;
  band: string;
  mirroredIn: boolean;
  forcedZeroOut: boolean;
  freeInStream: boolean;
  sheetMode: SheetMode;
  model: GridModel;
  setCell: (stream: StreamId, week: number, field: NumField, value: number) => void;
};

function WeekCell({
  sid,
  week,
  readOnly,
  isDc,
  band,
  mirroredIn,
  forcedZeroOut,
  freeInStream,
  sheetMode,
  model,
  setCell,
}: WeekCellProps) {
  const c = model.cells[sid]?.[week] ?? emptyCell(sid);
  const oc = c.outCustomer ?? 0;
  const onp = c.outNonPilot ?? 0;
  const maxE = maxEndRow(model, sid);
  const pct = Math.min(100, (c.end / maxE) * 100);
  const empty =
    !readOnly &&
    c.in === 0 &&
    effectiveOut(sid, c) === 0 &&
    c.end === 0 &&
    (!isDc || (oc === 0 && onp === 0));

  const lockInForEndMode = sheetMode === "end" && freeInStream;
  const disableIn = readOnly || mirroredIn || lockInForEndMode;
  const disableEnd = readOnly || sheetMode === "flow";
  const showSourceInChip = !readOnly && freeInStream && c.in > 0;

  return (
    <div className={`wbw-card wbw-card--${band}`}>
      {showSourceInChip ? (
        <div className="wbw-local-chips">
          <span className="wbw-chip wbw-chip-newin">
            <span className="wbw-chip-arrow" aria-hidden>
              ↓
            </span>
            In {c.in}
          </span>
        </div>
      ) : null}
      <div className="wbw-card-end">{empty ? "—" : c.end}</div>
      <div className={isDc ? "inputs inputs-dc" : "inputs inputs-std"}>
        <input
          type="number"
          min={0}
          disabled={disableIn}
          value={c.in}
          onChange={(e) => setCell(sid, week, "in", Number(e.target.value) || 0)}
          aria-label={`${sid} week ${week + 1} in`}
          title={
            mirroredIn
              ? "Mirrored from upstream out"
              : lockInForEndMode
                ? "In is derived while editing end (switch to In / out to edit flows)"
                : undefined
          }
        />
        {isDc ? (
          <>
            <input
              type="number"
              min={0}
              disabled={readOnly}
              value={oc}
              onChange={(e) => setCell(sid, week, "outCustomer", Number(e.target.value) || 0)}
              aria-label={`${sid} week ${week + 1} out to customer robots`}
            />
            <input
              type="number"
              min={0}
              disabled={readOnly}
              value={onp}
              onChange={(e) => setCell(sid, week, "outNonPilot", Number(e.target.value) || 0)}
              aria-label={`${sid} week ${week + 1} out to non-pilot robots`}
            />
          </>
        ) : (
          <>
            <input
              type="number"
              min={0}
              disabled={readOnly || forcedZeroOut}
              value={forcedZeroOut ? 0 : c.out}
              onChange={(e) => setCell(sid, week, "out", Number(e.target.value) || 0)}
              aria-label={`${sid} week ${week + 1} out`}
              title={forcedZeroOut ? "No outbound transfer (change end to adjust)" : undefined}
            />
            <span className="wbw-out-na" title="Second out applies to DC Robots only">
              —
            </span>
          </>
        )}
        <input
          type="number"
          min={0}
          disabled={disableEnd}
          value={c.end}
          onChange={(e) => setCell(sid, week, "end", Number(e.target.value) || 0)}
          aria-label={`${sid} week ${week + 1} end`}
          title={
            disableEnd && !readOnly
              ? "Computed from in/out in In / out mode — switch to End mode to edit"
              : undefined
          }
        />
      </div>
      <div className="wbw-card-bar" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function WeekbyWeekFlow() {
  const { isEditMode } = useEditMode();
  const [base, setBase] = useState<GridModel>(() => applyForward(emptyGrid(6), new Set()));
  const [pinEnd, setPinEnd] = useState<PinEndSet>(() => new Set());
  const [sheetMode, setSheetMode] = useState<SheetMode>("flow");
  const [settings, setSettings] = useState<GlobalSettings>(() => defaultSettings());
  const [settingsWarning, setSettingsWarning] = useState<string | null>(null);
  const [persistError, setPersistError] = useState<string | null>(null);
  const hydrated = useRef(false);
  const saveTimer = useRef<number | null>(null);

  const solved = useMemo(
    () => applyForwardDetailed(base, pinEnd, sheetMode),
    [base, pinEnd, sheetMode],
  );
  const model = solved.model;
  const warnings = solved.warnings;

  useEffect(() => {
    let cancelled = false;
    getWeekByWeekState()
      .then((res) => {
        if (cancelled || !res.state) return;
        setBase(res.state.model);
        setPinEnd(new Set(res.state.pinEnd ?? []));
        setSheetMode(res.state.sheetMode ?? "flow");
        setSettings((res.state.settings as GlobalSettings | undefined) ?? defaultSettings());
      })
      .catch((e) => {
        if (!cancelled) setPersistError(String(e?.message ?? e));
      })
      .finally(() => {
        if (!cancelled) hydrated.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current || !isEditMode) return;
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      putWeekByWeekState({
        model: base,
        pinEnd: [...pinEnd],
        sheetMode,
        settings,
      })
        .then(() => setPersistError(null))
        .catch((e) => setPersistError(String(e?.message ?? e)));
    }, 500);
    return () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    };
  }, [base, pinEnd, sheetMode, settings, isEditMode]);

  const setSheetModeSafe = useCallback((m: SheetMode) => {
    setSheetMode(m);
    if (m === "flow") setPinEnd(new Set());
  }, []);

  const setCell = useCallback(
    (stream: StreamId, week: number, field: NumField, value: number) => {
      if (field === "end" && sheetMode === "flow") return;
      if (field === "in" && isMirroredInStream(stream)) return;
      if (field === "in" && sheetMode === "end" && isFreeInStream(stream)) return;
      if (field === "out" && isForcedZeroOutStream(stream)) return;
      setBase((prev) => {
        if (stream === PILOT_TOTALS_ID || stream === ULTRA_ID) return prev;
        const col = prev.cells[stream];
        if (!col) return prev;
        const next = { ...prev, cells: { ...prev.cells } };
        const v = Math.max(0, Math.round(value));
        const nc = col.map((c, i) => {
          if (i !== week) return { ...c };
          if (field === "outCustomer" || field === "outNonPilot") {
            const nextC: FlowCell = {
              ...c,
              [field]: v,
              out: 0,
            };
            return nextC;
          }
          if (field === "out" && stream === DC_ROBOTS_ID) {
            return {
              ...c,
              out: v,
              outCustomer: 0,
              outNonPilot: 0,
            };
          }
          return { ...c, [field]: v };
        });
        next.cells[stream] = nc;
        return next;
      });
      if (field === "end" && sheetMode === "end") {
        setPinEnd((p) => new Set(p).add(pinKey(stream, week)));
      } else if (field !== "end") {
        setPinEnd((p) => {
          const n = new Set(p);
          n.delete(pinKey(stream, week));
          return n;
        });
      }
    },
    [sheetMode],
  );

  const setUltra = useCallback((week: number, text: string) => {
    setBase((prev) => {
      const ultra = [...prev.ultra];
      ultra[week] = text;
      return { ...prev, ultra };
    });
  }, []);

  const trimWeeks = useCallback((mode: "first" | "last") => {
    setPinEnd(new Set());
    setBase((prev) => {
      if (prev.weekDates.length <= 1) return prev;
      const weekDates =
        mode === "first" ? prev.weekDates.slice(1) : prev.weekDates.slice(0, -1);
      const cells: GridModel["cells"] = { ...prev.cells };
      for (const id of prev.streamOrder) {
        if (id === ULTRA_ID) continue;
        const col = cells[id];
        if (!col) continue;
        cells[id] = mode === "first" ? col.slice(1) : col.slice(0, -1);
      }
      const ultra =
        mode === "first" ? prev.ultra.slice(1) : prev.ultra.slice(0, -1);
      return { ...prev, weekDates, cells, ultra };
    });
  }, []);

  const addWeek = useCallback(() => {
    setBase((prev) => {
      const last = prev.weekDates[prev.weekDates.length - 1];
      const d = new Date(last + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + 7);
      const iso = d.toISOString().slice(0, 10);
      const weekDates = [...prev.weekDates, iso];
      const cells: GridModel["cells"] = { ...prev.cells };
      for (const id of prev.streamOrder) {
        if (id === ULTRA_ID) continue;
        const col = cells[id] ?? [];
        cells[id] = [...col, emptyCell(id)];
      }
      return {
        ...prev,
        weekDates,
        cells,
        ultra: [...prev.ultra, ""],
      };
    });
  }, []);

  const onFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    f.arrayBuffer().then((buf) => {
      setBase(parseWorkbookToGrid(buf));
      setPinEnd(new Set());
      setSheetMode("flow");
    });
  }, []);

  const canTrimWeek = model.weekDates.length > 1;

  const setHours = useCallback(
    (key: "hours_shift_1" | "hours_shift_2" | "hours_shift_3", raw: number) => {
      const v = Math.max(0, raw);
      setSettings((prev) => {
        const other =
          key === "hours_shift_1"
            ? prev.hours_shift_2 + prev.hours_shift_3
            : key === "hours_shift_2"
              ? prev.hours_shift_1 + prev.hours_shift_3
              : prev.hours_shift_1 + prev.hours_shift_2;
        const maxAllowed = Math.max(0, 24 - other);
        const applied = Math.min(v, maxAllowed);
        setSettingsWarning(
          applied < v
            ? `Shift hours are capped so total across shifts does not exceed 24 (applied ${applied.toFixed(2)}).`
            : null,
        );
        return { ...prev, [key]: applied };
      });
    },
    [],
  );

  const usableCollectedForWeek = useCallback(
    (week: number): number => {
      const dc1 = model.cells["DC Shift 1"]?.[week]?.end ?? 0;
      const dc2 = model.cells["DC Shift 2"]?.[week]?.end ?? 0;
      const dc3 = model.cells["DC Shift 3"]?.[week]?.end ?? 0;
      const factor =
        settings.days_in_week *
        (settings.percent_usable / 100) *
        (settings.uptime_percent / 100);
      const shift1 = settings.hours_shift_1 * Math.floor(dc1 / 1.5) * factor;
      const shift2 = settings.hours_shift_2 * Math.floor(dc2 / 1.5) * factor;
      const shift3 = settings.hours_shift_3 * Math.floor(dc3 / 1.5) * factor;
      return shift1 + shift2 + shift3;
    },
    [model, settings],
  );

  const bodyRows: React.ReactNode[] = [];
  const order = model.streamOrder;
  const gapBefore = new Set<StreamId>([
    DC_ROBOTS_ID,
    TRAINING_SHIFT_1,
    TRAINING_SHIFT_2,
    TRAINING_SHIFT_3,
    PILOT_TOTALS_ID,
  ]);
  for (let i = 0; i < order.length; i++) {
    const sid = order[i];
    const bandFull = bandClass(sid);
    const bandShort = bandFull.replace(/^band-/, "");

    if (gapBefore.has(sid)) {
      bodyRows.push(
        <tr key={`gap-before-${sid}`} className="wbw-gap-row" aria-hidden>
          <td className="sticky c0 wbw-gap-gutter" />
          {model.weekDates.map((_, w) => (
            <td key={`gap-${sid}-${w}`} colSpan={COLS_WEEK} className="wbw-gap-cell" />
          ))}
        </tr>,
      );
    }

    if (sid === ULTRA_ID) {
      bodyRows.push(
        <tr key={sid} className={`row ultra ${bandFull}`}>
          <td className="sticky c0 name">{sid}</td>
          {model.weekDates.map((_, w) => (
            <td key={w} colSpan={COLS_WEEK} className="trip">
              <div className={`wbw-card wbw-card--ultra`}>
                <textarea
                  value={model.ultra[w] ?? ""}
                  onChange={(e) => setUltra(w, e.target.value)}
                  rows={3}
                  className="ultra-ta"
                  readOnly={!isEditMode}
                />
              </div>
            </td>
          ))}
        </tr>,
      );
      const next = order[i + 1];
      if (next && next !== PILOT_TOTALS_ID) {
        bodyRows.push(
          <tr key={`conn-${sid}-${next}`} className="wbw-conn">
            <td className="sticky c0 conn-gutter" aria-hidden />
            {model.weekDates.map((_, w) => (
              <td key={w} colSpan={COLS_WEEK} className="wbw-conn-cell">
                <FlowConn upperId={sid} lowerId={next} week={w} model={model} />
              </td>
            ))}
          </tr>,
        );
      }
      continue;
    }

    if (sid === PILOT_TOTALS_ID) {
      bodyRows.push(
        <tr key={sid} className={`row pt ${bandFull}`}>
          <td className="sticky c0 name">{sid}</td>
          {model.weekDates.map((_, w) => (
            <td key={w} className="trip" colSpan={COLS_WEEK}>
              <WeekCell
                sid={sid}
                week={w}
                readOnly
                isDc={false}
                band={bandShort}
                mirroredIn={false}
                forcedZeroOut={false}
                freeInStream={false}
                sheetMode={sheetMode}
                model={model}
                setCell={setCell}
              />
            </td>
          ))}
        </tr>,
      );
      bodyRows.push(
        <tr key="Total Robots" className="row pt">
          <td className="sticky c0 name">Total Robots</td>
          {model.weekDates.map((_, w) => {
            const total =
              (model.cells[DC_ROBOTS_ID]?.[w]?.end ?? 0) +
              (model.cells["Customer Robots"]?.[w]?.end ?? 0) +
              (model.cells[NON_PILOT_ROBOTS_ID]?.[w]?.end ?? 0) +
              (model.cells["Training Robots"]?.[w]?.end ?? 0);
            return (
              <td key={`total-robots-${w}`} className="trip" colSpan={COLS_WEEK}>
                <div className="wbw-card wbw-card--pt">
                  <div className="wbw-card-end">{total}</div>
                  <div className="inputs inputs-std">
                    <span className="wbw-out-na">—</span>
                    <span className="wbw-out-na">—</span>
                    <span className="wbw-out-na">—</span>
                    <input type="text" disabled value={String(total)} aria-label={`Total Robots week ${w + 1}`} />
                  </div>
                  <div className="wbw-card-bar" aria-hidden>
                    <span style={{ width: "100%" }} />
                  </div>
                </div>
              </td>
            );
          })}
        </tr>,
      );
      bodyRows.push(
        <tr key={TOTAL_USABLE_DATA_ID} className="row pt">
          <td className="sticky c0 name">{TOTAL_USABLE_DATA_ID}</td>
          {model.weekDates.map((_, w) => {
            const v = usableCollectedForWeek(w).toFixed(2);
            return (
              <td key={`usable-${w}`} className="trip" colSpan={COLS_WEEK}>
                <div className="wbw-card wbw-card--pt wbw-card--usable">
                  <div className="wbw-card-end">{v}</div>
                  <div className="inputs inputs-std">
                    <span className="wbw-out-na">—</span>
                    <span className="wbw-out-na">—</span>
                    <span className="wbw-out-na">—</span>
                    <input type="text" disabled value={v} aria-label={`${TOTAL_USABLE_DATA_ID} week ${w + 1}`} />
                  </div>
                  <div className="wbw-card-bar" aria-hidden>
                    <span style={{ width: "100%" }} />
                  </div>
                </div>
              </td>
            );
          })}
        </tr>,
      );
      continue;
    }

    const isDc = sid === DC_ROBOTS_ID;
    const mirroredIn = isMirroredInStream(sid);
    const forcedZeroOut = isForcedZeroOutStream(sid);
    const freeInStream = isFreeInStream(sid);
    bodyRows.push(
      <tr key={sid} className={`row ${bandFull}`}>
        <td className="sticky c0 name">{sid}</td>
        {model.weekDates.map((_, w) => (
          <td key={w} className="trip" colSpan={COLS_WEEK}>
            <WeekCell
              sid={sid}
              week={w}
              readOnly={!isEditMode}
              isDc={isDc}
              band={bandShort}
              mirroredIn={mirroredIn}
              forcedZeroOut={forcedZeroOut}
              freeInStream={freeInStream}
              sheetMode={sheetMode}
              model={model}
              setCell={setCell}
            />
          </td>
        ))}
      </tr>,
    );

    const next = order[i + 1];
    if (next && next !== PILOT_TOTALS_ID) {
      bodyRows.push(
        <tr key={`conn-${sid}-${next}`} className="wbw-conn">
          <td className="sticky c0 conn-gutter" aria-hidden />
          {model.weekDates.map((_, w) => (
            <td key={w} colSpan={COLS_WEEK} className="wbw-conn-cell">
              <FlowConn upperId={sid} lowerId={next} week={w} model={model} />
            </td>
          ))}
        </tr>,
      );
    }
  }

  return (
    <div className="wbw-app">
      <header className="hdr">
        <h1 className="wbw-title">
          Week-by-week flow{" "}
          <span className="wbw-legend">
            — blue: new ins (↓) · red: transfers (out→in)
          </span>
        </h1>
        <p className="wbw-friday">Completed by this Friday</p>
        <p className="sub">
          <code>end = previous end − out + in</code>. Use <strong>In / out</strong> to edit flows (end is
          computed) or <strong>End</strong> to set ends (in is derived on rows with blue arrows; switching
          to In / out clears end pins). Red-arrow pairs stay linked. Pilot Totals sum pilot streams. Ultra =
          notes only.
        </p>
        <div className="toolbar">
          <div className="wbw-mode-toggle" role="group" aria-label="What to edit">
            <button
              type="button"
              className={sheetMode === "flow" ? "btn pri" : "btn sec"}
              onClick={() => setSheetModeSafe("flow")}
              title="Edit in and out; end follows the balance"
              disabled={!isEditMode}
            >
              In / out
            </button>
            <button
              type="button"
              className={sheetMode === "end" ? "btn pri" : "btn sec"}
              onClick={() => setSheetModeSafe("end")}
              title="Edit end counts; pins that week and derives in from out where applicable"
              disabled={!isEditMode}
            >
              End
            </button>
          </div>
          {isEditMode && (
            <>
              <label className="btn sec">
                Load .xlsx
                <input type="file" accept=".xlsx" hidden onChange={onFile} />
              </label>
              <button type="button" className="btn sec" onClick={addWeek}>
                Add week
              </button>
              <button
                type="button"
                className="btn sec"
                disabled={!canTrimWeek}
                onClick={() => trimWeeks("first")}
                title="Remove the earliest week column"
              >
                Remove first week
              </button>
              <button
                type="button"
                className="btn sec"
                disabled={!canTrimWeek}
                onClick={() => trimWeeks("last")}
                title="Remove the latest week column"
              >
                Remove last week
              </button>
            </>
          )}
        </div>
        <div className="wbw-globals">
          <label>
            Days in work week
            <select
              value={settings.days_in_week}
              disabled={!isEditMode}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  days_in_week: Number(e.target.value) as 5 | 6 | 7,
                }))
              }
            >
              <option value={5}>5</option>
              <option value={6}>6</option>
              <option value={7}>7</option>
            </select>
          </label>
          <label>
            % data usable
            <input
              type="number"
              min={0}
              max={100}
              disabled={!isEditMode}
              value={settings.percent_usable}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  percent_usable: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                }))
              }
            />
          </label>
          <label>
            Uptime %
            <input
              type="number"
              min={0}
              max={100}
              disabled={!isEditMode}
              value={settings.uptime_percent}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  uptime_percent: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                }))
              }
            />
          </label>
          <label>
            Shift 1 hours
            <input
              type="number"
              min={0}
              step="0.25"
              disabled={!isEditMode}
              value={settings.hours_shift_1}
              onChange={(e) => setHours("hours_shift_1", Number(e.target.value) || 0)}
            />
          </label>
          <label>
            Shift 2 hours
            <input
              type="number"
              min={0}
              step="0.25"
              disabled={!isEditMode}
              value={settings.hours_shift_2}
              onChange={(e) => setHours("hours_shift_2", Number(e.target.value) || 0)}
            />
          </label>
          <label>
            Shift 3 hours
            <input
              type="number"
              min={0}
              step="0.25"
              disabled={!isEditMode}
              value={settings.hours_shift_3}
              onChange={(e) => setHours("hours_shift_3", Number(e.target.value) || 0)}
            />
          </label>
        </div>
        {settingsWarning ? <div className="wbw-warnings">{settingsWarning}</div> : null}
        {warnings.length > 0 ? (
          <div className="wbw-warnings" role="alert">
            {warnings.slice(0, 8).map((w, i) => (
              <div key={`${w.streamId}-${w.week}-${w.field}-${i}`}>
                {w.streamId} week {w.week + 1}: {w.message}
              </div>
            ))}
          </div>
        ) : null}
        {persistError ? <div className="wbw-warnings">Save failed: {persistError}</div> : null}
      </header>

      <div className="wbw-figure">
        <div className="wrap">
          <table className="grid">
            <thead>
              <tr>
                <th className="sticky c0 th-stream">Stream</th>
                {model.weekDates.map((iso, w) => (
                  <th key={iso + w} colSpan={COLS_WEEK} className="week">
                    <div className="wd">{fmtDate(iso)}</div>
                    <div className="ioe">
                      <span>in</span>
                      <span>out</span>
                      <span>2nd</span>
                      <span>end</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{bodyRows}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

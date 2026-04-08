import * as XLSX from "xlsx";
import { applyForcedZeroOutForWeek, syncDownstreamInForWeek } from "./flowGraph";
import type { FlowCell, GridModel, StreamId } from "./types";
import { DC_ROBOTS_ID, PILOT_TOTALS_ID, ULTRA_ID, emptyCell } from "./types";

function norm(s: unknown): string {
  return String(s ?? "").trim();
}

function parseFlowCellForStream(streamName: string, raw: unknown): FlowCell | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s.toUpperCase() === "NA") return null;
  const mi = /in\s*:\s*(\d+)/i.exec(s);
  const me = /(?:end|actual|total)\s*:\s*(\d+)/i.exec(s);
  if (!mi || !me) return null;
  const mo = /out\s*:\s*(\d+)/i.exec(s);
  const moCust = /out\s*cust(?:omer)?\s*:\s*(\d+)/i.exec(s);
  const moNp = /out\s*(?:np|non[-\s]?pilot)\s*:\s*(\d+)/i.exec(s);
  const isDc = norm(streamName).toLowerCase() === norm(DC_ROBOTS_ID).toLowerCase();
  if (isDc && (moCust || moNp)) {
    return {
      in: Number(mi[1]),
      out: 0,
      end: Number(me[1]),
      outCustomer: moCust ? Number(moCust[1]) : 0,
      outNonPilot: moNp ? Number(moNp[1]) : 0,
    };
  }
  if (!mo) return null;
  const base = { in: Number(mi[1]), out: Number(mo[1]), end: Number(me[1]) };
  if (isDc) {
    return { ...base, outCustomer: 0, outNonPilot: 0 };
  }
  return base;
}

function excelDateToIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function inferDateCol(ws: XLSX.WorkSheet, maxR: number, maxC: number): number {
  const lim = Math.min(maxR, 25);
  for (let r = 1; r < lim; r++) {
    for (let c = 0; c < maxC; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const v = ws[addr]?.v;
      if (excelDateToIso(v)) return c;
    }
  }
  return 0;
}

const CANON_ORDER: StreamId[] = [
  "DC Robots",
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
];

function findStreamKey(cells: Record<string, FlowCell[]>, want: string): string | null {
  const w = want.trim().toLowerCase();
  for (const k of Object.keys(cells)) {
    if (k === PILOT_TOTALS_ID) continue;
    if (k.trim().toLowerCase() === w) return k;
  }
  return null;
}

export function parseWorkbookToGrid(buf: ArrayBuffer): GridModel {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const maxR = range.e.r + 1;
  const maxC = range.e.c + 1;
  const dateCol = inferDateCol(ws, maxR, maxC);

  const headerByCol = new Map<number, string>();
  for (let c = 0; c < maxC; c++) {
    if (c === dateCol) continue;
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const h = norm(ws[addr]?.v);
    if (h) headerByCol.set(c, h);
  }

  const weekDates: string[] = [];
  const dataRows: number[] = [];
  for (let r = 1; r < maxR; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: dateCol });
    const iso = excelDateToIso(ws[addr]?.v);
    if (!iso) continue;
    weekDates.push(iso);
    dataRows.push(r);
  }

  const n = weekDates.length;
  const ultra: string[] = Array(n).fill("");
  const cells: Record<StreamId, FlowCell[]> = {};

  for (const [c, name] of headerByCol) {
    if (norm(name).toLowerCase() === ULTRA_ID.toLowerCase()) {
      for (let wi = 0; wi < n; wi++) {
        const addr = XLSX.utils.encode_cell({ r: dataRows[wi], c });
        const raw = ws[addr]?.v;
        if (raw != null && String(raw).trim() && String(raw).trim().toUpperCase() !== "NA") {
          ultra[wi] = String(raw).trim();
        }
      }
      continue;
    }
    const col: FlowCell[] = [];
    for (let wi = 0; wi < n; wi++) {
      const addr = XLSX.utils.encode_cell({ r: dataRows[wi], c });
      const p = parseFlowCellForStream(name, ws[addr]?.v);
      col.push(p ?? emptyCell(name as StreamId));
    }
    cells[name as StreamId] = col;
  }

  const streamOrder: StreamId[] = [ULTRA_ID];
  for (const id of CANON_ORDER) {
    const k = findStreamKey(cells, id);
    if (k) streamOrder.push(k);
  }
  for (const id of Object.keys(cells)) {
    if (streamOrder.includes(id)) continue;
    if (id === ULTRA_ID) continue;
    streamOrder.push(id);
  }
  streamOrder.push(PILOT_TOTALS_ID);

  const customerKey = findStreamKey(cells, "Customer Robots");
  const nonPilotKey = findStreamKey(cells, "Non Pilot Robots");

  for (const key of Object.keys(cells)) {
    if (norm(key).toLowerCase() !== norm(DC_ROBOTS_ID).toLowerCase()) continue;
    const col = cells[key];
    for (let w = 0; w < col.length; w++) {
      const c = col[w];
      const oc = c.outCustomer ?? 0;
      const onp = c.outNonPilot ?? 0;
      if (oc === 0 && onp === 0) {
        const fromCustomerIn = customerKey ? (cells[customerKey]?.[w]?.in ?? 0) : 0;
        const fromNonPilotIn = nonPilotKey ? (cells[nonPilotKey]?.[w]?.in ?? 0) : 0;
        if (fromCustomerIn > 0 || fromNonPilotIn > 0) {
          col[w] = {
            ...c,
            out: 0,
            outCustomer: fromCustomerIn,
            outNonPilot: fromNonPilotIn,
          };
          continue;
        }
      }
      if (c.out > 0 && oc === 0 && onp === 0) {
        col[w] = { ...c, out: 0, outCustomer: c.out, outNonPilot: 0 };
      }
    }
  }

  for (let w = 0; w < n; w++) {
    syncDownstreamInForWeek(cells, w);
    applyForcedZeroOutForWeek(cells, w);
  }

  cells[PILOT_TOTALS_ID] = Array.from({ length: n }, () => ({ in: 0, out: 0, end: 0 }));

  return {
    weekDates,
    streamOrder,
    cells,
    ultra,
  };
}

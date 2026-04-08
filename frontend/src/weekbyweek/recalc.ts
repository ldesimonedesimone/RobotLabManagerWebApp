import {
  COMPUTE_ORDER,
  applyForcedZeroOutForWeek,
  nonComputeStreams,
  syncDownstreamInForWeek,
  CUSTOMER_SHIFT_1,
  DC_SHIFT_1,
  DC_SHIFT_2,
  DC_SHIFT_3,
  NON_PILOT_ROBOTS_ID,
  TRAINING_ROBOTS_ID,
  TRAINING_SHIFT_1,
  TRAINING_SHIFT_2,
  TRAINING_SHIFT_3,
} from "./flowGraph";
import type { FlowCell, GridModel, StreamId } from "./types";
import { DC_ROBOTS_ID, PILOT_TOTALS_ID, ULTRA_ID, effectiveOut } from "./types";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function isRobot(name: string): boolean {
  return norm(name).includes("robot");
}

export function pilotStreamIds(model: GridModel): StreamId[] {
  return model.streamOrder.filter(
    (id) =>
      id !== PILOT_TOTALS_ID &&
      id !== ULTRA_ID &&
      !isRobot(id) &&
      model.cells[id] != null,
  );
}

export function sumPilotEnds(model: GridModel, w: number): FlowCell {
  let inn = 0;
  let out = 0;
  let end = 0;
  for (const id of pilotStreamIds(model)) {
    const c = model.cells[id][w];
    inn += c.in;
    out += c.out;
    end += c.end;
  }
  return { in: inn, out, end };
}

export type PinEndSet = Set<string>;
export type RecalcMode = "flow" | "end";
export type RecalcWarning = {
  week: number;
  streamId: StreamId;
  field: "in" | "out" | "outCustomer" | "outNonPilot";
  requested: number;
  applied: number;
  message: string;
};

export function pinKey(stream: StreamId, week: number): string {
  return `${stream}|${week}`;
}

function balanceOne(
  streamId: StreamId,
  cell: FlowCell,
  endPrev: number,
  pinned: boolean,
  week: number,
  warnings: RecalcWarning[],
): FlowCell {
  const outEff = effectiveOut(streamId, cell);
  let inn = cell.in;
  let end = cell.end;
  if (pinned) {
    end = cell.end;
    const req = end - endPrev + outEff;
    inn = req < 0 ? 0 : req;
    if (req < 0) {
      warnings.push({
        week,
        streamId,
        field: "in",
        requested: req,
        applied: 0,
        message: "Derived in was negative and was clamped to 0.",
      });
    }
  } else {
    end = Math.max(0, endPrev - outEff + inn);
  }
  if (streamId === DC_ROBOTS_ID) {
    return {
      ...cell,
      in: inn,
      out: cell.out,
      end,
      outCustomer: cell.outCustomer ?? 0,
      outNonPilot: cell.outNonPilot ?? 0,
    };
  }
  return { ...cell, in: inn, out: cell.out, end };
}

export function applyForward(model: GridModel, pinEnd: PinEndSet): GridModel {
  return applyForwardDetailed(model, pinEnd, "flow").model;
}

function computeOpeningByStream(model: GridModel): Record<StreamId, number> {
  const out: Record<StreamId, number> = {};
  for (const id of model.streamOrder) {
    if (id === ULTRA_ID || id === PILOT_TOTALS_ID) continue;
    const first = model.cells[id]?.[0];
    if (!first) {
      out[id] = 0;
      continue;
    }
    out[id] = Math.max(0, first.end - first.in + effectiveOut(id, first));
  }
  return out;
}

function prevEnd(
  cells: Record<StreamId, FlowCell[]>,
  openingByStream: Record<StreamId, number>,
  id: StreamId,
  week: number,
): number {
  if (week === 0) return openingByStream[id] ?? 0;
  return cells[id]?.[week - 1]?.end ?? 0;
}

function clampWarn(
  value: number,
  week: number,
  streamId: StreamId,
  field: RecalcWarning["field"],
  warnings: RecalcWarning[],
): number {
  if (value >= 0) return value;
  warnings.push({
    week,
    streamId,
    field,
    requested: value,
    applied: 0,
    message: `Derived ${field} was negative and was clamped to 0.`,
  });
  return 0;
}

function copyCells(model: GridModel): Record<StreamId, FlowCell[]> {
  const out: Record<StreamId, FlowCell[]> = {};
  for (const id of model.streamOrder) {
    if (id === PILOT_TOTALS_ID || id === ULTRA_ID) continue;
    const col = model.cells[id];
    if (!col) continue;
    out[id] = col.map((c) => ({ ...c }));
  }
  return out;
}

function solveFlowMode(
  model: GridModel,
  outCells: Record<StreamId, FlowCell[]>,
  openingByStream: Record<StreamId, number>,
  pinEnd: PinEndSet,
  warnings: RecalcWarning[],
): void {
  const n = model.weekDates.length;
  const extra = nonComputeStreams(model.streamOrder);

  for (let w = 0; w < n; w++) {
    for (let iter = 0; iter < 16; iter++) {
      syncDownstreamInForWeek(outCells, w);
      applyForcedZeroOutForWeek(outCells, w);

      let changed = false;
      for (const id of COMPUTE_ORDER) {
        const col = outCells[id];
        if (!col?.[w]) continue;
        const endPrev = prevEnd(outCells, openingByStream, id, w);
        const pinned = pinEnd.has(pinKey(id, w));
        const before = col[w];
        col[w] = balanceOne(id, col[w], endPrev, pinned, w, warnings);
        if (
          before.in !== col[w].in ||
          before.out !== col[w].out ||
          before.end !== col[w].end ||
          before.outCustomer !== col[w].outCustomer ||
          before.outNonPilot !== col[w].outNonPilot
        ) {
          changed = true;
        }
      }
      for (const id of extra) {
        const col = outCells[id];
        if (!col?.[w]) continue;
        const endPrev = prevEnd(outCells, openingByStream, id, w);
        const pinned = pinEnd.has(pinKey(id, w));
        const before = col[w];
        col[w] = balanceOne(id, col[w], endPrev, pinned, w, warnings);
        if (
          before.in !== col[w].in ||
          before.out !== col[w].out ||
          before.end !== col[w].end ||
          before.outCustomer !== col[w].outCustomer ||
          before.outNonPilot !== col[w].outNonPilot
        ) {
          changed = true;
        }
      }
      if (!changed) break;
    }
    syncDownstreamInForWeek(outCells, w);
    applyForcedZeroOutForWeek(outCells, w);
  }
}

function deriveRequiredIn(
  outCells: Record<StreamId, FlowCell[]>,
  openingByStream: Record<StreamId, number>,
  id: StreamId,
  week: number,
  warnings: RecalcWarning[],
): number {
  const c = outCells[id]?.[week];
  if (!c) return 0;
  const endPrev = prevEnd(outCells, openingByStream, id, week);
  const required = c.end - endPrev + effectiveOut(id, c);
  return clampWarn(required, week, id, "in", warnings);
}

function solveEndMode(
  model: GridModel,
  outCells: Record<StreamId, FlowCell[]>,
  openingByStream: Record<StreamId, number>,
  warnings: RecalcWarning[],
): void {
  const n = model.weekDates.length;
  const extra = nonComputeStreams(model.streamOrder);
  const setOut = (id: StreamId, week: number, v: number): void => {
    const col = outCells[id];
    if (!col?.[week]) return;
    col[week] = { ...col[week], out: clampWarn(v, week, id, "out", warnings) };
  };

  for (let w = 0; w < n; w++) {
    syncDownstreamInForWeek(outCells, w);
    applyForcedZeroOutForWeek(outCells, w);

    const cs1In = deriveRequiredIn(outCells, openingByStream, CUSTOMER_SHIFT_1, w, warnings);
    if (outCells[CUSTOMER_SHIFT_1]?.[w]) outCells[CUSTOMER_SHIFT_1][w] = { ...outCells[CUSTOMER_SHIFT_1][w], in: cs1In };
    setOut(DC_SHIFT_1, w, cs1In);

    const dc1In = deriveRequiredIn(outCells, openingByStream, DC_SHIFT_1, w, warnings);
    if (outCells[DC_SHIFT_1]?.[w]) outCells[DC_SHIFT_1][w] = { ...outCells[DC_SHIFT_1][w], in: dc1In };
    setOut(TRAINING_SHIFT_1, w, dc1In);

    const t1In = deriveRequiredIn(outCells, openingByStream, TRAINING_SHIFT_1, w, warnings);
    if (outCells[TRAINING_SHIFT_1]?.[w]) outCells[TRAINING_SHIFT_1][w] = { ...outCells[TRAINING_SHIFT_1][w], in: t1In };

    const dc2In = deriveRequiredIn(outCells, openingByStream, DC_SHIFT_2, w, warnings);
    if (outCells[DC_SHIFT_2]?.[w]) outCells[DC_SHIFT_2][w] = { ...outCells[DC_SHIFT_2][w], in: dc2In };
    setOut(TRAINING_SHIFT_2, w, dc2In);
    const t2In = deriveRequiredIn(outCells, openingByStream, TRAINING_SHIFT_2, w, warnings);
    if (outCells[TRAINING_SHIFT_2]?.[w]) outCells[TRAINING_SHIFT_2][w] = { ...outCells[TRAINING_SHIFT_2][w], in: t2In };

    const dc3In = deriveRequiredIn(outCells, openingByStream, DC_SHIFT_3, w, warnings);
    if (outCells[DC_SHIFT_3]?.[w]) outCells[DC_SHIFT_3][w] = { ...outCells[DC_SHIFT_3][w], in: dc3In };
    setOut(TRAINING_SHIFT_3, w, dc3In);
    const t3In = deriveRequiredIn(outCells, openingByStream, TRAINING_SHIFT_3, w, warnings);
    if (outCells[TRAINING_SHIFT_3]?.[w]) outCells[TRAINING_SHIFT_3][w] = { ...outCells[TRAINING_SHIFT_3][w], in: t3In };

    const crIn = deriveRequiredIn(outCells, openingByStream, "Customer Robots", w, warnings);
    const npIn = deriveRequiredIn(outCells, openingByStream, NON_PILOT_ROBOTS_ID, w, warnings);
    if (outCells["Customer Robots"]?.[w]) outCells["Customer Robots"][w] = { ...outCells["Customer Robots"][w], in: crIn };
    if (outCells[NON_PILOT_ROBOTS_ID]?.[w]) outCells[NON_PILOT_ROBOTS_ID][w] = { ...outCells[NON_PILOT_ROBOTS_ID][w], in: npIn };
    if (outCells[DC_ROBOTS_ID]?.[w]) {
      outCells[DC_ROBOTS_ID][w] = {
        ...outCells[DC_ROBOTS_ID][w],
        out: 0,
        outCustomer: clampWarn(crIn, w, DC_ROBOTS_ID, "outCustomer", warnings),
        outNonPilot: clampWarn(npIn, w, DC_ROBOTS_ID, "outNonPilot", warnings),
      };
    }
    const dcRobotIn = deriveRequiredIn(outCells, openingByStream, DC_ROBOTS_ID, w, warnings);
    if (outCells[DC_ROBOTS_ID]?.[w]) outCells[DC_ROBOTS_ID][w] = { ...outCells[DC_ROBOTS_ID][w], in: dcRobotIn };

    const trainingRobotIn = deriveRequiredIn(outCells, openingByStream, TRAINING_ROBOTS_ID, w, warnings);
    if (outCells[TRAINING_ROBOTS_ID]?.[w]) {
      outCells[TRAINING_ROBOTS_ID][w] = { ...outCells[TRAINING_ROBOTS_ID][w], in: trainingRobotIn };
    }

    for (const id of extra) {
      if (!outCells[id]?.[w]) continue;
      const req = deriveRequiredIn(outCells, openingByStream, id, w, warnings);
      outCells[id][w] = { ...outCells[id][w], in: req };
    }

    syncDownstreamInForWeek(outCells, w);
    applyForcedZeroOutForWeek(outCells, w);
  }
}

export function applyForwardDetailed(
  model: GridModel,
  pinEnd: PinEndSet,
  mode: RecalcMode = "flow",
): { model: GridModel; warnings: RecalcWarning[] } {
  const outCells = copyCells(model);
  const warnings: RecalcWarning[] = [];
  const openingByStream = computeOpeningByStream(model);

  if (mode === "end") {
    solveEndMode(model, outCells, openingByStream, warnings);
  } else {
    solveFlowMode(model, outCells, openingByStream, pinEnd, warnings);
  }

  const merged: GridModel = { ...model, cells: outCells };
  const pilot: FlowCell[] = [];
  for (let w = 0; w < model.weekDates.length; w++) {
    pilot.push(sumPilotEnds(merged, w));
  }
  outCells[PILOT_TOTALS_ID] = pilot;

  return {
    model: {
      weekDates: [...model.weekDates],
      streamOrder: [...model.streamOrder],
      cells: outCells,
      ultra: [...model.ultra],
    },
    warnings,
  };
}

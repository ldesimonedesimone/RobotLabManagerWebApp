import type { FlowCell, StreamId } from "./types";
import {
  CUSTOMER_ROBOTS_ID,
  DC_ROBOTS_ID,
  PILOT_TOTALS_ID,
  ULTRA_ID,
  emptyCell,
} from "./types";

export const TRAINING_SHIFT_1 = "Training Shift 1";
export const DC_SHIFT_1 = "DC Shift 1";
export const CUSTOMER_SHIFT_1 = "Customer Shift 1";
export const TRAINING_SHIFT_2 = "Training Shift 2";
export const DC_SHIFT_2 = "DC Shift 2";
export const TRAINING_SHIFT_3 = "Training Shift 3";
export const DC_SHIFT_3 = "DC Shift 3";
export const NON_PILOT_ROBOTS_ID = "Non Pilot Robots";
export const TRAINING_ROBOTS_ID = "Training Robots";

export const COMPUTE_ORDER: StreamId[] = [
  TRAINING_SHIFT_1,
  DC_SHIFT_1,
  CUSTOMER_SHIFT_1,
  TRAINING_SHIFT_2,
  DC_SHIFT_2,
  TRAINING_SHIFT_3,
  DC_SHIFT_3,
  DC_ROBOTS_ID,
  CUSTOMER_ROBOTS_ID,
  NON_PILOT_ROBOTS_ID,
  TRAINING_ROBOTS_ID,
];

export const FREE_IN_STREAM_IDS = new Set<StreamId>([
  TRAINING_SHIFT_1,
  TRAINING_SHIFT_2,
  TRAINING_SHIFT_3,
  DC_ROBOTS_ID,
  TRAINING_ROBOTS_ID,
]);

export const MIRRORED_IN_STREAM_IDS = new Set<StreamId>([
  DC_SHIFT_1,
  CUSTOMER_SHIFT_1,
  DC_SHIFT_2,
  DC_SHIFT_3,
  CUSTOMER_ROBOTS_ID,
  NON_PILOT_ROBOTS_ID,
]);

export const FORCED_ZERO_OUT_STREAM_IDS = new Set<StreamId>([
  CUSTOMER_SHIFT_1,
  DC_SHIFT_2,
  DC_SHIFT_3,
]);

export function isFreeInStream(id: StreamId): boolean {
  return FREE_IN_STREAM_IDS.has(id);
}

export function isMirroredInStream(id: StreamId): boolean {
  return MIRRORED_IN_STREAM_IDS.has(id);
}

export function isForcedZeroOutStream(id: StreamId): boolean {
  return FORCED_ZERO_OUT_STREAM_IDS.has(id);
}

function cellAt(
  cells: Record<StreamId, FlowCell[]>,
  id: StreamId,
  w: number,
): FlowCell {
  return cells[id]?.[w] ?? emptyCell(id);
}

export function syncDownstreamInForWeek(
  cells: Record<StreamId, FlowCell[]>,
  w: number,
): void {
  const t1 = cellAt(cells, TRAINING_SHIFT_1, w);
  const t2 = cellAt(cells, TRAINING_SHIFT_2, w);
  const t3 = cellAt(cells, TRAINING_SHIFT_3, w);
  const dc = cellAt(cells, DC_ROBOTS_ID, w);
  const cr = cellAt(cells, CUSTOMER_ROBOTS_ID, w);
  const np = cellAt(cells, NON_PILOT_ROBOTS_ID, w);

  if (cells[DC_SHIFT_1]?.[w]) {
    cells[DC_SHIFT_1][w] = { ...cellAt(cells, DC_SHIFT_1, w), in: t1.out };
  }
  const d1After = cellAt(cells, DC_SHIFT_1, w);
  if (cells[CUSTOMER_SHIFT_1]?.[w]) {
    cells[CUSTOMER_SHIFT_1][w] = {
      ...cellAt(cells, CUSTOMER_SHIFT_1, w),
      in: d1After.out,
    };
  }
  if (cells[DC_SHIFT_2]?.[w]) {
    cells[DC_SHIFT_2][w] = { ...cellAt(cells, DC_SHIFT_2, w), in: t2.out };
  }
  if (cells[DC_SHIFT_3]?.[w]) {
    cells[DC_SHIFT_3][w] = { ...cellAt(cells, DC_SHIFT_3, w), in: t3.out };
  }
  if (cells[CUSTOMER_ROBOTS_ID]?.[w]) {
    cells[CUSTOMER_ROBOTS_ID][w] = {
      ...cr,
      in: dc.outCustomer ?? 0,
    };
  }
  if (cells[NON_PILOT_ROBOTS_ID]?.[w]) {
    cells[NON_PILOT_ROBOTS_ID][w] = {
      ...np,
      in: dc.outNonPilot ?? 0,
    };
  }
}

export function applyForcedZeroOutForWeek(
  cells: Record<StreamId, FlowCell[]>,
  w: number,
): void {
  for (const id of FORCED_ZERO_OUT_STREAM_IDS) {
    const col = cells[id];
    if (!col?.[w]) continue;
    col[w] = { ...col[w], out: 0 };
  }
}

export function nonComputeStreams(streamOrder: StreamId[]): StreamId[] {
  return streamOrder.filter(
    (id) =>
      id !== PILOT_TOTALS_ID &&
      id !== ULTRA_ID &&
      !COMPUTE_ORDER.includes(id),
  );
}

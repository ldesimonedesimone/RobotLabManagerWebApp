export type FlowCell = {
  in: number;
  out: number;
  end: number;
  /** DC Robots only: out toward Customer Robots */
  outCustomer?: number;
  /** DC Robots only: out toward Non-Pilot Robots */
  outNonPilot?: number;
};

export type StreamId = string;

export type GridModel = {
  weekDates: string[];
  streamOrder: StreamId[];
  cells: Record<StreamId, FlowCell[]>;
  ultra: string[];
};

export const PILOT_TOTALS_ID = "Pilot Totals";
export const ULTRA_ID = "Ultra Tasks";
export const DC_ROBOTS_ID = "DC Robots";
export const CUSTOMER_ROBOTS_ID = "Customer Robots";

export function emptyCell(streamId: string): FlowCell {
  if (streamId === DC_ROBOTS_ID) {
    return { in: 0, out: 0, end: 0, outCustomer: 0, outNonPilot: 0 };
  }
  return { in: 0, out: 0, end: 0 };
}

export function effectiveOut(streamId: string, c: FlowCell): number {
  if (streamId === DC_ROBOTS_ID) {
    const oc = c.outCustomer ?? 0;
    const onp = c.outNonPilot ?? 0;
    if (oc === 0 && onp === 0 && c.out > 0) return c.out;
    return oc + onp;
  }
  return c.out;
}

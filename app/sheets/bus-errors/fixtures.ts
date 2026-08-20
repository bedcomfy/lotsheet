import {
  createBlankBusErrors,
  type BusErrorsData,
} from "./schema";

const typical = createBlankBusErrors();
typical.rows[0] = {
  bus: "6427",
  fuel: "12.4",
  oil: "OK",
  description: "Computer read bus 6421",
  servicer: "CR",
};

const stress = createBlankBusErrors();
stress.rows[0] = {
  bus: "25540",
  fuel: "999.99",
  oil: "ADD",
  description:
    "SYSTEM WILL NOT ACCEPT BUS NUMBER; COMPUTER DISPLAYED A DIFFERENT VEHICLE NUMBER",
  servicer: "LONG",
};

export const busErrorsFixtures: Record<
  "blank" | "typical" | "stress",
  BusErrorsData
> = {
  blank: createBlankBusErrors(),
  typical,
  stress,
};

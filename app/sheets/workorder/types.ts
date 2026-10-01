export interface WOEmployee {
  id: string;
  badge: string;
  name: string;
}

export interface WOOperation {
  id: string;
  num: string;
  objectCode: string;
  description: string;
  date: string;
  hours: string;
  activity: string;
  assignedTo: string[];
}

export interface WOPart {
  id: string;
  partNo: string;
  description: string;
  qty: string;
  serial: string;
  locator: string;
  operationNum: string;
  issuedBy: string;
}

export interface WorkOrder {
  workOrderNumber: string;
  vehicleNumber: string;
  todaysDate: string;
  workOrderDescription: string;
  vehicleDescription: string;
  vehicleOdometer: string;
  workOrderCreationDate: string;
  createdBy: string;
  employees: WOEmployee[];
  operations: WOOperation[];
  parts: Record<string, WOPart[]>;
}

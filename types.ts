
export interface CapexParams {
  vehicleCost: number;
  downPaymentPercent: number;
  interestRate: number;
  tenureMonths: number;
  residualValue: number;
  numVehicles: number;
}

export interface OpexFixedParams {
  driverBaseSalary: number;
  dailyBhatta: number;
  tripIncentive: number;
  helperSalary: number;
  hasHelper: boolean;
  annualInsurance: number;
  roadTaxType: 'State' | 'National';
  annualRoadTax: number;
  annualFitnessExp: number;
  monthlyAdminOverhead: number; // For RTO/FC/Admin
  managementOverheadPerVehicle: number; // Hidden costs of managing fleet
}

export interface OpexVariableParams {
  dieselPrice: number;
  mileageKml: number;
  idlingHoursPerTrip: number;
  idlingFuelRate: number; // L/hour
  adBlueCostPerKm: number;
  tireCostPerKm: number;
  maintenancePerKm: number;
  fastagPerTrip: number;
  incidentalsPerTrip: number; // RTO checks, parking, tips
}

export interface MarketBenchmarkParams {
  unitType: 'Trip' | 'Km' | 'Ton';
  unitRate: number;
  tripDistance: number;
  monthlyTrips: number;
  availabilityPercent: number; // Availability vs Outsource
}

export interface SimulationResult {
  monthlyEmi: number;
  fixedMonthlyCost: number;
  variableCostPerKm: number;
  variableCostPerTrip: number;
  totalMonthlyOwnCost: number;
  totalMonthlyMarketCost: number;
  monthlySavings: number;
  breakEvenDistance: number;
  breakEvenTrips: number;
  costPerKm: number;
  costPerTrip: number;
  fuelWeightage: number;
}

export interface TCOParams {
  capex: CapexParams;
  opexFixed: OpexFixedParams;
  opexVariable: OpexVariableParams;
  market: MarketBenchmarkParams;
}


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
  tonnage: number; // Payload assumed when unitType === 'Ton'
}

// Lifecycle / NPV / escalation assumptions (T3CO & ICCT-style rigor)
export interface FinanceParams {
  discountRatePct: number; // Annual discount rate for NPV
  holdingYears: number; // Ownership horizon
  dieselInflationPct: number; // Annual fuel price escalation
  salaryInflationPct: number; // Annual driver/staff wage escalation
}

// Electric vehicle comparison profile (eFAST / ICCT-style BET vs diesel)
export interface EvParams {
  enabled: boolean;
  vehicleCost: number;
  energyCostPerKm: number; // ₹/km electricity
  maintenancePerKm: number; // EVs are cheaper to maintain
  batteryReplacementCost: number; // One-time, mid-life
  residualValue: number;
  gridCo2PerKwh: number; // kg CO2 per kWh (grid intensity)
  kwhPerKm: number; // Energy consumption
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
  // Extended, methodology-grade outputs
  marketRatePerKm: number;
  monthlyDepreciation: number; // (cost - residual) / holding months
  backfillCost: number; // Market hire covering owned-fleet downtime
  npvOwn: number; // NPV of total ownership cost over horizon (fleet)
  npvMarket: number; // NPV of market hiring over horizon (fleet)
  npvSavings: number; // npvMarket - npvOwn
  co2TonnesPerYear: number; // Diesel fleet tailpipe CO2
  costBreakdown: CostSlice[]; // Accurate cost structure (no magic numbers)
}

export interface CostSlice {
  name: string;
  value: number; // ₹/month per vehicle
}

export interface EvResult {
  npvOwn: number;
  monthlyEnergyCost: number;
  co2TonnesPerYear: number;
  npvVsDiesel: number; // diesel NPV - EV NPV (positive = EV cheaper)
  co2SavedTonnesPerYear: number;
}

export interface SensitivityFactor {
  factor: string;
  low: number; // monthly savings when factor -swing%
  high: number; // monthly savings when factor +swing%
  base: number;
}

export interface MonteCarloResult {
  probPositive: number; // P(monthly savings > 0)
  p10: number;
  p50: number;
  p90: number;
  histogram: { bucket: number; count: number }[];
}

export interface TCOParams {
  capex: CapexParams;
  opexFixed: OpexFixedParams;
  opexVariable: OpexVariableParams;
  market: MarketBenchmarkParams;
  finance: FinanceParams;
  ev: EvParams;
}

export interface Scenario {
  id: string;
  name: string;
  params: TCOParams;
  savedAt: string;
}

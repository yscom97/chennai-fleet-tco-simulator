
import {
  TCOParams,
  SimulationResult,
  EvResult,
  SensitivityFactor,
  MonteCarloResult,
} from '../types';

const WORKING_DAYS = 26; // Standard 6-day week
const DIESEL_CO2_PER_L = 2.68; // kg CO2 per litre of diesel

const amortize = (principal: number, monthlyRate: number, n: number) => {
  if (n <= 0) return 0;
  if (monthlyRate <= 0) return principal / n;
  return (
    (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) /
    (Math.pow(1 + monthlyRate, n) - 1)
  );
};

interface MonthlyOverrides {
  dieselPrice?: number;
  mileageKml?: number;
  interestRate?: number;
  monthlyTrips?: number;
  salaryMult?: number;
  availabilityPercent?: number;
  emiOn?: boolean;
}

/** The single source of truth: monthly economics for ONE vehicle. */
const computeMonthly = (params: TCOParams, o: MonthlyOverrides = {}) => {
  const { capex, opexFixed, opexVariable, market } = params;

  const diesel = o.dieselPrice ?? opexVariable.dieselPrice;
  const mileage = o.mileageKml ?? opexVariable.mileageKml;
  const interest = o.interestRate ?? capex.interestRate;
  const trips = o.monthlyTrips ?? market.monthlyTrips;
  const salMult = o.salaryMult ?? 1;
  const avail = Math.min(Math.max((o.availabilityPercent ?? market.availabilityPercent) / 100, 0), 1);
  const emiOn = o.emiOn ?? true;

  // Financing
  const principal = capex.vehicleCost * (1 - capex.downPaymentPercent / 100);
  const emi = emiOn ? amortize(principal, interest / 100 / 12, capex.tenureMonths) : 0;

  // Availability: owned fleet runs `ownTrips`; the shortfall is back-filled
  // by market hire (downtime still has to serve the customer).
  const ownTrips = trips * avail;
  const missedTrips = trips * (1 - avail);
  const distanceOwn = market.tripDistance * ownTrips;

  // Fixed (per vehicle, per month)
  const driverCost =
    (opexFixed.driverBaseSalary + opexFixed.dailyBhatta * WORKING_DAYS) * salMult +
    opexFixed.tripIncentive * ownTrips;
  const helperCost = (opexFixed.hasHelper ? opexFixed.helperSalary : 0) * salMult;
  const insuranceTax =
    (opexFixed.annualInsurance + opexFixed.annualRoadTax + opexFixed.annualFitnessExp) / 12;
  const adminMgmt = opexFixed.monthlyAdminOverhead + opexFixed.managementOverheadPerVehicle;
  const fixed = emi + driverCost + helperCost + insuranceTax + adminMgmt;

  // Variable (per vehicle, per month)
  const fuelDrive = (diesel / mileage) * distanceOwn;
  const idlingLitres = opexVariable.idlingHoursPerTrip * opexVariable.idlingFuelRate * ownTrips;
  const fuelIdle = idlingLitres * diesel;
  const fuelMonthly = fuelDrive + fuelIdle;
  const maintTire = (opexVariable.maintenancePerKm + opexVariable.tireCostPerKm) * distanceOwn;
  const adBlue = opexVariable.adBlueCostPerKm * distanceOwn;
  const tolls = (opexVariable.fastagPerTrip + opexVariable.incidentalsPerTrip) * ownTrips;
  const variable = fuelMonthly + maintTire + adBlue + tolls;

  const marketPerTrip = marketRatePerTrip(params);
  const backfill = marketPerTrip * missedTrips;

  const totalOwn = fixed + variable + backfill;
  const totalMarket = marketPerTrip * trips;
  const savings = totalMarket - totalOwn;

  const litresMonthly = distanceOwn / mileage + idlingLitres;

  return {
    emi,
    fixed,
    variable,
    fuelMonthly,
    maintTire,
    adBlue,
    tolls,
    driverCost,
    helperCost,
    insuranceTax,
    adminMgmt,
    backfill,
    totalOwn,
    totalMarket,
    savings,
    distanceOwn,
    ownTrips,
    marketPerTrip,
    litresMonthly,
  };
};

const marketRatePerTrip = (params: TCOParams): number => {
  const { market } = params;
  if (market.unitType === 'Trip') return market.unitRate;
  if (market.unitType === 'Km') return market.unitRate * market.tripDistance;
  return market.unitRate * market.tonnage; // 'Ton'
};

export const calculateTCO = (params: TCOParams): SimulationResult => {
  const { capex, opexVariable, market, finance } = params;
  const numV = capex.numVehicles;
  const m = computeMonthly(params);

  const marketRatePerKm = m.marketPerTrip / (market.tripDistance || 1);
  const effectiveVariablePerKm = m.variable / (m.distanceOwn || 1);
  const breakEvenDistance =
    marketRatePerKm > effectiveVariablePerKm
      ? m.fixed / (marketRatePerKm - effectiveVariablePerKm)
      : Infinity;
  const breakEvenTrips = breakEvenDistance / (market.tripDistance || 1);

  const monthlyDepreciation =
    (capex.vehicleCost - capex.residualValue) / (finance.holdingYears * 12 || 1);

  const co2TonnesPerYear = (m.litresMonthly * DIESEL_CO2_PER_L * 12 * numV) / 1000;

  // --- NPV lifecycle (per fleet) -------------------------------------------
  const r = finance.discountRatePct / 100 / 12;
  const N = Math.round(finance.holdingYears * 12);
  let npvOwnStream = 0;
  let npvMarketStream = 0;
  const baseMarketMonthly = m.totalMarket * numV;
  for (let month = 1; month <= N; month++) {
    const yearsElapsed = (month - 1) / 12;
    const dieselP = opexVariable.dieselPrice * Math.pow(1 + finance.dieselInflationPct / 100, yearsElapsed);
    const salMult = Math.pow(1 + finance.salaryInflationPct / 100, yearsElapsed);
    const cm = computeMonthly(params, {
      dieselPrice: dieselP,
      salaryMult: salMult,
      emiOn: month <= capex.tenureMonths,
    });
    const disc = Math.pow(1 + r, month);
    npvOwnStream += (cm.totalOwn * numV) / disc;
    // Freight rates track fuel — escalate market by diesel inflation.
    npvMarketStream +=
      (baseMarketMonthly * Math.pow(1 + finance.dieselInflationPct / 100, yearsElapsed)) / disc;
  }
  const downpaymentUpfront = capex.vehicleCost * (capex.downPaymentPercent / 100) * numV;
  const residualPV = (capex.residualValue * numV) / Math.pow(1 + r, N);
  const npvOwn = downpaymentUpfront + npvOwnStream - residualPV;
  const npvMarket = npvMarketStream;

  // --- Accurate cost breakdown (replaces magic-number pie) -----------------
  const costBreakdown = [
    { name: 'Fuel (incl. Idling)', value: m.fuelMonthly },
    { name: 'EMI (Financing)', value: m.emi },
    { name: 'Driver & Staff', value: m.driverCost + m.helperCost },
    { name: 'Maintenance & Tyres', value: m.maintTire },
    { name: 'Tolls & Incidentals', value: m.tolls },
    { name: 'Insurance & Tax', value: m.insuranceTax },
    { name: 'Admin & Management', value: m.adminMgmt },
    { name: 'AdBlue', value: m.adBlue },
    { name: 'Downtime Backfill', value: m.backfill },
  ].filter((s) => s.value > 0.5);

  return {
    monthlyEmi: m.emi,
    fixedMonthlyCost: m.fixed,
    variableCostPerKm: effectiveVariablePerKm,
    variableCostPerTrip: m.variable / (m.ownTrips || 1),
    totalMonthlyOwnCost: m.totalOwn * numV,
    totalMonthlyMarketCost: m.totalMarket * numV,
    monthlySavings: m.savings * numV,
    breakEvenDistance,
    breakEvenTrips,
    costPerKm: m.totalOwn / (m.distanceOwn || 1),
    costPerTrip: m.totalOwn / (m.ownTrips || 1),
    fuelWeightage: (m.fuelMonthly / (m.totalOwn || 1)) * 100,
    marketRatePerKm,
    monthlyDepreciation,
    backfillCost: m.backfill * numV,
    npvOwn,
    npvMarket,
    npvSavings: npvMarket - npvOwn,
    co2TonnesPerYear,
    costBreakdown,
  };
};

// --- EV vs Diesel comparison (eFAST / ICCT-style) ---------------------------
export const calculateEv = (params: TCOParams, dieselResult: SimulationResult): EvResult => {
  const { capex, opexFixed, market, finance, ev } = params;
  const numV = capex.numVehicles;
  const avail = Math.min(Math.max(market.availabilityPercent / 100, 0), 1);
  const ownTrips = market.monthlyTrips * avail;
  const distanceOwn = market.tripDistance * ownTrips;

  const evMonthly = (salMult: number, emiOn: boolean) => {
    const principal = ev.vehicleCost * (1 - capex.downPaymentPercent / 100);
    const emi = emiOn ? amortize(principal, capex.interestRate / 100 / 12, capex.tenureMonths) : 0;
    const driverCost =
      (opexFixed.driverBaseSalary + opexFixed.dailyBhatta * WORKING_DAYS) * salMult +
      opexFixed.tripIncentive * ownTrips;
    const helperCost = (opexFixed.hasHelper ? opexFixed.helperSalary : 0) * salMult;
    const insuranceTax =
      (opexFixed.annualInsurance + opexFixed.annualRoadTax + opexFixed.annualFitnessExp) / 12;
    const adminMgmt = opexFixed.monthlyAdminOverhead + opexFixed.managementOverheadPerVehicle;
    const energy = ev.energyCostPerKm * distanceOwn;
    const maint = ev.maintenancePerKm * distanceOwn;
    const tolls = (params.opexVariable.fastagPerTrip + params.opexVariable.incidentalsPerTrip) * ownTrips;
    return emi + driverCost + helperCost + insuranceTax + adminMgmt + energy + maint + tolls;
  };

  const r = finance.discountRatePct / 100 / 12;
  const N = Math.round(finance.holdingYears * 12);
  let stream = 0;
  for (let month = 1; month <= N; month++) {
    const salMult = Math.pow(1 + finance.salaryInflationPct / 100, (month - 1) / 12);
    stream += (evMonthly(salMult, month <= capex.tenureMonths) * numV) / Math.pow(1 + r, month);
  }
  const downpayment = ev.vehicleCost * (capex.downPaymentPercent / 100) * numV;
  const batteryPV =
    (ev.batteryReplacementCost * numV) / Math.pow(1 + r, Math.round(N / 2));
  const residualPV = (ev.residualValue * numV) / Math.pow(1 + r, N);
  const npvOwn = downpayment + stream + batteryPV - residualPV;

  const monthlyEnergyCost = ev.energyCostPerKm * distanceOwn * numV;
  const co2TonnesPerYear = (ev.kwhPerKm * distanceOwn * ev.gridCo2PerKwh * 12 * numV) / 1000;

  return {
    npvOwn,
    monthlyEnergyCost,
    co2TonnesPerYear,
    npvVsDiesel: dieselResult.npvOwn - npvOwn,
    co2SavedTonnesPerYear: dieselResult.co2TonnesPerYear - co2TonnesPerYear,
  };
};

// --- Tornado sensitivity (±swing on each driver) ----------------------------
export const runSensitivity = (params: TCOParams, swingPct = 15): SensitivityFactor[] => {
  const numV = params.capex.numVehicles;
  const base = computeMonthly(params).savings * numV;
  const s = swingPct / 100;

  const at = (o: MonthlyOverrides) => computeMonthly(params, o).savings * numV;

  const factors: SensitivityFactor[] = [
    {
      factor: 'Diesel Price',
      low: at({ dieselPrice: params.opexVariable.dieselPrice * (1 - s) }),
      high: at({ dieselPrice: params.opexVariable.dieselPrice * (1 + s) }),
      base,
    },
    {
      factor: 'Mileage (km/L)',
      low: at({ mileageKml: params.opexVariable.mileageKml * (1 - s) }),
      high: at({ mileageKml: params.opexVariable.mileageKml * (1 + s) }),
      base,
    },
    {
      factor: 'Monthly Trips',
      low: at({ monthlyTrips: params.market.monthlyTrips * (1 - s) }),
      high: at({ monthlyTrips: params.market.monthlyTrips * (1 + s) }),
      base,
    },
    {
      factor: 'Interest Rate',
      low: at({ interestRate: params.capex.interestRate * (1 - s) }),
      high: at({ interestRate: params.capex.interestRate * (1 + s) }),
      base,
    },
    {
      factor: 'Availability',
      low: at({ availabilityPercent: params.market.availabilityPercent * (1 - s) }),
      high: at({ availabilityPercent: params.market.availabilityPercent * (1 + s) }),
      base,
    },
  ];

  // Rank by total impact (widest swing first)
  return factors.sort(
    (a, b) => Math.abs(b.high - b.low) - Math.abs(a.high - a.low)
  );
};

// --- Monte Carlo (probabilistic risk) --------------------------------------
// Box-Muller normal sampler; browser Math.random is fine at runtime.
const randNormal = (mean: number, stdev: number) => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + stdev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export const runMonteCarlo = (params: TCOParams, iterations = 1000): MonteCarloResult => {
  const numV = params.capex.numVehicles;
  const samples: number[] = [];
  let positive = 0;

  for (let i = 0; i < iterations; i++) {
    const s = computeMonthly(params, {
      dieselPrice: Math.max(1, randNormal(params.opexVariable.dieselPrice, params.opexVariable.dieselPrice * 0.08)),
      mileageKml: Math.max(0.5, randNormal(params.opexVariable.mileageKml, params.opexVariable.mileageKml * 0.06)),
      monthlyTrips: Math.max(0, randNormal(params.market.monthlyTrips, params.market.monthlyTrips * 0.12)),
      interestRate: Math.max(0, randNormal(params.capex.interestRate, params.capex.interestRate * 0.1)),
    }).savings * numV;
    samples.push(s);
    if (s > 0) positive++;
  }

  samples.sort((a, b) => a - b);
  const pct = (p: number) => samples[Math.min(samples.length - 1, Math.floor(p * samples.length))];

  const min = samples[0];
  const max = samples[samples.length - 1];
  const buckets = 14;
  const width = (max - min) / buckets || 1;
  const histogram = Array.from({ length: buckets }, (_, b) => ({
    bucket: Math.round(min + width * (b + 0.5)),
    count: 0,
  }));
  for (const s of samples) {
    const idx = Math.min(buckets - 1, Math.floor((s - min) / width));
    histogram[idx].count++;
  }

  return {
    probPositive: (positive / iterations) * 100,
    p10: pct(0.1),
    p50: pct(0.5),
    p90: pct(0.9),
    histogram,
  };
};

// --- Formatters -------------------------------------------------------------
export const formatINR = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);

export const formatLakh = (value: number) => `₹${(value / 100000).toFixed(2)} L`;

/** Indian-style compact: crore for ≥1cr, else lakh. */
export const formatCompact = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return formatINR(value);
};

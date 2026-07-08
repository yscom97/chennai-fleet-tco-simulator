
import {
  TCOParams,
  SimulationResult,
  EvResult,
  SensitivityFactor,
  MonteCarloResult,
  ConfidencePoint,
} from '../types';

const WORKING_DAYS = 26; // Standard 6-day week
const DIESEL_CO2_PER_L = 2.68; // kg CO2 per litre of diesel
const WDV_RATE_DIESEL = 0.3; // India Income-Tax WDV depreciation rate (commercial vehicle)

const amortize = (principal: number, monthlyRate: number, n: number) => {
  if (n <= 0) return 0;
  if (monthlyRate <= 0) return principal / n;
  return (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
};

interface MonthlyOverrides {
  dieselPrice?: number;
  mileageKml?: number;
  mileageMult?: number;
  vehicleCost?: number;
  interestRate?: number;
  monthlyTrips?: number;
  salaryMult?: number;
  availabilityPercent?: number;
  emiOn?: boolean;
  agingFactor?: number; // Non-linear maintenance/tyre escalation with vehicle age
  unitRateMult?: number; // Market rate shock (Monte Carlo correlation)
}

interface FleetUnit {
  vehicleCost: number;
  mileageKml: number;
  residualValue: number;
  count: number;
}

/** Resolve the fleet into vehicle units — single-vehicle or heterogeneous mix. */
const fleetUnits = (params: TCOParams): FleetUnit[] => {
  if (params.fleet?.enabled && params.fleet.profiles.length > 0) {
    return params.fleet.profiles
      .filter((p) => p.count > 0)
      .map((p) => ({
        vehicleCost: p.vehicleCost,
        mileageKml: p.mileageKml,
        residualValue: p.residualValue,
        count: p.count,
      }));
  }
  return [
    {
      vehicleCost: params.capex.vehicleCost,
      mileageKml: params.opexVariable.mileageKml,
      residualValue: params.capex.residualValue,
      count: params.capex.numVehicles,
    },
  ];
};

const marketRatePerTrip = (params: TCOParams): number => {
  const { market } = params;
  if (market.unitType === 'Trip') return market.unitRate;
  if (market.unitType === 'Km') return market.unitRate * market.tripDistance;
  return market.unitRate * market.tonnage; // 'Ton'
};

/** Monthly economics for ONE vehicle (single source of truth). */
const computeMonthly = (params: TCOParams, o: MonthlyOverrides = {}) => {
  const { capex, opexFixed, opexVariable, market } = params;

  const diesel = o.dieselPrice ?? opexVariable.dieselPrice;
  const mileage = (o.mileageKml ?? opexVariable.mileageKml) * (o.mileageMult ?? 1);
  const vehicleCost = o.vehicleCost ?? capex.vehicleCost;
  const interest = o.interestRate ?? capex.interestRate;
  const trips = o.monthlyTrips ?? market.monthlyTrips;
  const salMult = o.salaryMult ?? 1;
  const avail = Math.min(Math.max((o.availabilityPercent ?? market.availabilityPercent) / 100, 0), 1);
  const emiOn = o.emiOn ?? true;
  const aging = o.agingFactor ?? 1;
  const unitRateMult = o.unitRateMult ?? 1;

  const principal = vehicleCost * (1 - capex.downPaymentPercent / 100);
  const emi = emiOn ? amortize(principal, interest / 100 / 12, capex.tenureMonths) : 0;

  const ownTrips = trips * avail;
  const missedTrips = trips * (1 - avail);
  const distanceOwn = market.tripDistance * ownTrips;

  const driverCost =
    (opexFixed.driverBaseSalary + opexFixed.dailyBhatta * WORKING_DAYS) * salMult +
    opexFixed.tripIncentive * ownTrips;
  const helperCost = (opexFixed.hasHelper ? opexFixed.helperSalary : 0) * salMult;
  const insuranceTax =
    (opexFixed.annualInsurance + opexFixed.annualRoadTax + opexFixed.annualFitnessExp) / 12;
  const adminMgmt = opexFixed.monthlyAdminOverhead + opexFixed.managementOverheadPerVehicle;
  const fixed = emi + driverCost + helperCost + insuranceTax + adminMgmt;

  const fuelDrive = (diesel / mileage) * distanceOwn;
  const idlingLitres = opexVariable.idlingHoursPerTrip * opexVariable.idlingFuelRate * ownTrips;
  const fuelIdle = idlingLitres * diesel;
  const fuelMonthly = fuelDrive + fuelIdle;
  const maintTire = (opexVariable.maintenancePerKm + opexVariable.tireCostPerKm) * distanceOwn * aging;
  const adBlue = opexVariable.adBlueCostPerKm * distanceOwn;
  const tolls = (opexVariable.fastagPerTrip + opexVariable.incidentalsPerTrip) * ownTrips;
  const variable = fuelMonthly + maintTire + adBlue + tolls;

  const marketPerTrip = marketRatePerTrip(params) * unitRateMult;
  const backfill = marketPerTrip * missedTrips;

  const totalOwn = fixed + variable + backfill;
  const totalMarket = marketPerTrip * trips;
  const litresMonthly = distanceOwn / mileage + idlingLitres;

  return {
    emi, fixed, variable, fuelMonthly, maintTire, adBlue, tolls,
    driverCost, helperCost, insuranceTax, adminMgmt, backfill,
    totalOwn, totalMarket, savings: totalMarket - totalOwn,
    distanceOwn, ownTrips, marketPerTrip, litresMonthly,
  };
};

/** Aggregate own cost across the whole fleet for a given month scenario. */
const fleetOwnMonthly = (params: TCOParams, units: FleetUnit[], o: MonthlyOverrides = {}) => {
  let own = 0;
  let distance = 0;
  let litres = 0;
  for (const u of units) {
    const m = computeMonthly(params, { ...o, vehicleCost: u.vehicleCost, mileageKml: u.mileageKml });
    own += m.totalOwn * u.count;
    distance += m.distanceOwn * u.count;
    litres += m.litresMonthly * u.count;
  }
  return { own, distance, litres };
};

/** WDV (written-down-value) depreciation tax shield, discounted to present value. */
const taxShieldNpv = (totalCapex: number, taxRatePct: number, years: number, annualDiscount: number) => {
  let wdv = totalCapex;
  let pv = 0;
  for (let y = 1; y <= Math.round(years); y++) {
    const dep = wdv * WDV_RATE_DIESEL;
    const saving = dep * (taxRatePct / 100);
    pv += saving / Math.pow(1 + annualDiscount, y);
    wdv -= dep;
  }
  return pv;
};

export const calculateTCO = (params: TCOParams): SimulationResult => {
  const { capex, market, finance } = params;
  const units = fleetUnits(params);
  const totalCount = units.reduce((s, u) => s + u.count, 0) || 1;

  // Base (month-1) fleet aggregation
  let F = {
    emi: 0, fixed: 0, variable: 0, fuelMonthly: 0, maintTire: 0, tolls: 0,
    driverStaff: 0, insuranceTax: 0, adminMgmt: 0, adBlue: 0, backfill: 0,
    totalOwn: 0, distanceOwn: 0, ownTrips: 0, litresMonthly: 0,
  };
  let marketPerTrip = 0;
  for (const u of units) {
    const m = computeMonthly(params, { vehicleCost: u.vehicleCost, mileageKml: u.mileageKml });
    marketPerTrip = m.marketPerTrip;
    F.emi += m.emi * u.count;
    F.fixed += m.fixed * u.count;
    F.variable += m.variable * u.count;
    F.fuelMonthly += m.fuelMonthly * u.count;
    F.maintTire += m.maintTire * u.count;
    F.tolls += m.tolls * u.count;
    F.driverStaff += (m.driverCost + m.helperCost) * u.count;
    F.insuranceTax += m.insuranceTax * u.count;
    F.adminMgmt += m.adminMgmt * u.count;
    F.adBlue += m.adBlue * u.count;
    F.backfill += m.backfill * u.count;
    F.totalOwn += m.totalOwn * u.count;
    F.distanceOwn += m.distanceOwn * u.count;
    F.ownTrips += m.ownTrips * u.count;
    F.litresMonthly += m.litresMonthly * u.count;
  }

  const fleetMarketMonthly = marketPerTrip * market.monthlyTrips * totalCount;
  const marketRatePerKm = marketPerTrip / (market.tripDistance || 1);

  const fixedPerVeh = F.fixed / totalCount;
  const effectiveVariablePerKm = F.variable / (F.distanceOwn || 1);
  const breakEvenDistance =
    marketRatePerKm > effectiveVariablePerKm
      ? fixedPerVeh / (marketRatePerKm - effectiveVariablePerKm)
      : Infinity;
  const breakEvenTrips = breakEvenDistance / (market.tripDistance || 1);

  const holdingMonths = finance.holdingYears * 12 || 1;
  const totalDepreciable = units.reduce((s, u) => s + (u.vehicleCost - u.residualValue) * u.count, 0);
  const monthlyDepreciation = totalDepreciable / holdingMonths / totalCount;

  const co2TonnesPerYear = (F.litresMonthly * DIESEL_CO2_PER_L * 12) / 1000;

  // --- NPV lifecycle with non-linear aging (per fleet) ----------------------
  const r = finance.discountRatePct / 100 / 12;
  const N = Math.round(finance.holdingYears * 12);
  let npvOwnStream = 0;
  let npvMarketStream = 0;
  for (let month = 1; month <= N; month++) {
    const yearsElapsed = (month - 1) / 12;
    const dieselP = params.opexVariable.dieselPrice * Math.pow(1 + finance.dieselInflationPct / 100, yearsElapsed);
    const salMult = Math.pow(1 + finance.salaryInflationPct / 100, yearsElapsed);
    const agingFactor = Math.pow(1 + finance.maintenanceAgingPct / 100, yearsElapsed);
    const monthOwn = fleetOwnMonthly(params, units, {
      dieselPrice: dieselP,
      salaryMult: salMult,
      agingFactor,
      emiOn: month <= capex.tenureMonths,
    }).own;
    const disc = Math.pow(1 + r, month);
    npvOwnStream += monthOwn / disc;
    npvMarketStream += (fleetMarketMonthly * Math.pow(1 + finance.dieselInflationPct / 100, yearsElapsed)) / disc;
  }
  const totalCapexAll = units.reduce((s, u) => s + u.vehicleCost * u.count, 0);
  const downpaymentUpfront = totalCapexAll * (capex.downPaymentPercent / 100);
  const residualPV =
    units.reduce((s, u) => s + u.residualValue * u.count, 0) / Math.pow(1 + r, N);
  const shield = finance.useTaxShield
    ? taxShieldNpv(totalCapexAll, finance.corporateTaxRatePct, finance.holdingYears, finance.discountRatePct / 100)
    : 0;
  const npvOwn = downpaymentUpfront + npvOwnStream - residualPV - shield;
  const npvMarket = npvMarketStream;

  const perVehTotalOwn = F.totalOwn / totalCount;
  const costBreakdown = [
    { name: 'Fuel (incl. Idling)', value: F.fuelMonthly / totalCount },
    { name: 'EMI (Financing)', value: F.emi / totalCount },
    { name: 'Driver & Staff', value: F.driverStaff / totalCount },
    { name: 'Maintenance & Tyres', value: F.maintTire / totalCount },
    { name: 'Tolls & Incidentals', value: F.tolls / totalCount },
    { name: 'Insurance & Tax', value: F.insuranceTax / totalCount },
    { name: 'Admin & Management', value: F.adminMgmt / totalCount },
    { name: 'AdBlue', value: F.adBlue / totalCount },
    { name: 'Downtime Backfill', value: F.backfill / totalCount },
  ].filter((s) => s.value > 0.5);

  return {
    monthlyEmi: F.emi / totalCount,
    fixedMonthlyCost: fixedPerVeh,
    variableCostPerKm: effectiveVariablePerKm,
    variableCostPerTrip: F.variable / (F.ownTrips || 1),
    totalMonthlyOwnCost: F.totalOwn,
    totalMonthlyMarketCost: fleetMarketMonthly,
    monthlySavings: fleetMarketMonthly - F.totalOwn,
    breakEvenDistance,
    breakEvenTrips,
    costPerKm: perVehTotalOwn / ((F.distanceOwn / totalCount) || 1),
    costPerTrip: perVehTotalOwn / ((F.ownTrips / totalCount) || 1),
    fuelWeightage: (F.fuelMonthly / (F.totalOwn || 1)) * 100,
    marketRatePerKm,
    monthlyDepreciation,
    backfillCost: F.backfill,
    npvOwn,
    npvMarket,
    npvSavings: npvMarket - npvOwn,
    co2TonnesPerYear,
    costBreakdown,
    taxShieldNpv: shield,
  };
};

// --- EV vs Diesel (charger CAPEX, availability, payload penalty) ------------
export const calculateEv = (params: TCOParams, dieselResult: SimulationResult): EvResult => {
  const { capex, opexFixed, market, finance, ev } = params;
  const units = fleetUnits(params);
  const numV = units.reduce((s, u) => s + u.count, 0) || 1;

  const baseAvail = Math.min(Math.max(market.availabilityPercent / 100, 0), 1);
  const evAvail = Math.min(Math.max(baseAvail * ev.evAvailabilityMultiplier, 0), 1);
  // Battery weight penalty: on a Ton basis EVs need more trips to move the same freight.
  const payloadFactor =
    market.unitType === 'Ton' && market.tonnage > ev.payloadPenaltyTons
      ? market.tonnage / (market.tonnage - ev.payloadPenaltyTons)
      : 1;
  const ownTrips = market.monthlyTrips * evAvail * payloadFactor;
  const distanceOwn = market.tripDistance * ownTrips;
  const missedTrips = Math.max(0, market.monthlyTrips - market.monthlyTrips * evAvail);
  const marketPerTrip = market.unitType === 'Trip' ? market.unitRate
    : market.unitType === 'Km' ? market.unitRate * market.tripDistance
    : market.unitRate * market.tonnage;

  const financedAsset = ev.vehicleCost + ev.chargerCost;

  const evMonthly = (salMult: number, emiOn: boolean) => {
    const principal = financedAsset * (1 - capex.downPaymentPercent / 100);
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
    const backfill = marketPerTrip * missedTrips;
    return emi + driverCost + helperCost + insuranceTax + adminMgmt + energy + maint + tolls + backfill;
  };

  const r = finance.discountRatePct / 100 / 12;
  const N = Math.round(finance.holdingYears * 12);
  let stream = 0;
  for (let month = 1; month <= N; month++) {
    const salMult = Math.pow(1 + finance.salaryInflationPct / 100, (month - 1) / 12);
    stream += (evMonthly(salMult, month <= capex.tenureMonths) * numV) / Math.pow(1 + r, month);
  }
  const downpayment = financedAsset * (capex.downPaymentPercent / 100) * numV;
  const batteryPV = (ev.batteryReplacementCost * numV) / Math.pow(1 + r, Math.round(N / 2));
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

// --- Tornado sensitivity ----------------------------------------------------
export const runSensitivity = (params: TCOParams, swingPct = 15): SensitivityFactor[] => {
  const units = fleetUnits(params);
  const totalCount = units.reduce((s, u) => s + u.count, 0) || 1;
  const marketMonthly = computeMonthly(params).marketPerTrip * params.market.monthlyTrips * totalCount;
  const savingsAt = (o: MonthlyOverrides) => marketMonthly - fleetOwnMonthly(params, units, o).own;
  const base = savingsAt({});
  const s = swingPct / 100;

  const factors: SensitivityFactor[] = [
    { factor: 'Diesel Price', low: savingsAt({ dieselPrice: params.opexVariable.dieselPrice * (1 - s) }), high: savingsAt({ dieselPrice: params.opexVariable.dieselPrice * (1 + s) }), base },
    { factor: 'Mileage (km/L)', low: savingsAt({ mileageMult: 1 - s }), high: savingsAt({ mileageMult: 1 + s }), base },
    { factor: 'Monthly Trips', low: savingsAt({ monthlyTrips: params.market.monthlyTrips * (1 - s) }), high: savingsAt({ monthlyTrips: params.market.monthlyTrips * (1 + s) }), base },
    { factor: 'Interest Rate', low: savingsAt({ interestRate: params.capex.interestRate * (1 - s) }), high: savingsAt({ interestRate: params.capex.interestRate * (1 + s) }), base },
    { factor: 'Availability', low: savingsAt({ availabilityPercent: params.market.availabilityPercent * (1 - s) }), high: savingsAt({ availabilityPercent: params.market.availabilityPercent * (1 + s) }), base },
  ];
  return factors.sort((a, b) => Math.abs(b.high - b.low) - Math.abs(a.high - a.low));
};

// --- Monte Carlo with fuel↔freight-rate correlation ------------------------
const randNormal = () => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const FUEL_MARKET_RHO = 0.7; // Freight rates track fuel prices

/** One correlated draw of the exogenous drivers. */
const sampleDraw = (params: TCOParams) => {
  const zFuel = randNormal();
  const dieselPrice = Math.max(1, params.opexVariable.dieselPrice * (1 + 0.08 * zFuel));
  const marketDev = FUEL_MARKET_RHO * 0.08 * zFuel + Math.sqrt(1 - FUEL_MARKET_RHO ** 2) * 0.06 * randNormal();
  const unitRateMult = Math.max(0.3, 1 + marketDev);
  const mileageMult = Math.max(0.4, 1 + 0.06 * randNormal());
  const interestRate = Math.max(0, params.capex.interestRate * (1 + 0.1 * randNormal()));
  return { dieselPrice, unitRateMult, mileageMult, interestRate };
};

export const runMonteCarlo = (params: TCOParams, iterations = 1000): MonteCarloResult => {
  const units = fleetUnits(params);
  const totalCount = units.reduce((s, u) => s + u.count, 0) || 1;
  const samples: number[] = [];
  let positive = 0;

  for (let i = 0; i < iterations; i++) {
    const d = sampleDraw(params);
    const tripsSample = Math.max(0, params.market.monthlyTrips * (1 + 0.12 * randNormal()));
    const marketMonthly = marketRatePerTrip(params) * d.unitRateMult * tripsSample * totalCount;
    const own = fleetOwnMonthly(params, units, {
      dieselPrice: d.dieselPrice,
      mileageMult: d.mileageMult,
      interestRate: d.interestRate,
      monthlyTrips: tripsSample,
      unitRateMult: d.unitRateMult,
    }).own;
    const s = marketMonthly - own;
    samples.push(s);
    if (s > 0) positive++;
  }

  samples.sort((a, b) => a - b);
  const pct = (p: number) => samples[Math.min(samples.length - 1, Math.floor(p * samples.length))];
  const min = samples[0];
  const max = samples[samples.length - 1];
  const buckets = 14;
  const width = (max - min) / buckets || 1;
  const histogram = Array.from({ length: buckets }, (_, b) => ({ bucket: Math.round(min + width * (b + 0.5)), count: 0 }));
  for (const s of samples) histogram[Math.min(buckets - 1, Math.floor((s - min) / width))].count++;

  return { probPositive: (positive / iterations) * 100, p10: pct(0.1), p50: pct(0.5), p90: pct(0.9), histogram };
};

// --- Confidence band: per-vehicle own-cost P10/P50/P90 across rotation ------
export const runConfidenceBand = (params: TCOParams, perPointIters = 160): ConfidencePoint[] => {
  const units = fleetUnits(params);
  const totalCount = units.reduce((s, u) => s + u.count, 0) || 1;
  const points: ConfidencePoint[] = [];

  for (let i = 0; i < 11; i++) {
    const trips = 10 + i * 3;
    const owns: number[] = [];
    for (let k = 0; k < perPointIters; k++) {
      const d = sampleDraw(params);
      const own = fleetOwnMonthly(params, units, {
        dieselPrice: d.dieselPrice,
        mileageMult: d.mileageMult,
        interestRate: d.interestRate,
        monthlyTrips: trips,
        unitRateMult: d.unitRateMult,
      }).own / totalCount; // per-vehicle scale
      owns.push(own);
    }
    owns.sort((a, b) => a - b);
    const q = (p: number) => owns[Math.min(owns.length - 1, Math.floor(p * owns.length))];
    const market = marketRatePerTrip(params) * trips; // per-vehicle market cost
    const p10 = Math.round(q(0.1));
    const p50 = Math.round(q(0.5));
    const p90 = Math.round(q(0.9));
    points.push({ trips, ownP10: p10, ownP50: p50, ownP90: p90, ownBand: [p10, p90 - p10], market: Math.round(market) });
  }
  return points;
};

// --- Formatters -------------------------------------------------------------
export const formatINR = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export const formatLakh = (value: number) => `₹${(value / 100000).toFixed(2)} L`;

export const formatCompact = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return formatINR(value);
};

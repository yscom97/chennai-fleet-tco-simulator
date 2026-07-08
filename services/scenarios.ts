import { TCOParams, SimulationResult, Scenario } from '../types';
import { formatINR } from './calculations';

const STORAGE_KEY = 'chennai-tco-scenarios';

export const loadScenarios = (): Scenario[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Scenario[]) : [];
  } catch {
    return [];
  }
};

export const saveScenarios = (scenarios: Scenario[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  } catch {
    /* storage unavailable — ignore */
  }
};

// Deterministic id without Date.now/Math.random dependency on determinism.
export const makeScenario = (name: string, params: TCOParams): Scenario => ({
  id: `s_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
  name: name || 'Untitled',
  params: JSON.parse(JSON.stringify(params)),
  savedAt: new Date().toISOString(),
});

// --- Shareable URL (params encoded in the hash) ----------------------------
export const encodeParamsToUrl = (params: TCOParams): string => {
  const json = JSON.stringify(params);
  const encoded = btoa(encodeURIComponent(json));
  const base = `${location.origin}${location.pathname}`;
  return `${base}#p=${encoded}`;
};

export const decodeParamsFromUrl = (): TCOParams | null => {
  try {
    const hash = location.hash;
    const match = hash.match(/#p=([^&]+)/);
    if (!match) return null;
    return JSON.parse(decodeURIComponent(atob(match[1]))) as TCOParams;
  } catch {
    return null;
  }
};

// --- CSV export -------------------------------------------------------------
export const exportCsv = (params: TCOParams, result: SimulationResult) => {
  const rows: [string, string | number][] = [
    ['Metric', 'Value'],
    ['Fleet Size', params.capex.numVehicles],
    ['Monthly Savings (fleet)', Math.round(result.monthlySavings)],
    ['Annual Savings (fleet)', Math.round(result.monthlySavings * 12)],
    ['NPV — Own (fleet)', Math.round(result.npvOwn)],
    ['NPV — Market (fleet)', Math.round(result.npvMarket)],
    ['NPV Savings (fleet)', Math.round(result.npvSavings)],
    ['Cost per Km (own)', result.costPerKm.toFixed(2)],
    ['Market Rate per Km', result.marketRatePerKm.toFixed(2)],
    ['Break-even Trips / month', Math.round(result.breakEvenTrips)],
    ['Fuel Weightage %', result.fuelWeightage.toFixed(1)],
    ['Monthly Depreciation / unit', Math.round(result.monthlyDepreciation)],
    ['CO2 tonnes / year (fleet)', result.co2TonnesPerYear.toFixed(1)],
    ['Monthly EMI / unit', Math.round(result.monthlyEmi)],
    ['Diesel Price', params.opexVariable.dieselPrice],
    ['Mileage km/L', params.opexVariable.mileageKml],
    ['Monthly Trips', params.market.monthlyTrips],
    ['Round-trip Distance', params.market.tripDistance],
    ['Availability %', params.market.availabilityPercent],
    ['Discount Rate %', params.finance.discountRatePct],
    ['Holding Years', params.finance.holdingYears],
  ];
  const csv = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chennai-fleet-tco.csv';
  a.click();
  URL.revokeObjectURL(url);
};

// Benchmark helper for the "normal range" gauges (Geotab-style).
export const benchmark = (value: number, low: number, high: number) => {
  if (value < low) return { label: 'Below range', tone: 'good' as const };
  if (value > high) return { label: 'Above range', tone: 'bad' as const };
  return { label: 'In range', tone: 'ok' as const };
};

export const inrCompactAxis = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 10000000) return `${(v / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return `${v}`;
};

export const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
};

// Re-export for convenience in components
export { formatINR };

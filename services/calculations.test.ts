import { describe, it, expect } from 'vitest';
import { TCOParams } from '../types';
import {
  calculateTCO,
  calculateEv,
  runSensitivity,
  runMonteCarlo,
  runConfidenceBand,
  formatCompact,
} from './calculations';

const base: TCOParams = {
  capex: { vehicleCost: 3200000, downPaymentPercent: 20, interestRate: 11, tenureMonths: 60, residualValue: 800000, numVehicles: 9 },
  opexFixed: {
    driverBaseSalary: 22000, dailyBhatta: 450, tripIncentive: 500, helperSalary: 12000, hasHelper: false,
    annualInsurance: 85000, roadTaxType: 'National', annualRoadTax: 28000, annualFitnessExp: 15000,
    monthlyAdminOverhead: 5000, managementOverheadPerVehicle: 8000,
  },
  opexVariable: {
    dieselPrice: 94.5, mileageKml: 4.5, idlingHoursPerTrip: 2, idlingFuelRate: 1.5,
    adBlueCostPerKm: 0.5, tireCostPerKm: 1.8, maintenancePerKm: 1.2, fastagPerTrip: 1200, incidentalsPerTrip: 800,
  },
  market: { unitType: 'Trip', unitRate: 12500, tripDistance: 120, monthlyTrips: 26, availabilityPercent: 92, tonnage: 20 },
  finance: { discountRatePct: 10, holdingYears: 5, dieselInflationPct: 5, salaryInflationPct: 7, maintenanceAgingPct: 8, corporateTaxRatePct: 25, useTaxShield: true },
  ev: {
    enabled: false, vehicleCost: 5500000, energyCostPerKm: 12, maintenancePerKm: 0.6,
    batteryReplacementCost: 1200000, residualValue: 900000, gridCo2PerKwh: 0.71, kwhPerKm: 1.4,
    chargerCost: 1500000, evAvailabilityMultiplier: 0.9, payloadPenaltyTons: 3,
  },
  fleet: { enabled: false, profiles: [] },
};

// Deep clone + patch helper
const patch = (p: Partial<Record<keyof TCOParams, any>>): TCOParams => {
  const c: TCOParams = JSON.parse(JSON.stringify(base));
  for (const k of Object.keys(p) as (keyof TCOParams)[]) Object.assign(c[k] as any, p[k]);
  return c;
};

describe('calculateTCO — core invariants', () => {
  it('is deterministic (pure)', () => {
    expect(calculateTCO(base)).toEqual(calculateTCO(base));
  });

  it('produces finite, sensibly-signed base metrics', () => {
    const r = calculateTCO(base);
    expect(r.monthlyEmi).toBeGreaterThan(0);
    expect(r.totalMonthlyOwnCost).toBeGreaterThan(0);
    expect(r.co2TonnesPerYear).toBeGreaterThan(0);
    expect(Number.isFinite(r.npvOwn)).toBe(true);
    expect(Number.isFinite(r.npvMarket)).toBe(true);
    // costPerKm should be in a realistic ₹10–200 band
    expect(r.costPerKm).toBeGreaterThan(10);
    expect(r.costPerKm).toBeLessThan(300);
  });

  it('EMI matches the amortization formula', () => {
    const r = calculateTCO(base);
    const P = 3200000 * 0.8, i = 0.11 / 12, n = 60;
    const expected = (P * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
    expect(r.monthlyEmi).toBeCloseTo(expected, 0);
  });

  it('cost breakdown slices sum to (approx) the per-vehicle own cost', () => {
    const r = calculateTCO(base);
    const perVeh = r.totalMonthlyOwnCost / base.capex.numVehicles;
    const sum = r.costBreakdown.reduce((s, x) => s + x.value, 0);
    expect(sum).toBeCloseTo(perVeh, -1); // within ~₹10
  });
});

describe('availability & backfill', () => {
  it('lower availability reduces monthly savings (downtime is back-filled)', () => {
    const hi = calculateTCO(patch({ market: { ...base.market, availabilityPercent: 100 } }));
    const lo = calculateTCO(patch({ market: { ...base.market, availabilityPercent: 70 } }));
    expect(lo.monthlySavings).toBeLessThan(hi.monthlySavings);
    expect(lo.backfillCost).toBeGreaterThan(hi.backfillCost);
  });
});

describe('residual value, aging & tax shield in NPV', () => {
  it('higher residual value lowers NPV of ownership', () => {
    const low = calculateTCO(patch({ capex: { ...base.capex, residualValue: 200000 } }));
    const high = calculateTCO(patch({ capex: { ...base.capex, residualValue: 1500000 } }));
    expect(high.npvOwn).toBeLessThan(low.npvOwn);
  });

  it('higher maintenance aging raises NPV of ownership', () => {
    const flat = calculateTCO(patch({ finance: { ...base.finance, maintenanceAgingPct: 0 } }));
    const steep = calculateTCO(patch({ finance: { ...base.finance, maintenanceAgingPct: 20 } }));
    expect(steep.npvOwn).toBeGreaterThan(flat.npvOwn);
  });

  it('tax shield reduces NPV and reports a positive shield only when enabled', () => {
    const on = calculateTCO(patch({ finance: { ...base.finance, useTaxShield: true } }));
    const off = calculateTCO(patch({ finance: { ...base.finance, useTaxShield: false } }));
    expect(on.taxShieldNpv).toBeGreaterThan(0);
    expect(off.taxShieldNpv).toBe(0);
    expect(on.npvOwn).toBeLessThan(off.npvOwn);
  });
});

describe('break-even', () => {
  it('at the break-even trip count, per-vehicle own ≈ market cost', () => {
    const r = calculateTCO(base);
    if (!Number.isFinite(r.breakEvenTrips)) return; // no crossing → skip
    const atBep = calculateTCO(patch({ market: { ...base.market, monthlyTrips: Math.round(r.breakEvenTrips) } }));
    // savings near zero at BEP (within a month's rounding tolerance)
    expect(Math.abs(atBep.monthlySavings)).toBeLessThan(atBep.totalMonthlyMarketCost * 0.15);
  });
});

describe('mixed fleet aggregation', () => {
  it('a single profile equal to the base vehicle reproduces the non-fleet result', () => {
    const fleetParams = patch({
      fleet: {
        enabled: true,
        profiles: [{ id: 'a', name: 'base', count: 9, vehicleCost: 3200000, mileageKml: 4.5, residualValue: 800000 }],
      },
    });
    const single = calculateTCO(base);
    const mixed = calculateTCO(fleetParams);
    expect(mixed.totalMonthlyOwnCost).toBeCloseTo(single.totalMonthlyOwnCost, 0);
    expect(mixed.npvOwn).toBeCloseTo(single.npvOwn, -2); // within ~₹100
  });

  it('two profiles aggregate additively (count-weighted)', () => {
    const only20 = calculateTCO(patch({
      fleet: { enabled: true, profiles: [{ id: 'a', name: '20', count: 6, vehicleCost: 3200000, mileageKml: 4.5, residualValue: 800000 }] },
    }));
    const only40 = calculateTCO(patch({
      fleet: { enabled: true, profiles: [{ id: 'b', name: '40', count: 3, vehicleCost: 4500000, mileageKml: 3.6, residualValue: 1100000 }] },
    }));
    const mixed = calculateTCO(patch({
      fleet: { enabled: true, profiles: [
        { id: 'a', name: '20', count: 6, vehicleCost: 3200000, mileageKml: 4.5, residualValue: 800000 },
        { id: 'b', name: '40', count: 3, vehicleCost: 4500000, mileageKml: 3.6, residualValue: 1100000 },
      ] },
    }));
    expect(mixed.totalMonthlyOwnCost).toBeCloseTo(only20.totalMonthlyOwnCost + only40.totalMonthlyOwnCost, 0);
  });
});

describe('EV comparison', () => {
  it('charger CAPEX increases EV lifecycle NPV', () => {
    const d = calculateTCO(base);
    const cheap = calculateEv(patch({ ev: { ...base.ev, enabled: true, chargerCost: 0 } }), d);
    const pricey = calculateEv(patch({ ev: { ...base.ev, enabled: true, chargerCost: 3000000 } }), d);
    expect(pricey.npvOwn).toBeGreaterThan(cheap.npvOwn);
  });

  it('EV tailpipe CO2 is zero-grid-adjusted and comparison fields are consistent', () => {
    const d = calculateTCO(base);
    const ev = calculateEv(patch({ ev: { ...base.ev, enabled: true } }), d);
    expect(ev.co2TonnesPerYear).toBeGreaterThan(0);
    expect(ev.npvVsDiesel).toBeCloseTo(d.npvOwn - ev.npvOwn, 0);
    expect(ev.co2SavedTonnesPerYear).toBeCloseTo(d.co2TonnesPerYear - ev.co2TonnesPerYear, 5);
  });
});

describe('risk simulations', () => {
  it('tornado factors are ranked by impact (widest first)', () => {
    const f = runSensitivity(base);
    expect(f.length).toBe(5);
    for (let i = 1; i < f.length; i++) {
      expect(Math.abs(f[i - 1].high - f[i - 1].low)).toBeGreaterThanOrEqual(Math.abs(f[i].high - f[i].low));
    }
  });

  it('Monte Carlo returns bounded probability and ordered percentiles', () => {
    const mc = runMonteCarlo(base, 500);
    expect(mc.probPositive).toBeGreaterThanOrEqual(0);
    expect(mc.probPositive).toBeLessThanOrEqual(100);
    expect(mc.p10).toBeLessThanOrEqual(mc.p50);
    expect(mc.p50).toBeLessThanOrEqual(mc.p90);
    const total = mc.histogram.reduce((s, h) => s + h.count, 0);
    expect(total).toBe(500);
  });

  it('confidence band has 11 rising points with P10 ≤ P50 ≤ P90', () => {
    const band = runConfidenceBand(base, 80);
    expect(band.length).toBe(11);
    for (const p of band) {
      expect(p.ownP10).toBeLessThanOrEqual(p.ownP50);
      expect(p.ownP50).toBeLessThanOrEqual(p.ownP90);
    }
    // cost should rise with rotation
    expect(band[band.length - 1].ownP50).toBeGreaterThan(band[0].ownP50);
  });
});

describe('formatters', () => {
  it('formats crore and lakh correctly', () => {
    expect(formatCompact(25000000)).toBe('₹2.50 Cr');
    expect(formatCompact(350000)).toBe('₹3.50 L');
  });
});

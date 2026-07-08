
import React, { useState, useMemo, useEffect } from 'react';
import {
  Truck, ChartPieSlice, WarningCircle, CheckCircle, Brain, CurrencyInr,
  GasPump, UserGear, TrafficSignal, Moon, Sun, Export, Copy, FloppyDisk,
  Trash, Lightning, Leaf, Bank, ArrowClockwise, Info, Path, Plus, Stack,
} from '@phosphor-icons/react';
import {
  PieChart, Pie, Cell, BarChart, Bar, ComposedChart, Area,
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { TCOParams, Scenario } from './types';
import {
  calculateTCO, calculateEv, runSensitivity, runMonteCarlo, runConfidenceBand,
  formatINR, formatCompact,
} from './services/calculations';
import { generateAnalysis } from './services/analysis';
import {
  loadScenarios, saveScenarios, makeScenario, exportCsv,
  encodeParamsToUrl, decodeParamsFromUrl, benchmark, inrCompactAxis, formatDate,
  ROUTE_PRESETS,
} from './services/scenarios';

const INITIAL_PARAMS: TCOParams = {
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
  finance: {
    discountRatePct: 10, holdingYears: 5, dieselInflationPct: 5, salaryInflationPct: 7,
    maintenanceAgingPct: 8, corporateTaxRatePct: 25, useTaxShield: true,
  },
  ev: {
    enabled: false, vehicleCost: 5500000, energyCostPerKm: 12, maintenancePerKm: 0.6,
    batteryReplacementCost: 1200000, residualValue: 900000, gridCo2PerKwh: 0.71, kwhPerKm: 1.4,
    chargerCost: 1500000, evAvailabilityMultiplier: 0.9, payloadPenaltyTons: 3,
  },
  fleet: {
    enabled: false,
    profiles: [
      { id: 'p1', name: '20FT Triple Axle', count: 6, vehicleCost: 3200000, mileageKml: 4.5, residualValue: 800000 },
      { id: 'p2', name: '40FT Trailer', count: 3, vehicleCost: 4500000, mileageKml: 3.6, residualValue: 1100000 },
    ],
  },
};

const COLORS = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];

export default function App() {
  const [params, setParams] = useState<TCOParams>(() => decodeParamsFromUrl() ?? INITIAL_PARAMS);
  const [report, setReport] = useState<string | null>(null);
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('tco-theme') === 'dark');
  const [scenarios, setScenarios] = useState<Scenario[]>(() => loadScenarios());
  const [toast, setToast] = useState<string | null>(null);

  const results = useMemo(() => calculateTCO(params), [params]);
  const evResult = useMemo(() => (params.ev.enabled ? calculateEv(params, results) : null), [params, results]);
  const sensitivity = useMemo(() => runSensitivity(params), [params]);
  const monteCarlo = useMemo(() => runMonteCarlo(params), [params]);
  const confidenceBand = useMemo(() => runConfidenceBand(params), [params]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('tco-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const handleInputChange = (section: keyof TCOParams, field: string, value: any) => {
    setParams((prev) => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  };

  const handleAnalyze = () => setReport(generateAnalysis(params, results));
  const handleReset = () => { setParams(INITIAL_PARAMS); notify('Reset to defaults'); };

  const applyPreset = (idx: number) => {
    if (idx < 0) return;
    const preset = ROUTE_PRESETS[idx];
    setParams((prev) => ({ ...prev, ...preset.patch(prev) }));
    notify(`Loaded: ${preset.name}`);
  };

  const updateProfile = (id: string, field: string, value: any) =>
    setParams((prev) => ({
      ...prev,
      fleet: { ...prev.fleet, profiles: prev.fleet.profiles.map((p) => (p.id === id ? { ...p, [field]: value } : p)) },
    }));
  const addProfile = () =>
    setParams((prev) => ({
      ...prev,
      fleet: {
        ...prev.fleet,
        profiles: [...prev.fleet.profiles, { id: `p${prev.fleet.profiles.length}_${prev.fleet.profiles.reduce((s, p) => s + p.count, 0)}`, name: 'New Type', count: 1, vehicleCost: 3000000, mileageKml: 4.5, residualValue: 700000 }],
      },
    }));
  const removeProfile = (id: string) =>
    setParams((prev) => ({ ...prev, fleet: { ...prev.fleet, profiles: prev.fleet.profiles.filter((p) => p.id !== id) } }));

  const handleSaveScenario = () => {
    const name = prompt('Scenario name?', `Scenario ${scenarios.length + 1}`);
    if (name === null) return;
    const next = [...scenarios, makeScenario(name, params)].slice(-6);
    setScenarios(next);
    saveScenarios(next);
    notify('Scenario saved');
  };

  const handleDeleteScenario = (id: string) => {
    const next = scenarios.filter((s) => s.id !== id);
    setScenarios(next);
    saveScenarios(next);
  };

  const handleShare = async () => {
    const url = encodeParamsToUrl(params);
    try {
      await navigator.clipboard.writeText(url);
      notify('Shareable link copied');
    } catch {
      notify('Copy failed — check clipboard permissions');
    }
  };

  const numV = params.fleet.enabled
    ? params.fleet.profiles.reduce((s, p) => s + p.count, 0)
    : params.capex.numVehicles;
  const perVehicleOwn = results.totalMonthlyOwnCost / (numV || 1);
  const pieData = results.costBreakdown.map((s) => ({ name: s.name, value: Math.round((s.value / (perVehicleOwn || 1)) * 100) }));

  // Confidence-band chart data (P10–P90 own cost as a shaded Area)
  const bandData = confidenceBand.map((c) => ({
    trips: c.trips,
    low: c.ownP10,
    band: c.ownP90 - c.ownP10,
    Own: c.ownP50,
    Market: c.market,
  }));

  // Theme-aware chart colors
  const axis = dark ? '#94a3b8' : '#64748b';
  const grid = dark ? '#334155' : '#e2e8f0';
  const tooltipStyle = {
    backgroundColor: dark ? '#1e293b' : '#ffffff',
    border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
    borderRadius: 8, fontSize: 12, color: dark ? '#e2e8f0' : '#0f172a',
  };

  const cpkBench = benchmark(results.costPerKm, params.market.unitType === 'Km' ? params.market.unitRate * 0.6 : 30, params.market.marketRatePerKm ?? 60);
  const fuelBench = benchmark(results.fuelWeightage, 25, 45);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="bg-slate-900 dark:bg-slate-950 text-white px-4 sm:px-6 py-3 shadow-lg flex flex-wrap gap-3 justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg"><Truck size={24} weight="fill" /></div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">Chennai Fleet TCO Simulator</h1>
            <p className="text-[11px] text-slate-400">Lifecycle NPV · TAT · Risk-adjusted</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <IconBtn onClick={() => setDark((d) => !d)} title="Toggle theme" aria={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </IconBtn>
          <IconBtn onClick={handleReset} title="Reset defaults" aria="Reset to defaults"><ArrowClockwise size={18} /></IconBtn>
          <IconBtn onClick={handleShare} title="Copy shareable link" aria="Copy shareable link"><Copy size={18} /></IconBtn>
          <IconBtn onClick={() => exportCsv(params, results)} title="Export CSV" aria="Export CSV"><Export size={18} /></IconBtn>
          <IconBtn onClick={handleSaveScenario} title="Save scenario" aria="Save scenario"><FloppyDisk size={18} /></IconBtn>
          <button onClick={handleAnalyze} className="bg-blue-600 hover:bg-blue-700 transition-colors px-3 sm:px-4 py-2 rounded-lg flex items-center gap-2 font-medium text-sm">
            <Brain size={18} /> Run Advisor
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Sidebar */}
        <aside className="w-full lg:w-[400px] border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-y-auto p-6 flex flex-col gap-8 shrink-0">
          <div className="space-y-1">
            <FieldLabel label="Chennai Route Preset" tip="Load a representative route configuration" />
            <select
              defaultValue="-1"
              onChange={(e) => { applyPreset(parseInt(e.target.value)); e.target.value = '-1'; }}
              className="w-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded px-3 py-2 text-sm font-medium text-blue-900 dark:text-blue-200 focus:ring-2 focus:ring-blue-500 outline-none"
              aria-label="Load route preset"
            >
              <option value="-1">Load a preset…</option>
              {ROUTE_PRESETS.map((p, i) => (
                <option key={p.name} value={i}>{p.name} — {p.hint}</option>
              ))}
            </select>
          </div>

          <Section icon={<CurrencyInr weight="bold" />} title="CAPEX & Financing">
            <Input label="Vehicle Unit Cost (₹)" tip="On-road price per truck" value={params.capex.vehicleCost} onChange={(v) => handleInputChange('capex', 'vehicleCost', v)} type="number" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Downpayment (%)" value={params.capex.downPaymentPercent} onChange={(v) => handleInputChange('capex', 'downPaymentPercent', v)} type="number" min={0} max={100} />
              <Input label="Interest (%)" value={params.capex.interestRate} onChange={(v) => handleInputChange('capex', 'interestRate', v)} type="number" step="0.1" min={0} max={30} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Tenure (Months)" value={params.capex.tenureMonths} onChange={(v) => handleInputChange('capex', 'tenureMonths', v)} type="number" />
              <Input label="Residual Value (₹)" tip="Resale value at end of holding period — recovered in the TCO" value={params.capex.residualValue} onChange={(v) => handleInputChange('capex', 'residualValue', v)} type="number" />
            </div>
            <Input label="Fleet Size (Units)" value={params.capex.numVehicles} onChange={(v) => handleInputChange('capex', 'numVehicles', v)} type="number" min={1} max={100} />
          </Section>

          <Section icon={<Bank weight="bold" />} title="Lifecycle & NPV">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Discount Rate (%)" tip="Annual rate used to discount future cash flows to present value" value={params.finance.discountRatePct} onChange={(v) => handleInputChange('finance', 'discountRatePct', v)} type="number" step="0.5" min={0} max={30} slider />
              <Input label="Holding (Years)" tip="Ownership horizon for the lifecycle TCO" value={params.finance.holdingYears} onChange={(v) => handleInputChange('finance', 'holdingYears', v)} type="number" min={1} max={15} slider />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Diesel Inflation (%/yr)" value={params.finance.dieselInflationPct} onChange={(v) => handleInputChange('finance', 'dieselInflationPct', v)} type="number" step="0.5" min={0} max={20} />
              <Input label="Salary Inflation (%/yr)" value={params.finance.salaryInflationPct} onChange={(v) => handleInputChange('finance', 'salaryInflationPct', v)} type="number" step="0.5" min={0} max={20} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Maint. Aging (%/yr)" tip="Non-linear rise in maintenance & tyre cost as the vehicle ages" value={params.finance.maintenanceAgingPct} onChange={(v) => handleInputChange('finance', 'maintenanceAgingPct', v)} type="number" step="1" min={0} max={30} />
              <Input label="Corp. Tax Rate (%)" tip="Used for WDV depreciation tax shield" value={params.finance.corporateTaxRatePct} onChange={(v) => handleInputChange('finance', 'corporateTaxRatePct', v)} type="number" step="1" min={0} max={45} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
              <input type="checkbox" checked={params.finance.useTaxShield} onChange={(e) => handleInputChange('finance', 'useTaxShield', e.target.checked)} className="w-4 h-4 accent-blue-600" />
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Apply WDV depreciation tax shield <span className="text-slate-400">(assumes taxable profit)</span></span>
            </label>
          </Section>

          <Section icon={<TrafficSignal weight="bold" />} title="Chennai Port Ops (TAT)">
            <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700 space-y-3">
              <Input label="Avg Idling at Port (Hrs/Trip)" tip="Turnaround wait time — burns diesel while stationary" value={params.opexVariable.idlingHoursPerTrip} onChange={(v) => handleInputChange('opexVariable', 'idlingHoursPerTrip', v)} type="number" step="0.5" min={0} max={12} slider />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Idling Fuel (L/hr)" value={params.opexVariable.idlingFuelRate} onChange={(v) => handleInputChange('opexVariable', 'idlingFuelRate', v)} type="number" step="0.1" />
                <Input label="FastTag / Trip (₹)" value={params.opexVariable.fastagPerTrip} onChange={(v) => handleInputChange('opexVariable', 'fastagPerTrip', v)} type="number" />
              </div>
              <Input label="Incidental / Trip (₹)" tip="RTO checks, parking, tips" value={params.opexVariable.incidentalsPerTrip} onChange={(v) => handleInputChange('opexVariable', 'incidentalsPerTrip', v)} type="number" />
            </div>
          </Section>

          <Section icon={<UserGear weight="bold" />} title="Personnel & Management">
            <Input label="Driver Base Pay (₹/Mo)" value={params.opexFixed.driverBaseSalary} onChange={(v) => handleInputChange('opexFixed', 'driverBaseSalary', v)} type="number" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Daily Bata (₹/Day)" tip="Per-day allowance paid to drivers on the road" value={params.opexFixed.dailyBhatta} onChange={(v) => handleInputChange('opexFixed', 'dailyBhatta', v)} type="number" />
              <Input label="Management / Unit (₹)" value={params.opexFixed.managementOverheadPerVehicle} onChange={(v) => handleInputChange('opexFixed', 'managementOverheadPerVehicle', v)} type="number" />
            </div>
          </Section>

          <Section icon={<GasPump weight="bold" />} title="Fuel & Variable">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Diesel (₹/L)" value={params.opexVariable.dieselPrice} onChange={(v) => handleInputChange('opexVariable', 'dieselPrice', v)} type="number" step="0.5" min={50} max={150} slider />
              <Input label="Mileage (km/L)" value={params.opexVariable.mileageKml} onChange={(v) => handleInputChange('opexVariable', 'mileageKml', v)} type="number" step="0.1" min={1} max={10} slider />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Maintenance (₹/Km)" value={params.opexVariable.maintenancePerKm} onChange={(v) => handleInputChange('opexVariable', 'maintenancePerKm', v)} type="number" step="0.1" />
              <Input label="Tyres (₹/Km)" value={params.opexVariable.tireCostPerKm} onChange={(v) => handleInputChange('opexVariable', 'tireCostPerKm', v)} type="number" step="0.1" />
            </div>
          </Section>

          <Section icon={<ChartPieSlice weight="bold" />} title="Market Benchmark">
            <div className="space-y-1">
              <FieldLabel label="Rate Basis" />
              <select
                value={params.market.unitType}
                onChange={(e) => handleInputChange('market', 'unitType', e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-3 py-1.5 text-sm text-slate-950 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                aria-label="Market rate basis"
              >
                <option value="Trip">Per Trip</option>
                <option value="Km">Per Km</option>
                <option value="Ton">Per Ton</option>
              </select>
            </div>
            <Input label={`Market Rate (₹/${params.market.unitType})`} value={params.market.unitRate} onChange={(v) => handleInputChange('market', 'unitRate', v)} type="number" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Round Trip (km)" value={params.market.tripDistance} onChange={(v) => handleInputChange('market', 'tripDistance', v)} type="number" />
              <Input label="Rotation (Trips/Mo)" value={params.market.monthlyTrips} onChange={(v) => handleInputChange('market', 'monthlyTrips', v)} type="number" min={0} max={60} slider />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Availability (%)" tip="Uptime of owned fleet. Downtime is back-filled by market hire." value={params.market.availabilityPercent} onChange={(v) => handleInputChange('market', 'availabilityPercent', v)} type="number" min={50} max={100} slider />
              {params.market.unitType === 'Ton' && (
                <Input label="Payload (Ton)" value={params.market.tonnage} onChange={(v) => handleInputChange('market', 'tonnage', v)} type="number" />
              )}
            </div>
          </Section>

          <Section icon={<Lightning weight="bold" />} title="Electric Alternative">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={params.ev.enabled} onChange={(e) => handleInputChange('ev', 'enabled', e.target.checked)} className="w-4 h-4 accent-blue-600" />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Compare EV vs Diesel</span>
            </label>
            {params.ev.enabled && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="EV Unit Cost (₹)" value={params.ev.vehicleCost} onChange={(v) => handleInputChange('ev', 'vehicleCost', v)} type="number" />
                  <Input label="Charger CAPEX (₹)" tip="Fast charger + grid connection per vehicle" value={params.ev.chargerCost} onChange={(v) => handleInputChange('ev', 'chargerCost', v)} type="number" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Energy (₹/Km)" value={params.ev.energyCostPerKm} onChange={(v) => handleInputChange('ev', 'energyCostPerKm', v)} type="number" step="0.5" />
                  <Input label="EV Maint (₹/Km)" value={params.ev.maintenancePerKm} onChange={(v) => handleInputChange('ev', 'maintenancePerKm', v)} type="number" step="0.1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Battery Swap (₹)" tip="Mid-life battery replacement" value={params.ev.batteryReplacementCost} onChange={(v) => handleInputChange('ev', 'batteryReplacementCost', v)} type="number" />
                  <Input label="Uptime vs Diesel" tip="Opportunity-charging downtime factor (0.9 = 90% of diesel uptime)" value={params.ev.evAvailabilityMultiplier} onChange={(v) => handleInputChange('ev', 'evAvailabilityMultiplier', v)} type="number" step="0.05" min={0.5} max={1} />
                </div>
                {params.market.unitType === 'Ton' && (
                  <Input label="Payload Penalty (Ton)" tip="Payload lost to battery weight — increases trips needed on a per-ton basis" value={params.ev.payloadPenaltyTons} onChange={(v) => handleInputChange('ev', 'payloadPenaltyTons', v)} type="number" step="0.5" />
                )}
              </div>
            )}
          </Section>

          <Section icon={<Stack weight="bold" />} title="Fleet Composition">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={params.fleet.enabled} onChange={(e) => handleInputChange('fleet', 'enabled', e.target.checked)} className="w-4 h-4 accent-blue-600" />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Mixed fleet (multiple types)</span>
            </label>
            {params.fleet.enabled && (
              <div className="space-y-3 pt-1">
                {params.fleet.profiles.map((p) => (
                  <div key={p.id} className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700 space-y-2">
                    <div className="flex items-center gap-2">
                      <input value={p.name} onChange={(e) => updateProfile(p.id, 'name', e.target.value)} className="flex-1 bg-transparent text-sm font-bold text-slate-800 dark:text-slate-100 outline-none border-b border-transparent focus:border-blue-500" aria-label="Vehicle type name" />
                      <button onClick={() => removeProfile(p.id)} aria-label="Remove type" className="text-slate-400 hover:text-rose-500"><Trash size={14} /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input label="Count" value={p.count} onChange={(v) => updateProfile(p.id, 'count', v)} type="number" min={0} max={100} />
                      <Input label="Unit Cost (₹)" value={p.vehicleCost} onChange={(v) => updateProfile(p.id, 'vehicleCost', v)} type="number" />
                      <Input label="Mileage (km/L)" value={p.mileageKml} onChange={(v) => updateProfile(p.id, 'mileageKml', v)} type="number" step="0.1" />
                      <Input label="Residual (₹)" value={p.residualValue} onChange={(v) => updateProfile(p.id, 'residualValue', v)} type="number" />
                    </div>
                  </div>
                ))}
                <button onClick={addProfile} className="w-full flex items-center justify-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 border border-dashed border-blue-300 dark:border-blue-800 rounded-lg py-2 hover:bg-blue-50 dark:hover:bg-blue-950/40">
                  <Plus size={14} /> Add vehicle type
                </button>
                <p className="text-[10px] text-slate-400">Overrides fleet size & per-unit CAPEX/mileage above.</p>
              </div>
            )}
          </Section>
        </aside>

        {/* Dashboard */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard label="Monthly Savings" value={formatINR(results.monthlySavings)} trend={results.monthlySavings > 0 ? 'up' : 'down'} sub={`Fleet of ${numV} units`} />
            <SummaryCard label={`NPV Savings · ${params.finance.holdingYears}yr`} value={formatCompact(results.npvSavings)} trend={results.npvSavings > 0 ? 'up' : 'down'} sub="Discounted lifecycle" icon={<Bank size={16} className="text-slate-400" />} />
            <SummaryCard label="Cost / Km (own)" value={`₹${results.costPerKm.toFixed(2)}`} sub={`Market ₹${results.marketRatePerKm.toFixed(2)} · ${cpkBench.label}`} tone={cpkBench.tone} />
            <SummaryCard label="CO₂ / Year" value={`${results.co2TonnesPerYear.toFixed(0)} t`} sub="Diesel tailpipe" icon={<Leaf size={16} className="text-emerald-500" />} />
          </div>

          {/* Charts row 1 */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card title="Break-even & Cost Uncertainty (P10–P90)">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={bandData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                    <XAxis dataKey="trips" stroke={axis} fontSize={11} label={{ value: 'Trips / month', position: 'insideBottom', offset: -2, fontSize: 10, fill: axis }} />
                    <YAxis stroke={axis} fontSize={11} tickFormatter={inrCompactAxis} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [formatINR(v), n === 'band' ? 'P90–P10' : n === 'low' ? 'P10' : n]} />
                    {isFinite(results.breakEvenTrips) && (
                      <ReferenceLine x={Math.round(results.breakEvenTrips)} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: `BEP ${Math.round(results.breakEvenTrips)}`, fontSize: 10, fill: '#f59e0b', position: 'top' }} />
                    )}
                    {/* P10–P90 own-cost band: invisible base + shaded height */}
                    <Area dataKey="low" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
                    <Area dataKey="band" stackId="band" stroke="none" fill="#2563eb" fillOpacity={0.15} isAnimationActive={false} />
                    <Line type="monotone" dataKey="Own" stroke="#2563eb" strokeWidth={2.5} dot={false} isAnimationActive={false} name="Own (P50)" />
                    <Line type="monotone" dataKey="Market" stroke="#ef4444" strokeWidth={2.5} dot={false} strokeDasharray="5 5" isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-slate-400 text-center mt-1">Shaded band = own-cost P10–P90 across fuel/mileage/rate uncertainty</p>
            </Card>

            <Card title="Cost Structure (per vehicle / month)">
              <div className="h-[300px] flex items-center gap-3">
                <div className="w-1/2 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} innerRadius={55} outerRadius={95} paddingAngle={3} dataKey="value" isAnimationActive={false}>
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-1.5 w-1/2 min-w-0">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate">{d.name}</span>
                      <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 ml-auto">{d.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Charts row 2: Tornado + Monte Carlo */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card title="Tornado — Savings Sensitivity (±15%)">
              <Tornado factors={sensitivity} />
            </Card>

            <Card title="Monte Carlo — Risk Distribution (1,000 runs)">
              <div className="flex items-center gap-4 mb-3">
                <div className={`text-2xl font-bold ${monteCarlo.probPositive >= 50 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {monteCarlo.probPositive.toFixed(0)}%
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">probability monthly savings &gt; 0<br />
                  <span className="font-medium">P10 {formatCompact(monteCarlo.p10)} · P90 {formatCompact(monteCarlo.p90)}</span>
                </div>
              </div>
              <div className="h-[210px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monteCarlo.histogram} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                    <XAxis dataKey="bucket" stroke={axis} fontSize={9} tickFormatter={inrCompactAxis} />
                    <YAxis stroke={axis} fontSize={10} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v} runs`} labelFormatter={(l) => formatINR(Number(l))} />
                    <ReferenceLine x={0} stroke={axis} />
                    <Bar dataKey="count" isAnimationActive={false}>
                      {monteCarlo.histogram.map((h, i) => <Cell key={i} fill={h.bucket >= 0 ? '#10b981' : '#ef4444'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* EV comparison */}
          {evResult && (
            <Card title="Electric vs Diesel — Lifecycle NPV & Carbon">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <MiniStat label="Diesel NPV" value={formatCompact(results.npvOwn)} />
                <MiniStat label="EV NPV" value={formatCompact(evResult.npvOwn)} />
                <MiniStat label="EV Advantage" value={formatCompact(evResult.npvVsDiesel)} tone={evResult.npvVsDiesel > 0 ? 'good' : 'bad'} />
                <MiniStat label="CO₂ Saved / yr" value={`${evResult.co2SavedTonnesPerYear.toFixed(0)} t`} tone={evResult.co2SavedTonnesPerYear >= 0 ? 'good' : 'bad'} />
              </div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: 'Lifecycle NPV', Diesel: Math.round(results.npvOwn), Electric: Math.round(evResult.npvOwn) },
                  ]} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                    <XAxis dataKey="name" stroke={axis} fontSize={11} />
                    <YAxis stroke={axis} fontSize={10} tickFormatter={inrCompactAxis} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCompact(v)} />
                    <Bar dataKey="Diesel" fill="#64748b" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="Electric" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* P&L + Risk + Advisor */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card title="Detailed P&L Snapshot">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 mt-2">
                  <DataItem label="Monthly EMI / Unit" value={formatINR(results.monthlyEmi)} />
                  <DataItem label="Variable Cost / Trip" value={formatINR(results.variableCostPerTrip)} />
                  <DataItem label="Monthly Depreciation / Unit" value={formatINR(results.monthlyDepreciation)} />
                  <DataItem label="Downtime Backfill (fleet)" value={formatINR(results.backfillCost)} />
                  <DataItem label="Annual Savings (fleet)" value={formatINR(results.monthlySavings * 12)} />
                  <DataItem label="NPV — Own (fleet)" value={formatCompact(results.npvOwn)} />
                  <DataItem label="NPV — Market (fleet)" value={formatCompact(results.npvMarket)} />
                  {results.taxShieldNpv > 0 && <DataItem label="Tax Shield NPV (WDV)" value={formatCompact(results.taxShieldNpv)} />}
                  <DataItem label="Payback on Downpayment" value={`${((params.capex.vehicleCost * (params.capex.downPaymentPercent / 100) * numV) / (results.monthlySavings || 1)).toFixed(1)} Mo`} />
                </div>
              </Card>

              <Card title="Operational Risk Assessment">
                <div className={`p-4 rounded-xl border-l-4 ${results.monthlySavings > 0 ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500' : 'bg-rose-50 dark:bg-rose-950/40 border-rose-500'}`}>
                  <div className="flex items-center gap-3">
                    {results.monthlySavings > 0 ? <CheckCircle size={32} className="text-emerald-500 shrink-0" /> : <WarningCircle size={32} className="text-rose-500 shrink-0" />}
                    <div>
                      <h4 className={`text-lg font-bold ${results.monthlySavings > 0 ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}>
                        {results.monthlySavings > 0 ? 'Profitable Rotation' : 'Risk of Idle Losses'}
                      </h4>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {results.monthlySavings > 0
                          ? `At ${params.market.monthlyTrips} trips/mo, owning saves ${formatINR(results.monthlySavings)} monthly. Break-even is ${Math.round(results.breakEvenTrips)} trips. Fuel weightage ${results.fuelWeightage.toFixed(0)}% (${fuelBench.label}).`
                          : `Market hiring is cheaper — rotation of ${params.market.monthlyTrips} is below the ${Math.round(results.breakEvenTrips)}-trip break-even needed to cover fixed EMI & admin.`}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <Card title="Advisory Insight" className="h-full bg-slate-900 dark:bg-slate-950 text-white overflow-hidden relative">
                {report ? (
                  <div className="max-w-none overflow-y-auto max-h-[500px]">
                    <div className="bg-slate-800/50 p-3 rounded-lg mb-4 text-[11px] font-mono text-blue-400">// Rule-based TCO Advisor</div>
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(report) }} className="text-slate-300 text-xs leading-relaxed space-y-2" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                    <Brain size={64} weight="duotone" className="text-slate-700 mb-4" />
                    <p className="text-slate-500 text-sm">Run Advisor for a verdict, risk scan & action plan</p>
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* Scenario comparison */}
          {scenarios.length > 0 && (
            <Card title="Saved Scenario Comparison">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100 dark:border-slate-700">
                      <th className="text-left font-bold uppercase tracking-wide py-2">Scenario</th>
                      <th className="text-right font-bold uppercase tracking-wide">Mo. Savings</th>
                      <th className="text-right font-bold uppercase tracking-wide">NPV Savings</th>
                      <th className="text-right font-bold uppercase tracking-wide">₹/Km</th>
                      <th className="text-right font-bold uppercase tracking-wide">BEP Trips</th>
                      <th className="text-right font-bold uppercase tracking-wide">CO₂/yr</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((s) => {
                      const r = calculateTCO(s.params);
                      return (
                        <tr key={s.id} className="border-b border-slate-50 dark:border-slate-800">
                          <td className="py-2">
                            <span className="font-bold text-slate-800 dark:text-slate-100">{s.name}</span>
                            <span className="text-slate-400 ml-2">{formatDate(s.savedAt)}</span>
                          </td>
                          <td className={`text-right font-bold ${r.monthlySavings > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatINR(r.monthlySavings)}</td>
                          <td className={`text-right font-bold ${r.npvSavings > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCompact(r.npvSavings)}</td>
                          <td className="text-right text-slate-600 dark:text-slate-300">₹{r.costPerKm.toFixed(2)}</td>
                          <td className="text-right text-slate-600 dark:text-slate-300">{Math.round(r.breakEvenTrips)}</td>
                          <td className="text-right text-slate-600 dark:text-slate-300">{r.co2TonnesPerYear.toFixed(0)}t</td>
                          <td className="text-right">
                            <button onClick={() => handleDeleteScenario(s.id)} aria-label={`Delete ${s.name}`} className="text-slate-400 hover:text-rose-500 p-1"><Trash size={14} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 dark:bg-slate-700 text-white text-sm px-4 py-2 rounded-lg shadow-xl z-50">{toast}</div>
      )}
    </div>
  );
}

// --- Tornado (dependency-free CSS bars) -------------------------------------
function Tornado({ factors }: { factors: { factor: string; low: number; high: number; base: number }[] }) {
  const maxAbs = Math.max(1, ...factors.flatMap((f) => [Math.abs(f.low - f.base), Math.abs(f.high - f.base)]));
  return (
    <div className="space-y-3 py-2">
      {factors.map((f) => {
        const down = Math.min(f.low, f.high) - f.base;
        const up = Math.max(f.low, f.high) - f.base;
        const leftW = (Math.abs(Math.min(down, 0)) / maxAbs) * 50;
        const rightW = (Math.max(up, 0) / maxAbs) * 50;
        return (
          <div key={f.factor} className="flex items-center gap-3 text-[11px]">
            <span className="w-28 text-right text-slate-500 dark:text-slate-400 shrink-0">{f.factor}</span>
            <div className="flex-1 flex items-center h-5">
              <div className="w-1/2 flex justify-end">
                <div className="h-4 bg-rose-500/80 rounded-l" style={{ width: `${leftW}%` }} />
              </div>
              <div className="w-px h-5 bg-slate-300 dark:bg-slate-600" />
              <div className="w-1/2 flex justify-start">
                <div className="h-4 bg-emerald-500/80 rounded-r" style={{ width: `${rightW}%` }} />
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-slate-400 text-center pt-1">← lower savings · higher savings →</p>
    </div>
  );
}

// --- Markdown renderer (app-generated content only) ------------------------
function renderMarkdown(md: string): string {
  const inline = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
  const lines = md.split('\n');
  const html: string[] = [];
  let inList = false;
  const closeList = () => { if (inList) { html.push('</ul>'); inList = false; } };
  for (const line of lines) {
    if (line.startsWith('## ')) {
      closeList();
      html.push(`<h4 class="text-blue-400 font-bold uppercase tracking-widest text-[11px] mt-4 mb-1">${inline(line.slice(3))}</h4>`);
    } else if (line.startsWith('- ')) {
      if (!inList) { html.push('<ul class="list-disc pl-4 space-y-1">'); inList = true; }
      html.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      html.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return html.join('');
}

// --- Helper components -------------------------------------------------------
function IconBtn({ children, onClick, title, aria }: any) {
  return (
    <button onClick={onClick} title={title} aria-label={aria} className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-200">
      {children}
    </button>
  );
}

interface SectionProps { icon: React.ReactNode; title: string; }
function Section({ icon, title, children }: React.PropsWithChildren<SectionProps>) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">
        <span className="text-blue-600 dark:text-blue-400">{icon}</span>
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FieldLabel({ label, tip }: { label: string; tip?: string }) {
  return (
    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase flex items-center gap-1">
      {label}
      {tip && <span title={tip} className="cursor-help text-slate-300 dark:text-slate-600"><Info size={11} /></span>}
    </label>
  );
}

function Input({ label, value, onChange, type = 'text', tip, slider, min, max, step, ...props }: any) {
  return (
    <div className="space-y-1">
      <FieldLabel label={label} tip={tip} />
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-3 py-1.5 text-sm text-slate-950 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
        {...props}
      />
      {slider && min !== undefined && max !== undefined && (
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step ?? 1}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full accent-blue-600 cursor-pointer"
          aria-label={`${label} slider`}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, trend, sub, icon, tone }: any) {
  const toneColor = tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-rose-600' : '';
  return (
    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="flex justify-between items-start mb-2">
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">{label}</p>
        {icon}
      </div>
      <p className={`text-lg sm:text-xl font-bold ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-rose-600' : toneColor || 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function MiniStat({ label, value, tone }: any) {
  const c = tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-rose-600' : 'text-slate-900 dark:text-slate-100';
  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700">
      <p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p>
      <p className={`text-base font-bold ${c}`}>{value}</p>
    </div>
  );
}

function Card({ title, children, className = '' }: any) {
  return (
    <div className={`bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm ${className}`}>
      <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4">
        <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function DataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-50 dark:border-slate-800">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  );
}

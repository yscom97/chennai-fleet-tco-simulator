
import React, { useState, useMemo } from 'react';
import { 
  Truck, 
  ChartPieSlice, 
  WarningCircle, 
  CheckCircle, 
  Brain,
  CurrencyInr,
  GasPump,
  UserGear,
  Clock,
  TrafficSignal
} from '@phosphor-icons/react';
import { 
  PieChart, Pie, Cell, 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { TCOParams, SimulationResult } from './types';
import { calculateTCO, formatINR, formatLakh } from './services/calculations';
import { generateAnalysis } from './services/analysis';

const INITIAL_PARAMS: TCOParams = {
  capex: {
    vehicleCost: 3200000,
    downPaymentPercent: 20,
    interestRate: 11,
    tenureMonths: 60,
    residualValue: 800000,
    numVehicles: 9
  },
  opexFixed: {
    driverBaseSalary: 22000,
    dailyBhatta: 450,
    tripIncentive: 500,
    helperSalary: 12000,
    hasHelper: false,
    annualInsurance: 85000,
    roadTaxType: 'National',
    annualRoadTax: 28000,
    annualFitnessExp: 15000,
    monthlyAdminOverhead: 5000,
    managementOverheadPerVehicle: 8000 // Hidden cost of oversight
  },
  opexVariable: {
    dieselPrice: 94.5,
    mileageKml: 4.5,
    idlingHoursPerTrip: 2, // Port Wait Time
    idlingFuelRate: 1.5, // 1.5L / Hour
    adBlueCostPerKm: 0.5,
    tireCostPerKm: 1.8,
    maintenancePerKm: 1.2,
    fastagPerTrip: 1200,
    incidentalsPerTrip: 800 // RTO, Parking, Misc
  },
  market: {
    unitType: 'Trip',
    unitRate: 12500,
    tripDistance: 120, // Round trip
    monthlyTrips: 26,
    availabilityPercent: 92 // Account for maintenance/FC
  }
};

const COLORS = ['#1e3a8a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function App() {
  const [params, setParams] = useState<TCOParams>(INITIAL_PARAMS);
  const [report, setReport] = useState<string | null>(null);

  const results = useMemo(() => calculateTCO(params), [params]);

  const handleInputChange = (section: keyof TCOParams, field: string, value: any) => {
    setParams(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const handleAnalyze = () => {
    setReport(generateAnalysis(params, results));
  };

  const pieData = [
    { name: 'Fuel (Inc. Idling)', value: results.fuelWeightage },
    { name: 'EMI', value: (results.monthlyEmi / (results.totalMonthlyOwnCost / params.capex.numVehicles)) * 100 },
    { name: 'Driver & Bata', value: ((params.opexFixed.driverBaseSalary + (params.opexFixed.dailyBhatta * 26)) / (results.totalMonthlyOwnCost / params.capex.numVehicles)) * 100 },
    { name: 'Maint & Tires', value: ((params.opexVariable.maintenancePerKm + params.opexVariable.tireCostPerKm) * params.market.tripDistance * params.market.monthlyTrips / (results.totalMonthlyOwnCost / params.capex.numVehicles)) * 100 },
    { name: 'Overhead & Others', value: 100 - results.fuelWeightage - ((results.monthlyEmi / (results.totalMonthlyOwnCost / params.capex.numVehicles)) * 100) - 25 } // Simplified
  ].filter(d => d.value > 0);

  const sensitivityData = Array.from({ length: 11 }, (_, i) => {
    const tripCount = 10 + (i * 3);
    const dist = params.market.tripDistance * tripCount;
    const ownCost = (results.fixedMonthlyCost) + (results.variableCostPerKm * dist);
    const marketRatePerTrip = results.totalMonthlyMarketCost / (params.market.monthlyTrips * params.capex.numVehicles);
    const marketCost = marketRatePerTrip * tripCount;
    return {
      trips: tripCount,
      Own: Math.round(ownCost),
      Market: Math.round(marketCost)
    };
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-slate-900 text-white px-6 py-4 shadow-lg flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Truck size={28} weight="fill" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Chennai Fleet TCO Simulator</h1>
            <p className="text-xs text-slate-400">Rotation & TAT Optimized Model</p>
          </div>
        </div>
        <button
          onClick={handleAnalyze}
          className="bg-blue-600 hover:bg-blue-700 transition-colors px-4 py-2 rounded-lg flex items-center gap-2 font-medium"
        >
          <Brain size={20} />
          Run Advisor
        </button>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden">
        {/* Left: Input Sidebar */}
        <aside className="w-full lg:w-[400px] border-r border-slate-200 bg-white overflow-y-auto p-6 flex flex-col gap-8 shrink-0">
          
          <Section icon={<CurrencyInr weight="bold"/>} title="CAPEX & Financing">
            <Input label="Vehicle Unit Cost (₹)" value={params.capex.vehicleCost} onChange={v => handleInputChange('capex', 'vehicleCost', v)} type="number" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Downpayment (%)" value={params.capex.downPaymentPercent} onChange={v => handleInputChange('capex', 'downPaymentPercent', v)} type="number" />
              <Input label="Tenure (Months)" value={params.capex.tenureMonths} onChange={v => handleInputChange('capex', 'tenureMonths', v)} type="number" />
            </div>
            <Input label="Fleet Size (Units)" value={params.capex.numVehicles} onChange={v => handleInputChange('capex', 'numVehicles', v)} type="number" />
          </Section>

          <Section icon={<TrafficSignal weight="bold"/>} title="Chennai Port Ops (TAT)">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-3">
              <Input label="Avg Idling at Port (Hrs/Trip)" value={params.opexVariable.idlingHoursPerTrip} onChange={v => handleInputChange('opexVariable', 'idlingHoursPerTrip', v)} type="number" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Idling Fuel (L/hr)" value={params.opexVariable.idlingFuelRate} onChange={v => handleInputChange('opexVariable', 'idlingFuelRate', v)} type="number" step="0.1" />
                <Input label="FastTag / Trip (₹)" value={params.opexVariable.fastagPerTrip} onChange={v => handleInputChange('opexVariable', 'fastagPerTrip', v)} type="number" />
              </div>
              <Input label="Incidental/Misc per Trip (₹)" value={params.opexVariable.incidentalsPerTrip} onChange={v => handleInputChange('opexVariable', 'incidentalsPerTrip', v)} type="number" />
            </div>
          </Section>

          <Section icon={<UserGear weight="bold"/>} title="Personnel & Management">
            <Input label="Driver Base Pay (₹/Mo)" value={params.opexFixed.driverBaseSalary} onChange={v => handleInputChange('opexFixed', 'driverBaseSalary', v)} type="number" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Daily Bata (₹/Day)" value={params.opexFixed.dailyBhatta} onChange={v => handleInputChange('opexFixed', 'dailyBhatta', v)} type="number" />
              <Input label="Management / Unit (₹)" value={params.opexFixed.managementOverheadPerVehicle} onChange={v => handleInputChange('opexFixed', 'managementOverheadPerVehicle', v)} type="number" />
            </div>
          </Section>

          <Section icon={<GasPump weight="bold"/>} title="Fuel & Variable">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Diesel (₹/L)" value={params.opexVariable.dieselPrice} onChange={v => handleInputChange('opexVariable', 'dieselPrice', v)} type="number" />
              <Input label="AdBlue (₹/Km)" value={params.opexVariable.adBlueCostPerKm} onChange={v => handleInputChange('opexVariable', 'adBlueCostPerKm', v)} type="number" step="0.1" />
            </div>
            <Input label="Mileage (km/L)" value={params.opexVariable.mileageKml} onChange={v => handleInputChange('opexVariable', 'mileageKml', v)} type="number" step="0.1" />
          </Section>

          <Section icon={<ChartPieSlice weight="bold"/>} title="Market Benchmark">
            <Input label={`Market Rate (₹/Trip)`} value={params.market.unitRate} onChange={v => handleInputChange('market', 'unitRate', v)} type="number" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Round Trip (km)" value={params.market.tripDistance} onChange={v => handleInputChange('market', 'tripDistance', v)} type="number" />
              <Input label="Rotation (Trips/Mo)" value={params.market.monthlyTrips} onChange={v => handleInputChange('market', 'monthlyTrips', v)} type="number" />
            </div>
          </Section>
        </aside>

        {/* Right: Dashboard */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard 
              label="Monthly Savings" 
              value={formatINR(results.monthlySavings)} 
              trend={results.monthlySavings > 0 ? 'up' : 'down'}
              sub={`Total for ${params.capex.numVehicles} Units`}
            />
            <SummaryCard 
              label="BEP Trips" 
              value={`${Math.round(results.breakEvenTrips)} Trips`}
              sub="Required for profit"
              icon={<CheckCircle className="text-blue-500" />}
            />
            <SummaryCard 
              label="Port Idling Cost" 
              value={formatINR(params.opexVariable.idlingHoursPerTrip * params.opexVariable.idlingFuelRate * params.opexVariable.dieselPrice * params.market.monthlyTrips)} 
              sub="Monthly Fuel at Idle"
            />
            <SummaryCard 
              label="Cost Per KM" 
              value={`₹${results.costPerKm.toFixed(2)}`} 
              sub="Inc. Management Overhead"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card title="ROI Projection (Trips vs Total Cost)">
              <div className="h-[300px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sensitivityData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="trips" label={{ value: 'Rotation (Trips/Mo)', position: 'insideBottom', offset: -5 }} />
                    <YAxis tickFormatter={(val) => `₹${(val/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(val: number) => formatINR(val)} />
                    <Legend verticalAlign="top" height={36}/>
                    <Line type="monotone" dataKey="Own" stroke="#1e3a8a" strokeWidth={3} dot={false} name="Own Fleet Cost" />
                    <Line type="monotone" dataKey="Market" stroke="#f59e0b" strokeWidth={3} dot={false} strokeDasharray="5 5" name="Market Hire Cost" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Cost Structure Breakdown">
              <div className="h-[300px] flex items-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                      {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 pr-6">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-xs font-medium text-slate-600 truncate max-w-[120px]">{d.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
               <Card title="Detailed P&L Snapshot">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                    <div className="space-y-4">
                       <DataItem label="Monthly EMI / Unit" value={formatINR(results.monthlyEmi)} />
                       <DataItem label="Personnel (Base+Bata)" value={formatINR(params.opexFixed.driverBaseSalary + (params.opexFixed.dailyBhatta * 26))} />
                       <DataItem label="Management Overhead" value={formatINR(params.opexFixed.managementOverheadPerVehicle)} />
                    </div>
                    <div className="space-y-4">
                       <DataItem label="Variable Cost / Trip" value={formatINR(results.variableCostPerTrip)} />
                       <DataItem label="Annual Potential Savings" value={formatINR(results.monthlySavings * 12)} />
                       <DataItem label="Payback on Downpayment" value={`${((params.capex.vehicleCost * (params.capex.downPaymentPercent/100) * params.capex.numVehicles) / (results.monthlySavings || 1)).toFixed(1)} Mo`} />
                    </div>
                  </div>
               </Card>

               <Card title="Operational Risk Assessment">
                  <div className={`p-4 rounded-xl border-l-4 ${results.monthlySavings > 0 ? 'bg-emerald-50 border-emerald-500' : 'bg-rose-50 border-rose-500'}`}>
                    <div className="flex items-center gap-3">
                      {results.monthlySavings > 0 ? <CheckCircle size={32} className="text-emerald-500" /> : <WarningCircle size={32} className="text-rose-500" />}
                      <div>
                        <h4 className={`text-lg font-bold ${results.monthlySavings > 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                          {results.monthlySavings > 0 ? 'Profitable Rotation' : 'Risk of Idle Losses'}
                        </h4>
                        <p className="text-sm text-slate-600">
                          {results.monthlySavings > 0 
                            ? `At current TAT of ${params.market.monthlyTrips} trips, owning saves ₹${Math.round(results.monthlySavings).toLocaleString()} monthly.`
                            : `Market hiring is cheaper because current rotation is too low to cover fixed EMI & Admin costs.`}
                        </p>
                      </div>
                    </div>
                  </div>
               </Card>
            </div>

            <div className="lg:col-span-1">
              <Card title="Advisory Insight" className="h-full bg-slate-900 text-white overflow-hidden relative">
                {report ? (
                  <div className="max-w-none overflow-y-auto max-h-[500px]">
                    <div className="bg-slate-800/50 p-4 rounded-lg mb-4 text-xs font-mono text-blue-400">
                      // Rule-based TCO Advisor (Logistics Core)
                    </div>
                    <div
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(report) }}
                      className="text-slate-300 text-xs leading-relaxed space-y-2"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                    <Brain size={64} weight="duotone" className="text-slate-700 mb-4" />
                    <p className="text-slate-500 text-sm">Run Advisor for Port-TAT Analysis</p>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Minimal, self-contained Markdown renderer for the advisor report.
// Handles ## headings, **bold**, and - bullet lists. Content is fully
// app-generated (no free user text), so inline HTML is safe here.
function renderMarkdown(md: string): string {
  const inline = (t: string) =>
    t.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');

  const lines = md.split('\n');
  const html: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      closeList();
      html.push(
        `<h4 class="text-blue-400 font-bold uppercase tracking-widest text-[11px] mt-4 mb-1">${inline(
          line.slice(3)
        )}</h4>`
      );
    } else if (line.startsWith('- ')) {
      if (!inList) {
        html.push('<ul class="list-disc pl-4 space-y-1">');
        inList = true;
      }
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

// Helper Components
interface SectionProps { icon: React.ReactNode; title: string; }
function Section({ icon, title, children }: React.PropsWithChildren<SectionProps>) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
        <span className="text-blue-600">{icon}</span>
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", ...props }: any) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-400 uppercase">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
        className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-sm text-slate-950 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
        {...props}
      />
    </div>
  );
}

function SummaryCard({ label, value, trend, sub, icon }: any) {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex justify-between items-start mb-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p>
        {icon}
      </div>
      <p className={`text-xl font-bold ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-rose-600' : 'text-slate-900'}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function Card({ title, children, className = "" }: any) {
  return (
    <div className={`bg-white p-6 rounded-2xl border border-slate-200 shadow-sm ${className}`}>
      <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2 mb-4">
        <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function DataItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-50">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-bold text-slate-800">{value}</span>
    </div>
  );
}

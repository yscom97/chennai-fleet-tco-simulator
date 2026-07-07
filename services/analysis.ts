import { TCOParams, SimulationResult } from '../types';
import { formatINR } from './calculations';

/**
 * Rule-based logistics advisor.
 * Replaces the previous Gemini API call with deterministic, offline analysis.
 * Produces the same 3-section Markdown report: Verdict, Risk Analysis, Action Plan.
 */
export const generateAnalysis = (params: TCOParams, result: SimulationResult): string => {
  const { capex, opexVariable, market } = params;

  const monthlyDistance = market.tripDistance * market.monthlyTrips;
  const marketRatePerKm =
    result.totalMonthlyMarketCost / (monthlyDistance * capex.numVehicles || 1);

  const isProfitable = result.monthlySavings > 0;
  const downpaymentTotal =
    capex.vehicleCost * (capex.downPaymentPercent / 100) * capex.numVehicles;
  const paybackMonths =
    result.monthlySavings > 0 ? downpaymentTotal / result.monthlySavings : Infinity;

  // Utilisation headroom: how far current rotation is above break-even.
  const tripBuffer = market.monthlyTrips - result.breakEvenTrips;
  const utilisationMargin = market.monthlyTrips > 0 ? tripBuffer / market.monthlyTrips : 0;

  // --- 1. Verdict -----------------------------------------------------------
  let verdict: string;
  if (isProfitable && paybackMonths <= 18 && utilisationMargin > 0.15) {
    verdict =
      `**INVEST.** Owning the fleet saves **${formatINR(result.monthlySavings)}/month** ` +
      `(${formatINR(result.monthlySavings * 12)}/year) at the current rotation of ${market.monthlyTrips} trips. ` +
      `The downpayment is recovered in **${paybackMonths.toFixed(1)} months**, with a healthy ` +
      `${(utilisationMargin * 100).toFixed(0)}% buffer above the break-even of ${Math.round(
        result.breakEvenTrips
      )} trips.`;
  } else if (isProfitable) {
    verdict =
      `**INVEST (with caution).** Ownership is cheaper by **${formatINR(result.monthlySavings)}/month**, ` +
      `but the margin is thin — break-even sits at ${Math.round(result.breakEvenTrips)} trips vs the ` +
      `current ${market.monthlyTrips}. Payback on downpayment takes **${
        isFinite(paybackMonths) ? paybackMonths.toFixed(1) + ' months' : 'an extended period'
      }**. Lock in the rotation volume before committing capital.`;
  } else {
    verdict =
      `**HOLD.** At the current rotation of ${market.monthlyTrips} trips, market hiring is cheaper by ` +
      `**${formatINR(Math.abs(result.monthlySavings))}/month**. Fixed costs (EMI + admin + management) ` +
      `are not yet covered — you need at least **${Math.round(result.breakEvenTrips)} trips/month** to ` +
      `justify ownership. Stay with outsourced trucks until demand rises.`;
  }

  // --- 2. Risk Analysis -----------------------------------------------------
  const risks: string[] = [];

  if (result.fuelWeightage > 45) {
    risks.push(
      `- **High fuel dependency (${result.fuelWeightage.toFixed(
        0
      )}% of cost).** Diesel at ₹${opexVariable.dieselPrice}/L and ${opexVariable.mileageKml} km/L ` +
        `dominate your P&L. A ₹5/L price shock or a 0.3 km/L mileage drop erodes margins fast.`
    );
  } else {
    risks.push(
      `- **Fuel exposure moderate (${result.fuelWeightage.toFixed(
        0
      )}% of cost).** Manageable, but still your single largest variable lever.`
    );
  }

  if (utilisationMargin <= 0.15) {
    risks.push(
      `- **Low utilisation headroom.** Current rotation (${market.monthlyTrips} trips) is close to the ` +
        `break-even of ${Math.round(
          result.breakEvenTrips
        )}. Any downtime — FC, breakdown, driver absence — can push a vehicle into a loss.`
    );
  }

  const idlingMonthlyCost =
    opexVariable.idlingHoursPerTrip *
    opexVariable.idlingFuelRate *
    opexVariable.dieselPrice *
    market.monthlyTrips;
  if (opexVariable.idlingHoursPerTrip >= 2) {
    risks.push(
      `- **Port TAT / idling drag.** ${opexVariable.idlingHoursPerTrip} hrs idle per trip burns ` +
        `**${formatINR(idlingMonthlyCost)}/month per vehicle** in stationary diesel. Every hour cut at the ` +
        `port is direct profit.`
    );
  }

  if (opexVariable.maintenancePerKm + opexVariable.tireCostPerKm > 2.5) {
    risks.push(
      `- **Maintenance & tyre load elevated.** ₹${(
        opexVariable.maintenancePerKm + opexVariable.tireCostPerKm
      ).toFixed(2)}/km on upkeep will climb as the fleet ages beyond 3 years — budget a rising reserve.`
    );
  }

  if (marketRatePerKm > 0 && result.costPerKm / marketRatePerKm > 0.9) {
    risks.push(
      `- **Thin cost advantage per km.** Own cost ₹${result.costPerKm.toFixed(
        2
      )}/km vs market ₹${marketRatePerKm.toFixed(2)}/km leaves little cushion for the operational burden of running a fleet.`
    );
  }

  // --- 3. Action Plan -------------------------------------------------------
  const actions: string[] = [];

  if (opexVariable.idlingHoursPerTrip >= 2) {
    actions.push(
      `- **Attack port TAT.** Pre-schedule slots and stagger dispatch to shave idling below 1.5 hrs/trip — ` +
        `saves ~${formatINR(idlingMonthlyCost / 3)}/month per vehicle.`
    );
  }
  if (result.fuelWeightage > 45) {
    actions.push(
      `- **Lock fuel efficiency.** Enforce driver mileage KPIs, telematics on idling, and negotiate bulk diesel ` +
        `at fleet card rates to blunt price swings.`
    );
  }
  if (utilisationMargin <= 0.15) {
    actions.push(
      `- **Raise rotation first.** Secure return-load contracts to push past ${Math.round(
        result.breakEvenTrips
      )} trips/month before adding units — utilisation, not fleet size, drives ROI here.`
    );
  }
  if (isProfitable && paybackMonths > 18) {
    actions.push(
      `- **Improve financing terms.** A higher downpayment or lower interest than ${capex.interestRate}% shortens ` +
        `the ${isFinite(paybackMonths) ? paybackMonths.toFixed(0) : '—'}-month payback materially.`
    );
  }
  actions.push(
    `- **Phase the rollout.** Start with ${Math.max(
      1,
      Math.ceil(capex.numVehicles / 3)
    )} units, validate the model on real trip data for a quarter, then scale to the full ${capex.numVehicles}.`
  );

  return `## Verdict
${verdict}

## Risk Analysis
${risks.join('\n')}

## Action Plan
${actions.join('\n')}`;
};


import { TCOParams, SimulationResult } from '../types';

export const calculateTCO = (params: TCOParams): SimulationResult => {
  const { capex, opexFixed, opexVariable, market } = params;

  // 1. EMI Calculation
  const principal = capex.vehicleCost * (1 - capex.downPaymentPercent / 100);
  const monthlyRate = capex.interestRate / 100 / 12;
  const n = capex.tenureMonths;
  
  let monthlyEmi = 0;
  if (monthlyRate > 0) {
    monthlyEmi = (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
  } else {
    monthlyEmi = principal / n;
  }

  // 2. Fixed Costs (Monthly per vehicle)
  // Indian Context: Driver Base + (Bhatta * Working Days) + (Incentive * Trips)
  const workingDays = 26; // Standard 6-day week
  const driverCost = opexFixed.driverBaseSalary + 
                     (opexFixed.dailyBhatta * workingDays) + 
                     (opexFixed.tripIncentive * market.monthlyTrips);
  
  const helperCost = opexFixed.hasHelper ? opexFixed.helperSalary : 0;
  const annualToMonthly = (val: number) => val / 12;
  
  const fixedMonthlyCost = monthlyEmi + 
                           driverCost + 
                           helperCost + 
                           annualToMonthly(opexFixed.annualInsurance) + 
                           annualToMonthly(opexFixed.annualRoadTax) + 
                           annualToMonthly(opexFixed.annualFitnessExp) + 
                           opexFixed.monthlyAdminOverhead +
                           opexFixed.managementOverheadPerVehicle;

  // 3. Variable Costs (Per Trip & Per Km)
  const fuelCostPerKm = opexVariable.dieselPrice / opexVariable.mileageKml;
  const idlingFuelCostPerTrip = opexVariable.idlingHoursPerTrip * opexVariable.idlingFuelRate * opexVariable.dieselPrice;
  
  const tripFixedVariable = opexVariable.fastagPerTrip + opexVariable.incidentalsPerTrip;
  
  const variableCostPerKm = fuelCostPerKm + 
                            opexVariable.adBlueCostPerKm + 
                            opexVariable.tireCostPerKm + 
                            opexVariable.maintenancePerKm;

  // 4. Totals (Monthly)
  // Adjust for availability (e.g., 90% availability means we do 10% fewer trips or need buffer)
  const monthlyDistance = market.tripDistance * market.monthlyTrips;
  const totalVariableMonthly = (variableCostPerKm * monthlyDistance) + 
                               ((idlingFuelCostPerTrip + tripFixedVariable) * market.monthlyTrips);
  
  const totalMonthlyOwnCost = fixedMonthlyCost + totalVariableMonthly;
  
  let totalMonthlyMarketCost = 0;
  if (market.unitType === 'Trip') {
    totalMonthlyMarketCost = market.unitRate * market.monthlyTrips;
  } else if (market.unitType === 'Km') {
    totalMonthlyMarketCost = market.unitRate * monthlyDistance;
  } else {
    totalMonthlyMarketCost = market.unitRate * 20 * market.monthlyTrips; // Assume 20T load
  }

  const monthlySavings = totalMonthlyMarketCost - totalMonthlyOwnCost;
  
  // 5. Break Even Calculations
  // TotalCost = Fixed + (VariableRate * Distance)
  // MarketCost = MarketRatePerKm * Distance
  const marketRatePerKm = totalMonthlyMarketCost / (monthlyDistance || 1);
  const effectiveVariablePerKm = totalVariableMonthly / (monthlyDistance || 1);
  
  const breakEvenDistance = marketRatePerKm > effectiveVariablePerKm 
    ? fixedMonthlyCost / (marketRatePerKm - effectiveVariablePerKm)
    : Infinity;

  const breakEvenTrips = breakEvenDistance / (market.tripDistance || 1);

  return {
    monthlyEmi,
    fixedMonthlyCost,
    variableCostPerKm: effectiveVariablePerKm,
    variableCostPerTrip: totalVariableMonthly / market.monthlyTrips,
    totalMonthlyOwnCost: totalMonthlyOwnCost * capex.numVehicles,
    totalMonthlyMarketCost: totalMonthlyMarketCost * capex.numVehicles,
    monthlySavings: monthlySavings * capex.numVehicles,
    breakEvenDistance,
    breakEvenTrips,
    costPerKm: totalMonthlyOwnCost / (monthlyDistance || 1),
    costPerTrip: totalMonthlyOwnCost / (market.monthlyTrips || 1),
    fuelWeightage: ((fuelCostPerKm * monthlyDistance) + (idlingFuelCostPerTrip * market.monthlyTrips)) / totalMonthlyOwnCost * 100
  };
};

export const formatINR = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(value);
};

export const formatLakh = (value: number) => {
  const lakh = value / 100000;
  return `₹${lakh.toFixed(2)} L`;
};

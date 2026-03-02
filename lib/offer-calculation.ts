export const DEFAULT_MVA_PERCENT = 25;

export type OfferCalculationInput = {
  timeEstimateHours: number;
  hourlyRateEksMva: number;
  materialCostEksMva: number;
  markupPercent: number;
  riskBufferPercent: number;
  mvaPercent: number;
};

export type OfferCalculationResult = {
  laborCostEksMva: number;
  subtotalEksMva: number;
  markupAmountEksMva: number;
  riskAmountEksMva: number;
  totalEksMva: number;
  totalInkMva: number;
};

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

export function calculateOfferTotals(input: OfferCalculationInput): OfferCalculationResult {
  const laborCostEksMva = roundMoney(input.timeEstimateHours * input.hourlyRateEksMva);
  const subtotalEksMva = roundMoney(laborCostEksMva + input.materialCostEksMva);
  const markupAmountEksMva = roundMoney(subtotalEksMva * (input.markupPercent / 100));
  const riskAmountEksMva = roundMoney(subtotalEksMva * (input.riskBufferPercent / 100));
  const totalEksMva = roundMoney(subtotalEksMva + markupAmountEksMva + riskAmountEksMva);
  const totalInkMva = roundMoney(totalEksMva * (1 + input.mvaPercent / 100));

  return {
    laborCostEksMva,
    subtotalEksMva,
    markupAmountEksMva,
    riskAmountEksMva,
    totalEksMva,
    totalInkMva
  };
}

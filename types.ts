
export type Currency = string;

export interface Transaction {
  id: number;
  tradeDate: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  price: number;
  shares: number;
  amount: number;
  currency: Currency;
}

export interface Investment {
  id: number;
  symbol: string;
  name: string;
  currency: Currency;
  currentPrice: number;
  exchangeRate?: number;
  overrideShares: number | null;
  initialPurchasePrice: number | null;
  targetAllocation: number;
  // Metadata for automated price fetching
  lastUpdated?: number;
  dataSource?: string;
}

export interface AssetAccount {
  id: number;
  name: string;
  currency: Currency;
  amount: number | null;
  exchangeRate?: number;
  autoFromInvestments?: boolean;
}

export interface DashboardTotals {
  totalBalanceHKD: number;
  totalCashHKD: number;
  totalInvestmentHKD: number;
}


import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  TrendingUp, 
  Wallet, 
  BarChart3,
  X,
  Calculator,
  RefreshCw,
  Search,
  Loader2,
  Clock,
  Database,
  Info,
  ExternalLink,
  Globe,
  CheckCircle2,
  ChevronDown
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip
} from 'recharts';
import { GoogleGenAI, Type } from "@google/genai";
import { Investment, AssetAccount } from './types';

// --- Constants ---
const CHART_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

// --- Gemini Market Data Service ---
const PriceService = {
  async fetchRealtimePrice(symbol: string): Promise<{price: number, name: string, currency: string, sourceUrls: string[]} | null> {
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });
      const prompt = `Find the current real-time stock price, official name, and trading currency for the ticker "${symbol}" from Google Finance. 
      Return the data strictly in JSON format. For Hong Kong stocks like 2800.HK, ensure the currency is HKD. For US stocks like VOO, it's USD.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              price: { type: Type.NUMBER },
              name: { type: Type.STRING },
              currency: { type: Type.STRING }
            },
            required: ["price", "name", "currency"]
          }
        }
      });

      const data = JSON.parse(response.text);
      
      const sourceUrls: string[] = [];
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        chunks.forEach((chunk: any) => {
          if (chunk.web?.uri) sourceUrls.push(chunk.web.uri);
        });
      }

      return { ...data, sourceUrls: Array.from(new Set(sourceUrls)) };
    } catch (error) {
      console.error("Gemini Fetch Error:", error);
      return null;
    }
  },
  async fetchHkdTwdRate(): Promise<number> {
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: "What is the current exchange rate from 1 HKD to TWD? Return only the number.",
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { rate: { type: Type.NUMBER } },
            required: ["rate"]
          }
        }
      });
      return JSON.parse(response.text).rate || 4.15;
    } catch {
      return 4.15; // Fallback
    }
  }
};

// --- UI Components ---
const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children?: React.ReactNode }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300 text-left">
    <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
      <div className="p-8 flex justify-between items-center border-b border-slate-50">
        <h3 className="text-xl font-black text-slate-800">{title}</h3>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
          <X size={24} />
        </button>
      </div>
      <div className="p-8 max-h-[80vh] overflow-y-auto custom-scrollbar text-left">
        {children}
      </div>
    </div>
  </div>
);

const format = (v: number, c: string = 'HKD', decimals: number = 0) => {
  if (v === 0 && (c === 'HKD' || c === 'TWD')) return '$ --';
  try {
    return new Intl.NumberFormat(c === 'TWD' ? 'zh-TW' : 'zh-HK', { 
      style: 'currency', 
      currency: c.trim().toUpperCase() || 'HKD',
      maximumFractionDigits: decimals
    }).format(v);
  } catch {
    return v.toLocaleString() + ' ' + c;
  }
};

const getRelativeTime = (timestamp?: number) => {
  if (!timestamp || timestamp === 0) return '尚未更新';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;
  return new Date(timestamp).toLocaleTimeString();
};

export default function App() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [accounts, setAccounts] = useState<AssetAccount[]>([]);
  const [monthlyBudget, setMonthlyBudget] = useState<number>(10000);
  const [baseCurrency, setBaseCurrency] = useState<'HKD' | 'TWD'>('HKD');
  const [hkdTwdRate, setHkdTwdRate] = useState<number>(4.15);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isInvestmentModalOpen, setIsInvestmentModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [sources, setSources] = useState<string[]>([]);

  // Init Data
  useEffect(() => {
    const savedInv = localStorage.getItem('pro_inv_v2');
    const savedAcc = localStorage.getItem('pro_acc_v2');
    const savedBase = localStorage.getItem('pro_base_v2');
    const savedRate = localStorage.getItem('pro_rate_v2');
    
    if (savedBase) setBaseCurrency(savedBase as any);
    if (savedRate) setHkdTwdRate(JSON.parse(savedRate));

    if (savedInv) setInvestments(JSON.parse(savedInv));
    else setInvestments([
      { id: 1, symbol: 'VOO', name: 'S&P 500 ETF', currency: 'USD', currentPrice: 512, exchangeRate: 7.82, overrideShares: 10, initialPurchasePrice: 480, targetAllocation: 60, lastUpdated: Date.now() },
      { id: 2, symbol: '2800.HK', name: '盈富基金', currency: 'HKD', currentPrice: 18.5, exchangeRate: 1, overrideShares: 2000, initialPurchasePrice: 17.5, targetAllocation: 40, lastUpdated: Date.now() }
    ]);
    if (savedAcc) setAccounts(JSON.parse(savedAcc));
    else setAccounts([
      { id: 1, name: '現金帳戶 (HKD)', currency: 'HKD', amount: 50000, exchangeRate: 1 },
      { id: 2, name: '美股證券帳戶', currency: 'USD', amount: null, autoFromInvestments: true, exchangeRate: 7.82 }
    ]);
  }, []);

  useEffect(() => {
    localStorage.setItem('pro_inv_v2', JSON.stringify(investments));
    localStorage.setItem('pro_acc_v2', JSON.stringify(accounts));
    localStorage.setItem('pro_base_v2', baseCurrency);
    localStorage.setItem('pro_rate_v2', JSON.stringify(hkdTwdRate));
  }, [investments, accounts, baseCurrency, hkdTwdRate]);

  const syncAll = async () => {
    setIsUpdating(true);
    const allSources: string[] = [];
    
    // Fetch rate
    const newRate = await PriceService.fetchHkdTwdRate();
    setHkdTwdRate(newRate);

    const newInvestments = [...investments];
    for (let i = 0; i < newInvestments.length; i++) {
      const res = await PriceService.fetchRealtimePrice(newInvestments[i].symbol);
      if (res) {
        newInvestments[i] = {
          ...newInvestments[i],
          currentPrice: res.price,
          name: res.name,
          currency: res.currency,
          lastUpdated: Date.now(),
          dataSource: 'Google Search API'
        };
        allSources.push(...res.sourceUrls);
      }
    }
    setInvestments(newInvestments);
    setSources(Array.from(new Set(allSources)));
    setIsUpdating(false);
  };

  // Convert HKD value to Base Currency
  const toBase = useCallback((hkdValue: number) => {
    return baseCurrency === 'HKD' ? hkdValue : hkdValue * hkdTwdRate;
  }, [baseCurrency, hkdTwdRate]);

  // Calculations
  const invDetails = useMemo(() => {
    return investments.map(inv => {
      const shares = inv.overrideShares || 0;
      const rateToHkd = inv.exchangeRate || 1;
      const currentPrice = inv.currentPrice || 0;
      const buyPrice = inv.initialPurchasePrice || 0;

      const valueHKD = shares * currentPrice * rateToHkd;
      const costHKD = shares * buyPrice * rateToHkd;
      const profitHKD = valueHKD - costHKD;
      const profitPct = costHKD > 0 ? (profitHKD / costHKD) * 100 : 0;
      
      return { 
        ...inv, 
        shares,
        buyPrice,
        costBase: toBase(costHKD),
        valueBase: toBase(valueHKD), 
        profitBase: toBase(profitHKD), 
        profitPct 
      };
    });
  }, [investments, toBase]);

  const totalInvBase = invDetails.reduce((s, i) => s + i.valueBase, 0);
  
  const processedAccounts = useMemo(() => {
    return accounts.map(acc => {
      const rateToHkd = acc.exchangeRate || 1;
      const totalInvHKD = totalInvBase / (baseCurrency === 'HKD' ? 1 : hkdTwdRate);
      const amount = acc.autoFromInvestments ? (totalInvHKD / rateToHkd) : (acc.amount || 0);
      const amountHKD = amount * rateToHkd;
      return { ...acc, amount, amountBase: toBase(amountHKD) };
    });
  }, [accounts, totalInvBase, baseCurrency, hkdTwdRate, toBase]);

  const totalAssetsBase = processedAccounts.reduce((acc, a) => acc + a.amountBase, 0);

  const totalFutureValueBase = totalInvBase + toBase(monthlyBudget);
  const rebalanceAdvice = invDetails.map(inv => {
    const targetVal = (inv.targetAllocation / 100) * totalFutureValueBase;
    const gap = targetVal - inv.valueBase;
    const priceHKD = inv.currentPrice * (inv.exchangeRate || 1);
    const priceBase = toBase(priceHKD);
    
    // We remove Math.max(0, ...) to allow negative suggestions (selling)
    const suggest = priceBase > 0 ? gap / priceBase : 0;
    
    const currentPct = totalInvBase > 0 ? (inv.valueBase / totalInvBase) * 100 : 0;
    return { ...inv, suggest, gap, currentPct };
  });

  const chartData = processedAccounts.filter(a => a.amountBase > 0).map((a, i) => ({
    name: a.name, value: a.amountBase, color: CHART_COLORS[i % CHART_COLORS.length]
  }));

  const saveItem = (setter: any, modalSetter: any, data: any) => {
    if (editingItem) setter((prev: any[]) => prev.map(i => i.id === editingItem.id ? { ...i, ...data } : i));
    else setter((prev: any[]) => [...prev, { ...data, id: Date.now() }]);
    modalSetter(false);
    setEditingItem(null);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 pb-32 lg:p-8 bg-slate-50 min-h-screen text-slate-900 font-medium text-left">
      <header className="mb-8 pt-6 px-2 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-black tracking-tighter">資產總覽</h1>
            <div className="relative group">
              <button className="flex items-center gap-1 px-3 py-1 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-700 shadow-sm hover:border-blue-400 transition-all">
                {baseCurrency} <ChevronDown size={14}/>
              </button>
              <div className="absolute top-full left-0 mt-2 w-32 bg-white border border-slate-100 rounded-2xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all z-50">
                <button onClick={() => setBaseCurrency('HKD')} className={`w-full text-left px-4 py-3 text-xs font-bold hover:bg-slate-50 first:rounded-t-2xl ${baseCurrency === 'HKD' ? 'text-blue-600' : 'text-slate-500'}`}>港幣 (HKD)</button>
                <button onClick={() => setBaseCurrency('TWD')} className={`w-full text-left px-4 py-3 text-xs font-bold hover:bg-slate-50 last:rounded-b-2xl ${baseCurrency === 'TWD' ? 'text-blue-600' : 'text-slate-500'}`}>台幣 (TWD)</button>
              </div>
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest"> 
            <Globe className="inline-block mr-1" size={10}/> WealthTrack Pro • 跨區域家庭共享版
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase transition-all bg-emerald-50 border-emerald-100 text-emerald-600 shadow-sm">
            <Database size={12} />
             1 HKD ≈ {hkdTwdRate.toFixed(2)} TWD
          </div>
          <button onClick={syncAll} disabled={isUpdating} className="text-[9px] text-slate-400 hover:text-blue-500 font-bold flex items-center gap-1 px-1 transition-colors">
            <RefreshCw size={10} className={isUpdating ? 'animate-spin' : ''} /> 全域行情刷新
          </button>
        </div>
      </header>

      {/* Net Worth Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-2 bg-slate-900 p-10 rounded-[40px] text-white shadow-2xl relative overflow-hidden group">
          <Wallet className="absolute -bottom-6 -right-6 opacity-5 rotate-12 transition-transform group-hover:scale-110" size={160} />
          <p className="text-xs font-black opacity-50 uppercase tracking-widest mb-2">淨資產總額 ({baseCurrency})</p>
          <h2 className="text-5xl font-black tracking-tight">{format(totalAssetsBase, baseCurrency)}</h2>
        </div>
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col justify-center">
          <p className="text-xs font-black text-blue-400 uppercase tracking-widest mb-2">流動現金 ({baseCurrency})</p>
          <h3 className="text-3xl font-black text-slate-800 tracking-tight">{format(totalAssetsBase - totalInvBase, baseCurrency)}</h3>
        </div>
      </div>

      {/* Sources Grounding */}
      {sources.length > 0 && (
        <section className="mb-8 px-2">
          <p className="text-[10px] font-black text-slate-400 uppercase mb-2 flex items-center gap-1"><Info size={10}/> 數據驗證來源</p>
          <div className="flex flex-wrap gap-2">
            {sources.slice(0, 3).map((url, i) => (
              <a key={i} href={url} target="_blank" className="text-[9px] bg-white border border-slate-200 text-slate-400 px-3 py-1.5 rounded-xl flex items-center gap-1 hover:border-blue-200 hover:text-blue-500 transition-all">
                Google Finance <ExternalLink size={8}/>
              </a>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
        {/* Pie Chart */}
        <section className="lg:col-span-4 bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm text-left">
          <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
            <BarChart3 size={20} className="text-slate-400" />
            資產配置
          </h3>
          <div className="h-[240px] w-full">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" innerRadius={65} outerRadius={90} paddingAngle={5} dataKey="value">
                  {chartData.map((e, i) => <Cell key={i} fill={e.color} strokeWidth={0} />)}
                </Pie>
                <RechartsTooltip formatter={(v: number) => format(v, baseCurrency)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Accounts List */}
        <section className="lg:col-span-8 bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm text-left">
          <div className="flex justify-between items-center mb-6 text-left">
            <h3 className="text-xl font-black text-slate-800">資產帳戶</h3>
            <button onClick={() => { setEditingItem(null); setIsAccountModalOpen(true); }} className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg active:scale-95 transition-all">
              <Plus size={20} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {processedAccounts.map((acc, i) => (
              <div key={acc.id} className="p-5 bg-slate-50 rounded-[28px] border border-transparent hover:border-slate-200 group flex justify-between items-center transition-all relative">
                <div className="flex items-center gap-4">
                  <div className="w-1.5 h-10 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}></div>
                  <div className="text-left">
                    <div className="font-black text-slate-800 text-sm">{acc.name}</div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase">{acc.currency} • 匯率 {acc.exchangeRate?.toFixed(4) || '1.000'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-base font-black text-slate-900">{format(acc.amount || 0, acc.currency)}</div>
                    <div className="text-[10px] font-bold text-slate-400">≈ {format(acc.amountBase, baseCurrency)}</div>
                  </div>
                  <button onClick={() => { setEditingItem(acc); setIsAccountModalOpen(true); }} className="p-2 text-slate-300 hover:text-blue-600 bg-white hover:bg-blue-50 rounded-xl transition-all shadow-sm border border-slate-100">
                    <Edit3 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Portfolio Table */}
      <section className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden mb-8 text-left">
        <div className="p-8 flex justify-between items-center border-b border-slate-50">
          <div className="text-left">
            <h3 className="text-2xl font-black text-slate-800">持倉明細</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              自動抓取 Google Finance 行情 • {isUpdating ? '行情更新中...' : '數據同步完成'}
            </p>
          </div>
          <button onClick={() => { setEditingItem(null); setIsInvestmentModalOpen(true); }} className="p-4 bg-emerald-600 text-white rounded-[24px] shadow-xl active:scale-95 transition-all">
            <Plus size={24} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0 min-w-[1000px]">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="py-5 px-8 text-left border-b border-slate-50">投資標的</th>
                <th className="py-5 px-4 text-center border-b border-slate-50">持有股數</th>
                <th className="py-5 px-4 text-right border-b border-slate-50">市價</th>
                <th className="py-5 px-4 text-right border-b border-slate-50">購入價位</th>
                <th className="py-5 px-4 text-right border-b border-slate-50">成本 ({baseCurrency})</th>
                <th className="py-5 px-4 text-right border-b border-slate-50">市值 ({baseCurrency})</th>
                <th className="py-5 px-4 text-right border-b border-slate-50">淨利 ({baseCurrency})</th>
                <th className="py-5 px-8 text-right border-b border-slate-50">漲跌 %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {invDetails.map(inv => (
                <tr key={inv.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="py-6 px-8 text-left">
                    <div className="flex items-center gap-3 text-left">
                      <span className="font-black text-slate-900 text-lg">{inv.symbol}</span>
                      <button onClick={() => { setEditingItem(inv); setIsInvestmentModalOpen(true); }} className="p-1.5 text-slate-300 hover:text-blue-500 transition-all"><Edit3 size={14}/></button>
                      <button onClick={() => { 
                         if(confirm(`確定要刪除 ${inv.symbol} 嗎？`)) {
                             setInvestments(prev => prev.filter(i => i.id !== inv.id));
                         }
                      }} className="p-1.5 text-slate-300 hover:text-rose-500 transition-all"><Trash2 size={14}/></button>
                    </div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                       <CheckCircle2 size={10} className="text-blue-500"/> {inv.dataSource || '搜尋報價'}
                    </div>
                  </td>
                  <td className="py-6 px-4 text-center font-bold text-slate-600">{inv.shares.toLocaleString()}</td>
                  <td className="py-6 px-4 text-right font-black text-slate-900">{format(inv.currentPrice, inv.currency, 2)}</td>
                  <td className="py-6 px-4 text-right font-bold text-slate-500">{format(inv.buyPrice, inv.currency, 2)}</td>
                  <td className="py-6 px-4 text-right font-bold text-slate-600">{format(inv.costBase, baseCurrency)}</td>
                  <td className="py-6 px-4 text-right font-black text-slate-900">{format(inv.valueBase, baseCurrency)}</td>
                  <td className={`py-6 px-4 text-right font-black ${inv.profitBase >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {inv.profitBase >= 0 ? '+' : ''}{format(inv.profitBase, baseCurrency)}
                  </td>
                  <td className="py-6 px-8 text-right">
                    <div className={`inline-block px-3 py-1 rounded-full font-black text-[11px] ${inv.profitBase >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {inv.profitBase >= 0 ? '+' : ''}{inv.profitPct.toFixed(2)}%
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white">
                <td colSpan={2} className="py-8 px-8 font-black text-left rounded-bl-[40px] border-none uppercase tracking-widest text-xs opacity-50">投資組合彙整</td>
                <td colSpan={3} className="py-8 px-4 text-right font-bold text-slate-400 border-none">成本 {format(invDetails.reduce((s,i)=>s+i.costBase,0), baseCurrency)}</td>
                <td colSpan={2} className="py-8 px-4 text-right font-black text-2xl border-none tracking-tight">{format(totalInvBase, baseCurrency)}</td>
                <td className="py-8 px-8 text-right font-black text-emerald-400 rounded-br-[40px] border-none">
                  {invDetails.reduce((s,i)=>s+i.profitBase,0) >= 0 ? '+' : ''}
                  {((invDetails.reduce((s,i)=>s+i.profitBase,0) / (invDetails.reduce((s,i)=>s+i.costBase,0) || 1)) * 100).toFixed(2)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Rebalance Advice */}
      <section className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm mb-8 text-left">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
          <div className="text-left">
            <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2">
              <Calculator size={28} className="text-emerald-500" />
              自動再平衡分析
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">依據市場現價計算最優配置 ({baseCurrency})</p>
          </div>
          <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-start min-w-[200px]">
            <label className="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">月投入預算 ({baseCurrency})</label>
            <div className="flex items-center gap-1">
              <span className="text-xl font-black text-slate-300">$</span>
              <input type="number" value={monthlyBudget} onChange={(e) => setMonthlyBudget(parseFloat(e.target.value) || 0)} className="bg-transparent text-2xl font-black text-slate-900 focus:outline-none w-full" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rebalanceAdvice.map(adv => {
            const isSell = adv.suggest < -0.001;
            const isBuy = adv.suggest > 0.001;
            const isHold = !isSell && !isBuy;

            return (
              <div key={adv.id} className="p-6 bg-slate-50 rounded-[32px] border border-slate-100/50">
                <div className="flex justify-between items-start mb-4">
                  <div className="font-black text-lg text-slate-900">{adv.symbol}</div>
                  <div className="flex gap-2">
                    <div className="px-2 py-1 bg-slate-200 text-slate-500 text-[10px] font-black rounded-lg">目前 {adv.currentPct.toFixed(1)}%</div>
                    <div className="px-2 py-1 bg-blue-100 text-blue-600 text-[10px] font-black rounded-lg">目標 {adv.targetAllocation}%</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-tight">
                    {isSell ? '建議賣出股數' : '建議買入股數'}
                  </div>
                  <div className={`text-2xl font-black ${isSell ? 'text-rose-500' : isHold ? 'text-slate-400' : 'text-emerald-600'}`}>
                    {isBuy ? `+ ${adv.suggest.toFixed(2)}` : isSell ? `${adv.suggest.toFixed(2)}` : '持倉續抱'} 
                    {!isHold && <span className="text-sm text-slate-400 ml-1">股</span>}
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-[10px] font-bold text-slate-400">
                    <span>{isSell ? '預計收回金額' : '建議投入金額'}</span>
                    <span className={`font-black ${isSell ? 'text-rose-600' : 'text-slate-900'}`}>
                      {format(Math.abs(adv.gap), baseCurrency)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Floating Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-md bg-white/80 backdrop-blur-2xl border border-white/40 p-2.5 rounded-[32px] shadow-2xl flex justify-around items-center z-40">
        <button className="p-4 text-blue-600 bg-blue-50 rounded-[22px]"><Wallet size={20}/></button>
        <button className="p-4 text-slate-400 hover:text-slate-600"><BarChart3 size={20}/></button>
        <button className="p-4 text-slate-400 hover:text-slate-600"><Calculator size={20}/></button>
        <button onClick={syncAll} className={`p-4 text-slate-400 hover:text-slate-600 transition-transform ${isUpdating ? 'animate-spin' : ''}`}><RefreshCw size={20}/></button>
      </nav>

      {/* Modals */}
      {isInvestmentModalOpen && (
        <Modal title={editingItem ? "編輯持倉" : "新增股票項目"} onClose={() => setIsInvestmentModalOpen(false)}>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const sym = (f.get('symbol') as string).toUpperCase();
            setIsUpdating(true);
            const marketData = await PriceService.fetchRealtimePrice(sym);
            setIsUpdating(false);

            saveItem(setInvestments, setIsInvestmentModalOpen, {
              symbol: sym,
              name: marketData?.name || editingItem?.name || 'Searching...',
              currency: marketData?.currency || editingItem?.currency || 'USD',
              currentPrice: marketData?.price || editingItem?.currentPrice || 0,
              exchangeRate: parseFloat(f.get('rate') as string) || (sym.endsWith('.HK') ? 1 : 7.82),
              overrideShares: parseFloat(f.get('shares') as string) || 0,
              initialPurchasePrice: parseFloat(f.get('cost') as string) || 0,
              targetAllocation: parseFloat(f.get('target') as string) || 0,
              lastUpdated: Date.now(),
              dataSource: 'Google Search API'
            });
            if (marketData) setSources(marketData.sourceUrls);
          }} className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-2xl flex gap-3 border border-blue-100">
              <Info size={16} className="text-blue-500 shrink-0 mt-0.5"/>
              <p className="text-[11px] text-blue-700 font-bold leading-relaxed uppercase">
                輸入代號 (如 AAPL 或 2800.HK)，系統將透過 Google Finance 獲取最即時的成交價。
              </p>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block ml-1">股票代號</label>
              <input name="symbol" defaultValue={editingItem?.symbol} required className="w-full bg-slate-50 border-none rounded-2xl p-4 font-black text-slate-900 outline-none uppercase text-lg" placeholder="VOO" />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div>
                <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block ml-1">匯率 (對 HKD)</label>
                <input name="rate" type="number" step="0.0001" defaultValue={editingItem?.exchangeRate || 7.82} className="w-full bg-slate-50 border-none rounded-2xl p-4 font-black text-blue-600 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block ml-1">持有股數</label>
                <input name="shares" type="number" step="0.0001" defaultValue={editingItem?.overrideShares} required className="w-full bg-slate-50 border-none rounded-2xl p-4 font-black text-slate-900 outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div>
                <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block ml-1">平均購入成本</label>
                <input name="cost" type="number" step="0.01" defaultValue={editingItem?.initialPurchasePrice} className="w-full bg-slate-50 border-none rounded-2xl p-4 font-black text-slate-900 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block ml-1">目標配置比重 %</label>
                <input name="target" type="number" defaultValue={editingItem?.targetAllocation} required className="w-full bg-slate-50 border-none rounded-2xl p-4 font-black text-indigo-600 outline-none" />
              </div>
            </div>
            <button type="submit" disabled={isUpdating} className="w-full py-5 bg-slate-900 text-white font-black rounded-3xl shadow-xl transition-all active:scale-95 flex justify-center items-center gap-2">
              {isUpdating ? <Loader2 className="animate-spin" size={20}/> : '確認並儲存持倉'}
            </button>
            {editingItem && (
              <button type="button" onClick={() => { setInvestments(prev => prev.filter(i => i.id !== editingItem.id)); setIsInvestmentModalOpen(false); }} className="w-full py-3 text-rose-500 font-bold hover:bg-rose-50 rounded-xl transition-colors">
                刪除投資項目
              </button>
            )}
          </form>
        </Modal>
      )}

      {isAccountModalOpen && (
        <Modal title={editingItem ? "編輯帳戶" : "新增資產帳戶"} onClose={() => setIsAccountModalOpen(false)}>
          <form onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            saveItem(setAccounts, setIsAccountModalOpen, {
              name: f.get('name'),
              currency: f.get('currency'),
              amount: editingItem?.autoFromInvestments ? null : parseFloat(f.get('amount') as string) || 0,
              exchangeRate: parseFloat(f.get('rate') as string) || 1,
              autoFromInvestments: editingItem?.autoFromInvestments || false
            });
          }} className="space-y-4 text-left">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase mb-1 block ml-1">帳戶名稱</label>
              <input name="name" defaultValue={editingItem?.name} required className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold outline-none focus:ring-2 ring-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase mb-1 block ml-1">幣別</label>
                <input name="currency" defaultValue={editingItem?.currency || 'HKD'} className="w-full p-4 bg-slate-50 rounded-2xl border-none font-black uppercase outline-none focus:ring-2 ring-blue-500" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase mb-1 block ml-1">匯率 (對 HKD)</label>
                <input name="rate" type="number" step="0.0001" defaultValue={editingItem?.exchangeRate || 1} className="w-full p-4 bg-slate-50 rounded-2xl border-none font-black text-blue-600 outline-none focus:ring-2 ring-blue-500" />
              </div>
            </div>
            {!editingItem?.autoFromInvestments && (
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase mb-1 block ml-1">當前帳戶餘額</label>
                <input name="amount" type="number" step="0.01" defaultValue={editingItem?.amount} required className="w-full p-4 bg-slate-50 rounded-2xl border-none font-black outline-none focus:ring-2 ring-blue-500" />
              </div>
            )}
            <button type="submit" className="w-full py-5 bg-blue-600 text-white font-black rounded-3xl mt-4 shadow-xl active:scale-95 transition-all">
              儲存帳戶設定
            </button>
            {editingItem && (
              <button type="button" onClick={() => { setAccounts(prev => prev.filter(a => a.id !== editingItem.id)); setIsAccountModalOpen(false); }} className="w-full py-3 text-rose-500 font-bold hover:bg-rose-50 rounded-xl transition-colors">
                刪除此帳戶
              </button>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}

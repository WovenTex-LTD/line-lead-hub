import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

interface FinancePortalContextValue {
  /** Exchange rate expressed as BDT per 1 USD (e.g. 121.5) */
  bdtToUsd: number;
  setBdtToUsd: (rate: number) => void;
  /** Active time period for dashboard / reports */
  activePeriod: { year: number; month: number };
  setActivePeriod: (period: { year: number; month: number }) => void;
  /** Buyer filter shared across modules */
  selectedBuyer: string | null;
  setSelectedBuyer: (buyer: string | null) => void;
}

// Historical name kept for compatibility in consumers.
const DEFAULT_BDT_TO_USD = 110;
const LIVE_FX_URL = "https://open.er-api.com/v6/latest/USD";

const FinancePortalContext = createContext<FinancePortalContextValue>({
  bdtToUsd: DEFAULT_BDT_TO_USD,
  setBdtToUsd: () => {},
  activePeriod: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
  setActivePeriod: () => {},
  selectedBuyer: null,
  setSelectedBuyer: () => {},
});

export function FinancePortalProvider({ children }: { children: ReactNode }) {
  const now = new Date();

  const [bdtToUsd, setBdtToUsdState] = useState(DEFAULT_BDT_TO_USD);
  const [activePeriod, setActivePeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [selectedBuyer, setSelectedBuyer] = useState<string | null>(null);

  // Use live exchange rate (BDT per 1 USD) on load.
  // This intentionally does not auto-refresh on a timer.
  useEffect(() => {
    let cancelled = false;

    const fetchLiveRate = async () => {
      try {
        const res = await fetch(LIVE_FX_URL);
        const json = await res.json();
        const rate = Number(json?.rates?.BDT);
        if (!cancelled && Number.isFinite(rate) && rate > 0) {
          // Keep a stable display/entry precision.
          setBdtToUsdState(Math.round(rate * 10000) / 10000);
        }
      } catch {
        // Keep the previous rate on transient network errors.
      }
    };

    fetchLiveRate();
    return () => {
      cancelled = true;
    };
  }, []);

  const setBdtToUsd = useCallback((rate: number) => {
    setBdtToUsdState(rate);
  }, []);

  return (
    <FinancePortalContext.Provider
      value={{ bdtToUsd, setBdtToUsd, activePeriod, setActivePeriod, selectedBuyer, setSelectedBuyer }}
    >
      {children}
    </FinancePortalContext.Provider>
  );
}

export function useFinancePortal() {
  return useContext(FinancePortalContext);
}

import type {
  MarketData,
  IndexData,
} from "./marketTypes";

/* =========================================================
   EMPTY / DEFAULT MARKET DATA
   ========================================================= */

const EMPTY_DATA: MarketData = {
  asOf: "Waiting for market data...",
  marketOpen: false,

  indices: [],

  vix: {
    value: 0,
    chg: 0,
    chgPct: 0,
  },

  sectors: [],
  gainers: [],
  losers: [],

  fiiPctTrend: [],
  flowTrend: [],

  strikeOI: {},
  strikeCOI: {},

  straddleTrend: {},
  coiTrend: {},
  pcrTrend: {},
  priceTrend: {},

  vixTrend: [],

  bigPlayer: {},

  optionChain: {},

  marketStats: {
    advances: 0,
    declines: 0,
    unchanged: 0,
  },

  mostActive: {
    calls: [],
    puts: [],
    byOI: [],
  },

  fiidii: {
    netFII: 0,
    netDII: 0,
  },
};

/* =========================================================
   NUMBER HELPER
   Converts strings/numbers safely to number
   ========================================================= */

function toNumber(
  value: unknown,
  fallback = 0
): number {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

/* =========================================================
   CALCULATE CHANGE %
   
   Example:
   Spot = 76944.28
   Change = -12.99

   Previous close:
   76944.28 - (-12.99)
   = 76957.27

   Change %:
   -12.99 / 76957.27 * 100
   = -0.0169%
   ========================================================= */

function calculateChangePct(
  spot: number,
  chg: number
): number {
  if (
    !Number.isFinite(spot) ||
    !Number.isFinite(chg)
  ) {
    return 0;
  }

  if (chg === 0) {
    return 0;
  }

  const previousClose =
    spot - chg;

  if (
    !Number.isFinite(previousClose) ||
    previousClose === 0
  ) {
    return 0;
  }

  return (
    (chg / previousClose) * 100
  );
}

/* =========================================================
   NORMALIZE ONE INDEX
   ========================================================= */

function normalizeIndex(
  index: Partial<IndexData> & {
    symbol?: string;
    spot?: number;
    future?: number | null;
    vwap?: number | null;
    chg?: number;
    chgPct?: number;
    atm?: number;
    support?: number;
    resistance?: number;
    supportNear?: number;
    resistanceNear?: number;
    pcrOI?: number;
    pcrCOI?: number;
  }
): IndexData {

  const spot = toNumber(
    index.spot,
    0
  );

  const chg = toNumber(
    index.chg,
    0
  );

  const suppliedChgPct =
    Number(index.chgPct);

  /*
   * IMPORTANT:
   *
   * If the source gives a valid non-zero
   * chgPct, preserve it.
   *
   * If chgPct is 0/missing while chg is
   * non-zero, calculate it ourselves.
   *
   * This specifically fixes SENSEX.
   */

  let chgPct: number;

  if (
    Number.isFinite(suppliedChgPct) &&
    (
      suppliedChgPct !== 0 ||
      chg === 0
    )
  ) {
    chgPct = suppliedChgPct;
  } else {
    chgPct =
      calculateChangePct(
        spot,
        chg
      );
  }

  return {
    symbol:
      String(index.symbol ?? "")
        .trim(),

    spot,

    future:
      index.future === null ||
      index.future === undefined
        ? null
        : toNumber(index.future),

    vwap:
      index.vwap === null ||
      index.vwap === undefined
        ? null
        : toNumber(index.vwap),

    chg,

    chgPct,

    atm: toNumber(
      index.atm,
      0
    ),

    support: toNumber(
      index.support,
      0
    ),

    resistance: toNumber(
      index.resistance,
      0
    ),

    supportNear:
      index.supportNear ===
        undefined
        ? undefined
        : toNumber(
            index.supportNear
          ),

    resistanceNear:
      index.resistanceNear ===
        undefined
        ? undefined
        : toNumber(
            index.resistanceNear
          ),

    pcrOI: toNumber(
      index.pcrOI,
      0
    ),

    pcrCOI: toNumber(
      index.pcrCOI,
      0
    ),
  };
}

/* =========================================================
   NORMALIZE INDICES

   dashboard_data.json may contain:

   "indices": {
      "NIFTY": {...},
      "BANKNIFTY": {...},
      "FINNIFTY": {...},
      "SENSEX": {...}
   }

   OR:

   "indices": [
      {...},
      {...}
   ]

   React expects an array.
   ========================================================= */

function normalizeIndices(
  indices:
    | MarketData["indices"]
    | Record<
        string,
        IndexData
      >
    | undefined
): IndexData[] {

  if (!indices) {
    return [];
  }

  /* -----------------------------------------
     Already an array
     ----------------------------------------- */

  if (Array.isArray(indices)) {
    return indices.map(
      (item) =>
        normalizeIndex(item)
    );
  }

  /* -----------------------------------------
     Object -> Array
     ----------------------------------------- */

  return Object.entries(
    indices
  ).map(
    ([key, value]) =>
      normalizeIndex({
        ...(value as IndexData),

        /*
         * If symbol is missing from the
         * object value, use the object key.
         */

        symbol:
          value?.symbol ??
          key,
      })
  );
}

/* =========================================================
   NORMALIZE VIX
   ========================================================= */

function normalizeVix(
  vix: MarketData["vix"] | undefined
): MarketData["vix"] {

  if (!vix) {
    return {
      value: 0,
      chg: 0,
      chgPct: 0,
    };
  }

  const value =
    toNumber(vix.value);

  const chg =
    toNumber(vix.chg);

  let chgPct =
    Number(vix.chgPct);

  /*
   * Same protection as indices.
   */

  if (
    !Number.isFinite(chgPct) ||
    (
      chgPct === 0 &&
      chg !== 0
    )
  ) {
    const previous =
      value - chg;

    if (
      previous !== 0 &&
      Number.isFinite(previous)
    ) {
      chgPct =
        (chg / previous) * 100;
    } else {
      chgPct = 0;
    }
  }

  return {
    value,
    chg,
    chgPct,
  };
}

/* =========================================================
   NORMALIZE MARKET STATS
   ========================================================= */

function normalizeMarketStats(
  stats:
    | MarketData["marketStats"]
    | undefined
): MarketData["marketStats"] {

  if (!stats) {
    return {
      advances: 0,
      declines: 0,
      unchanged: 0,
    };
  }

  return {
    advances: toNumber(
      stats.advances
    ),

    declines: toNumber(
      stats.declines
    ),

    unchanged: toNumber(
      stats.unchanged
    ),
  };
}

/* =========================================================
   NORMALIZE FII / DII
   ========================================================= */

function normalizeFiiDii(
  data:
    | MarketData["fiidii"]
    | undefined
): MarketData["fiidii"] {

  if (!data) {
    return {
      netFII: 0,
      netDII: 0,
    };
  }

  return {
    date: data.date,

    buyFII:
      data.buyFII === undefined
        ? undefined
        : toNumber(
            data.buyFII
          ),

    sellFII:
      data.sellFII === undefined
        ? undefined
        : toNumber(
            data.sellFII
          ),

    netFII:
      toNumber(
        data.netFII
      ),

    buyDII:
      data.buyDII === undefined
        ? undefined
        : toNumber(
            data.buyDII
          ),

    sellDII:
      data.sellDII === undefined
        ? undefined
        : toNumber(
            data.sellDII
          ),

    netDII:
      toNumber(
        data.netDII
      ),
  };
}

/* =========================================================
   MERGE MARKET DATA
   ========================================================= */

function mergeData(
  base: MarketData,
  live: Partial<MarketData>
): MarketData {

  const normalizedIndices =
    normalizeIndices(
      live.indices
    );

  return {

    ...base,

    ...live,

    /* =====================================================
       BASIC
       ===================================================== */

    asOf:
      live.asOf ??
      base.asOf,

    marketOpen:
      live.marketOpen ??
      base.marketOpen,

    /* =====================================================
       INDEX DATA
       ===================================================== */

    indices:
      live.indices !== undefined
        ? normalizedIndices
        : base.indices,

    /* =====================================================
       SECTORS
       ===================================================== */

    sectors:
      live.sectors ??
      base.sectors,

    /* =====================================================
       GAINERS
       ===================================================== */

    gainers:
      live.gainers ??
      base.gainers,

    /* =====================================================
       LOSERS
       ===================================================== */

    losers:
      live.losers ??
      base.losers,

    /* =====================================================
       VIX
       ===================================================== */

    vix:
      live.vix !== undefined
        ? normalizeVix(
            live.vix
          )
        : base.vix,

    /* =====================================================
       FII / DII TRENDS
       ===================================================== */

    fiiPctTrend:
      live.fiiPctTrend ??
      base.fiiPctTrend,

    flowTrend:
      live.flowTrend ??
      base.flowTrend,

    /* =====================================================
       STRIKE OI
       ===================================================== */

    strikeOI:
      live.strikeOI ??
      base.strikeOI,

    /* =====================================================
       STRIKE COI
       ===================================================== */

    strikeCOI:
      live.strikeCOI ??
      base.strikeCOI,

    /* =====================================================
       STRADDLE
       ===================================================== */

    straddleTrend:
      live.straddleTrend ??
      base.straddleTrend,

    /* =====================================================
       COI
       ===================================================== */

    coiTrend:
      live.coiTrend ??
      base.coiTrend,

    /* =====================================================
       PCR
       ===================================================== */

    pcrTrend:
      live.pcrTrend ??
      base.pcrTrend,

    /* =====================================================
       PRICE TREND
       ===================================================== */

    priceTrend:
      live.priceTrend ??
      base.priceTrend,

    /* =====================================================
       VIX TREND
       ===================================================== */

    vixTrend:
      live.vixTrend ??
      base.vixTrend,

    /* =====================================================
       BIG PLAYER
       ===================================================== */

    bigPlayer:
      live.bigPlayer ??
      base.bigPlayer,

    /* =====================================================
       OPTION CHAIN
       ===================================================== */

    optionChain:
      live.optionChain ??
      base.optionChain,

    /* =====================================================
       MARKET BREADTH
       ===================================================== */

    marketStats:
      live.marketStats !== undefined
        ? normalizeMarketStats(
            live.marketStats
          )
        : base.marketStats,

    /* =====================================================
       MOST ACTIVE
       ===================================================== */

    mostActive:
      live.mostActive ??
      base.mostActive,

    /* =====================================================
       FII / DII
       ===================================================== */

    fiidii:
      live.fiidii !== undefined
        ? normalizeFiiDii(
            live.fiidii
          )
        : base.fiidii,
  };
}

/* =========================================================
   FETCH MARKET DATA
   ========================================================= */

export async function fetchMarketData(): Promise<MarketData> {

  let result: MarketData = {
    ...EMPTY_DATA,
  };
  let dashboardAsOf = EMPTY_DATA.asOf;

  const cacheBust =
    Date.now();

  /* =======================================================
     DASHBOARD DATA
     ======================================================= */

  try {

    const response =
      await fetch(
        `/dashboard_data.json?t=${cacheBust}`,
        {
          cache: "no-store",
        }
      );

    if (response.ok) {

  const live =
    (await response.json()) as
      Partial<MarketData>;

  dashboardAsOf =
    live.asOf ??
    dashboardAsOf;

  result =
    mergeData(
      result,
      live
    );
}

  } catch (error) {

    console.error(
      "dashboard_data.json error:",
      error
    );
  }

  /* =======================================================
     FII / DII DATA
     ======================================================= */

  try {

    const response =
      await fetch(
        `/fiidii_data.json?t=${cacheBust}`,
        {
          cache: "no-store",
        }
      );

    if (response.ok) {

      const live =
        (await response.json()) as
          Partial<MarketData>;

      result =
        mergeData(
          result,
          live
        );
	/*
   * IMPORTANT:
   * dashboard_data.json is the authoritative
   * source for the dashboard timestamp.
   * Do not allow fiidii_data.json to overwrite it.
   */
  result.asOf = dashboardAsOf;
    }

  } catch (error) {

    console.error(
      "fiidii_data.json error:",
      error
    );
  }

  /* =======================================================
     FINAL SAFETY NORMALIZATION
     
     This ensures that even if another data source
     overwrites the indices, SENSEX percentage is
     corrected before returning the data.
     ======================================================= */

  result.indices =
    normalizeIndices(
      result.indices
    );

  result.vix =
    normalizeVix(
      result.vix
    );

  result.marketStats =
    normalizeMarketStats(
      result.marketStats
    );

  result.fiidii =
    normalizeFiiDii(
      result.fiidii
    );

  /* =======================================================
     RETURN FINAL NORMALIZED DATA
     ======================================================= */

  return result;
}
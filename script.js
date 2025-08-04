/*
 * Stock Screener Script
 *
 * This script powers the stock scanning portion of the website. Users can enter
 * comma‑separated ticker symbols and the script will attempt to retrieve
 * fundamental data from free public APIs. The primary source used is
 * Alpha Vantage's “OVERVIEW” and “GLOBAL_QUOTE” endpoints, which expose
 * earnings per share, book value per share, enterprise value, EBITDA, and
 * dividend information. A simple proxy service (allorigins.win) is used to
 * bypass cross‑origin restrictions when making requests from a browser.
 *
 * If data is successfully retrieved, the script computes several valuation
 * metrics inspired by the CFA curriculum:
 *   – Price/Earnings (P/E) ratio
 *   – Price/Book (P/B) ratio
 *   – EV/EBITDA ratio (a proxy for the enterprise value model)
 *   – Dividend per share and dividend yield
 *   – A constant‑growth dividend discount model (simplified Gordon Growth) to
 *     estimate an intrinsic value using a default discount rate of 8% and
 *     zero growth. This is purely illustrative and should not be relied on
 *     for investment decisions.
 *
 * In order to use a different data provider or to customise the discount rate,
 * modify the API_KEYS constant and the helper functions below. If no data
 * provider responds or if a ticker is invalid, the row for that ticker will
 * display N/A values.
 */

document.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('scan-btn');
  const tickersInput = document.getElementById('tickers-input');
  const resultsTable = document.getElementById('results');
  const resultsBody = document.getElementById('results-body');

  // Reference to the optional API key input field. Users can supply their own
  // Alpha Vantage API key here to unlock data for a broader set of tickers.
  const apiKeyInput = document.getElementById('apikey-input');

  /*
   * API keys for data providers.  By default the Alpha Vantage key uses
   * the public demo key, which only returns meaningful data for MSFT and a
   * handful of symbols.  To enable scanning across all tickers you should
   * sign up for a free API key at https://www.alphavantage.co/support/#api-key
   * and replace the value below.  You may optionally add a Financial
   * Modeling Prep key if you have one.
   */
  const API_KEYS = {
    alpha: 'demo',
    fmp: ''
  };

  /**
   * Fetch JSON over the network via a simple proxy to work around
   * cross‑origin resource sharing (CORS) restrictions. The proxy forwards
   * requests to the target URL and returns the raw response. See
   * https://github.com/gnuns/allorigins for details.
   *
   * @param {string} url Fully qualified URL to fetch
   * @returns {Promise<any>} Parsed JSON response
   */
  async function fetchWithProxy(url) {
    const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxied);
    if (!response.ok) {
      throw new Error(`Network error ${response.status}`);
    }
    return await response.json();
  }

  /**
   * Attempt to retrieve fundamental data from the Financial Modeling Prep API.
   * This function is optional and will only execute if a key is provided.
   * It returns an object containing price, eps, bookValue, enterprise value,
   * EBITDA and dividend information. When unavailable or errors occur it
   * returns null.
   *
   * @param {string} symbol Stock ticker
   * @returns {Promise<object|null>}
   */
  async function fetchFromFMP(symbol) {
    if (!API_KEYS.fmp) return null;
    try {
      // Quote endpoint: includes price, EPS and P/E ratio (if available)
      const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${API_KEYS.fmp}`;
      const quoteData = await fetchWithProxy(quoteUrl);
      if (!Array.isArray(quoteData) || quoteData.length === 0) return null;
      const quote = quoteData[0];
      const price = parseFloat(quote.price);
      // Key metrics endpoint: includes book value per share, enterprise value, EBITDA, etc.
      const metricsUrl = `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?period=annual&limit=1&apikey=${API_KEYS.fmp}`;
      const metricsData = await fetchWithProxy(metricsUrl);
      const metrics = Array.isArray(metricsData) && metricsData.length > 0 ? metricsData[0] : {};
      const eps = parseFloat(metrics.EarningsPerShareTTM || quote.eps || quote.epsTTM);
      const bookValue = parseFloat(metrics.bookValuePerShare || metrics.bookValue);
      const enterpriseValue = parseFloat(metrics.enterpriseValue || quote.enterpriseValue);
      const ebitda = parseFloat(metrics.EBITDA || quote.ebitda);
      const dividendPerShare = parseFloat(metrics.dividendPerShare || quote.lastDiv);
      const dividendYield = parseFloat(metrics.dividendYield || quote.dividendYield);
      return { price, eps, bookValue, enterpriseValue, ebitda, dividendPerShare, dividendYield };
    } catch (err) {
      console.warn('FMP error:', err);
      return null;
    }
  }

  /**
   * Retrieve fundamental data from Alpha Vantage's OVERVIEW and GLOBAL_QUOTE
   * endpoints. Uses the provided API key. Returns null on failure or if
   * required fields are missing.
   *
   * @param {string} symbol Stock ticker
   * @returns {Promise<object|null>}
   */
  async function fetchFromAlpha(symbol) {
    if (!API_KEYS.alpha) return null;
    try {
      // Company overview (fundamentals)
      const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${API_KEYS.alpha}`;
      const overview = await fetchWithProxy(overviewUrl);
      // If the API returns an empty object or contains error keys, abort
      if (!overview || Object.keys(overview).length === 0 || overview.Note || overview['Error Message']) {
        return null;
      }
      // Global quote (latest price)
      const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEYS.alpha}`;
      const quoteData = await fetchWithProxy(quoteUrl);
      const quote = quoteData['Global Quote'];
      if (!quote || !quote['05. price']) return null;
      const price = parseFloat(quote['05. price']);
      const eps = parseFloat(overview.EPS);
      const bookValue = parseFloat(overview.BookValue);
      const enterpriseValue = parseFloat(overview.EnterpriseValue);
      const ebitda = parseFloat(overview.EBITDA);
      const evToEbitda = parseFloat(overview.EVToEBITDA);
      const dividendPerShare = parseFloat(overview.DividendPerShare);
      const dividendYield = parseFloat(overview.DividendYield);
      return { price, eps, bookValue, enterpriseValue, ebitda, evToEbitda, dividendPerShare, dividendYield };
    } catch (err) {
      console.warn('AlphaVantage error:', err);
      return null;
    }
  }

  /**
   * Lookup a ticker by querying multiple providers in sequence. Returns the
   * first successful response. Providers used: FMP (if API key present),
   * then Alpha Vantage. Additional providers could be added here.
   *
   * @param {string} symbol Stock ticker
   * @returns {Promise<object|null>} Fundamental data or null
   */
  async function lookupTicker(symbol) {
    const upper = symbol.toUpperCase();
    let data = null;
    if (API_KEYS.fmp) {
      data = await fetchFromFMP(upper);
    }
    if (!data && API_KEYS.alpha) {
      data = await fetchFromAlpha(upper);
    }
    return data;
  }

  /**
   * Compute valuation metrics given fundamental inputs. Handles missing values
   * gracefully by returning 'N/A'. Also applies a simple constant‑growth
   * dividend discount model with a zero growth assumption and an 8% discount
   * rate to estimate intrinsic value. This formula is: intrinsic =
   * dividendPerShare / discountRate.
   *
   * @param {object} data Fundamental data
   * @returns {object} Formatted metrics
   */
  function computeMetrics(data) {
    const price = typeof data.price === 'number' && !isNaN(data.price) ? data.price : null;
    const eps = typeof data.eps === 'number' && !isNaN(data.eps) ? data.eps : null;
    const bookValue = typeof data.bookValue === 'number' && !isNaN(data.bookValue) ? data.bookValue : null;
    const enterpriseValue = typeof data.enterpriseValue === 'number' && !isNaN(data.enterpriseValue) ? data.enterpriseValue : null;
    const ebitda = typeof data.ebitda === 'number' && !isNaN(data.ebitda) ? data.ebitda : null;
    const evToEbitda = typeof data.evToEbitda === 'number' && !isNaN(data.evToEbitda) ? data.evToEbitda : (enterpriseValue && ebitda ? enterpriseValue / ebitda : null);
    const dividendPerShare = typeof data.dividendPerShare === 'number' && !isNaN(data.dividendPerShare) ? data.dividendPerShare : null;
    const dividendYield = typeof data.dividendYield === 'number' && !isNaN(data.dividendYield) ? data.dividendYield : (dividendPerShare && price ? dividendPerShare / price : null);

    const pe = price && eps ? price / eps : null;
    const pb = price && bookValue ? price / bookValue : null;
    // Simplified dividend discount model: constant growth g=0, discount rate r=8%
    const discountRate = 0.08;
    const intrinsicDividend = dividendPerShare ? dividendPerShare / discountRate : null;

    const format = (value, digits = 2) => (typeof value === 'number' && isFinite(value) ? value.toFixed(digits) : 'N/A');
    return {
      price: format(price),
      eps: format(eps),
      pe: format(pe),
      bookValue: format(bookValue),
      pb: format(pb),
      evEbitda: format(evToEbitda),
      dividendPerShare: format(dividendPerShare),
      dividendYield: format(dividendYield, 4),
      intrinsicDividend: format(intrinsicDividend)
    };
  }

  /**
   * Render the results table given an array of rows. Each row contains a
   * ticker symbol and all computed metrics. The table is sorted by P/E ratio
   * in ascending order; tickers with unavailable P/E will appear at the end.
   *
   * @param {Array} rows
   */
  function renderResults(rows) {
    resultsBody.innerHTML = '';
    rows.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.ticker}</td>
        <td>${row.price}</td>
        <td>${row.eps}</td>
        <td>${row.pe}</td>
        <td>${row.bookValue}</td>
        <td>${row.pb}</td>
        <td>${row.evEbitda}</td>
        <td>${row.dividendPerShare}</td>
        <td>${row.dividendYield}</td>
        <td>${row.intrinsicDividend}</td>`;
      resultsBody.appendChild(tr);
    });
    resultsTable.style.display = rows.length > 0 ? 'block' : 'none';
  }

  // Set up click handler for the scan button
  scanBtn.addEventListener('click', async () => {
    // If the user provided an API key, override the default demo key for this
    // session.  Trim whitespace to avoid accidental spaces breaking the request.
    if (apiKeyInput && apiKeyInput.value && apiKeyInput.value.trim()) {
      API_KEYS.alpha = apiKeyInput.value.trim();
    }
    const rawInput = tickersInput.value;
    if (!rawInput || !rawInput.trim()) return;
    const symbols = rawInput.split(/[\,\s]+/).filter(Boolean);
    const rows = [];
    for (const ticker of symbols) {
      const fundamental = await lookupTicker(ticker);
      if (fundamental) {
        const metrics = computeMetrics(fundamental);
        rows.push({ ticker: ticker.toUpperCase(), ...metrics });
      }
    }
    // Sort by P/E ratio ascending; 'N/A' values (rendered as strings) push to the end
    rows.sort((a, b) => {
      const peA = a.pe === 'N/A' ? Infinity : parseFloat(a.pe);
      const peB = b.pe === 'N/A' ? Infinity : parseFloat(b.pe);
      return peA - peB;
    });
    renderResults(rows);
  });

  // Update the footer year dynamically
  const yearSpan = document.getElementById('year');
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear().toString();
  }
});
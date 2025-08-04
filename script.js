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

      // Reference to the optional button that performs a broad market scan. When
      // clicked this will fetch a large list of tickers from the NASDAQ
      // screener API and compute valuation metrics for each. Companies
      // trading below their intrinsic value (as calculated by a constant‑growth
      // dividend discount model) are returned. Because this can require
      // hundreds of API calls it is limited to a configurable number of
      // tickers and may take several seconds to complete.
      const fullScanBtn = document.getElementById('full-scan-btn');

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
    /*
     * Proxy requests through a serverless API route hosted on the same domain.
     * This avoids CORS issues by ensuring all requests originate from our
     * domain. The API endpoint simply fetches the target URL and returns
     * the raw response. See `/api/proxy.js` in the repository for details.
     */
    const proxied = `/api/proxy?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxied);
    if (!response.ok) {
      throw new Error(`Network error ${response.status}`);
    }
    // Try to parse JSON; fall back to text if parsing fails
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      return text;
    }
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

      /**
       * Scan a broad universe of tickers and update the results table in
       * real time as undervalued companies are discovered.  This helper
       * performs the same logic as scanAllUndervalued() but renders the
       * results incrementally instead of waiting for the full scan to
       * complete.  It sorts the accumulating list of undervalued stocks by
       * their price-to-intrinsic ratio on each update so that the most
       * undervalued names remain at the top.  This function uses the
       * existing renderResults() helper to display the rows.
       *
       * Note: Because this performs thousands of API requests when limit is
       * zero or very large, it can take a significant amount of time and
       * may exhaust free API limits.  Supplying your own API key via the
       * input field is strongly recommended.
       *
       * @param {number} limit Maximum number of tickers to scan.  Set to
       *   zero or a negative value to scan all available symbols.
       */
      async function scanAndDisplayUndervalued(limit = 0) {
        const tickers = await fetchNasdaqList(limit);
        const results = [];
        // Clear any previous results and hide the table initially
        resultsBody.innerHTML = '';
        resultsTable.style.display = 'none';
        for (const symbol of tickers) {
          try {
            const fundamental = await lookupTicker(symbol);
            if (!fundamental) continue;
            const price = typeof fundamental.price === 'number' && !isNaN(fundamental.price) ? fundamental.price : null;
            const dividend = typeof fundamental.dividendPerShare === 'number' && !isNaN(fundamental.dividendPerShare) ? fundamental.dividendPerShare : null;
            const discountRate = 0.08;
            const intrinsicVal = dividend ? dividend / discountRate : null;
            if (price != null && intrinsicVal != null && price < intrinsicVal) {
              const metrics = computeMetrics(fundamental);
              // Include numeric fields for sorting
              results.push({
                ticker: symbol.toUpperCase(),
                ...metrics,
                _priceNumeric: price,
                _intrinsicNumeric: intrinsicVal
              });
              // Sort by how undervalued: price / intrinsic ascending
              results.sort((a, b) => {
                const ratioA = a._priceNumeric / a._intrinsicNumeric;
                const ratioB = b._priceNumeric / b._intrinsicNumeric;
                return ratioA - ratioB;
              });
              // Prepare display rows without private fields
              const displayRows = results.map(({ ticker, price, eps, pe, bookValue, pb, evEbitda, dividendPerShare, dividendYield, intrinsicDividend }) => ({
                ticker,
                price,
                eps,
                pe,
                bookValue,
                pb,
                evEbitda,
                dividendPerShare,
                dividendYield,
                intrinsicDividend
              }));
              renderResults(displayRows);
            }
          } catch (err) {
            console.warn('Error scanning symbol', symbol, err);
          }
        }
      }

      /**
       * Fetch a list of ticker symbols from the NASDAQ screener API. This
       * endpoint returns approximately 7,000 actively traded U.S. companies
       * along with price and market cap information.  We only need the
       * symbol field for scanning.  If the request fails, an empty array is
       * returned.
       *
       * @param {number} limit Maximum number of tickers to return. Limiting the
       * number of symbols helps avoid exhausting rate limits on subsequent
       * fundamental data requests.
       * @returns {Promise<string[]>}
       */
      async function fetchNasdaqList(limit = 100) {
        try {
          // NASDAQ screener endpoint returns a JSON table of all US-listed stocks.
          // We pass limit=0 here so that the API returns the full dataset on the
          // server side; we handle slicing on the client.  If the API were to
          // respect a limit parameter this would avoid downloading unnecessary
          // data, but at the time of writing the parameter is ignored.
          const url = 'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=0';
          const data = await fetchWithProxy(url);
          const rows = data && data.data && data.data.table && Array.isArray(data.data.table.rows)
            ? data.data.table.rows
            : [];
          // Extract the symbol property and trim whitespace
          const symbols = rows.map(r => (r.symbol || '').trim()).filter(Boolean);
          // When the caller passes limit <= 0 or a non‑finite value, return the
          // entire list of symbols.  Otherwise slice to the requested count.
          if (!limit || !isFinite(limit) || limit <= 0) {
            return symbols;
          }
          return symbols.slice(0, limit);
        } catch (err) {
          console.warn('Unable to fetch NASDAQ ticker list:', err);
          return [];
        }
      }

      /**
       * Scan a broad universe of tickers and return only those that appear
       * undervalued relative to their estimated intrinsic value.  For each
       * symbol a fundamental lookup is performed via the existing lookupTicker
       * helper, metrics are computed, and then filtered by price < intrinsic
       * value.  Results are sorted by the ratio price / intrinsicValue in
       * ascending order so that the most undervalued stocks appear first.
       *
       * Note: Without a valid API key the Alpha Vantage demo key only
       * provides data for a handful of symbols (IBM and MSFT).  To scan
       * effectively you must supply your own key via the input field or
       * modify the API_KEYS object.
       *
       * @param {number} limit Maximum number of tickers to scan
       * @returns {Promise<Array>} Array of rows matching the renderResults
       * format
       */
      async function scanAllUndervalued(limit = 100) {
        const tickers = await fetchNasdaqList(limit);
        const results = [];
        for (const symbol of tickers) {
          try {
            const fundamental = await lookupTicker(symbol);
            if (!fundamental) continue;
            const price = typeof fundamental.price === 'number' && !isNaN(fundamental.price) ? fundamental.price : null;
            const dividend = typeof fundamental.dividendPerShare === 'number' && !isNaN(fundamental.dividendPerShare) ? fundamental.dividendPerShare : null;
            // Use the same 8% discount rate as computeMetrics to derive an intrinsic value
            const discountRate = 0.08;
            const intrinsicVal = dividend ? dividend / discountRate : null;
            if (price != null && intrinsicVal != null && price < intrinsicVal) {
              // Format the metrics using existing helper for display
              const metrics = computeMetrics(fundamental);
              results.push({
                ticker: symbol.toUpperCase(),
                ...metrics,
                _priceNumeric: price,
                _intrinsicNumeric: intrinsicVal
              });
            }
          } catch (err) {
            console.warn('Error scanning symbol', symbol, err);
          }
        }
        // Sort by how undervalued the company is: price/intrinsic ascending
        results.sort((a, b) => {
          const ratioA = (a._priceNumeric && a._intrinsicNumeric) ? (a._priceNumeric / a._intrinsicNumeric) : Infinity;
          const ratioB = (b._priceNumeric && b._intrinsicNumeric) ? (b._priceNumeric / b._intrinsicNumeric) : Infinity;
          return ratioA - ratioB;
        });
        // Strip out the numeric helper fields before returning
        return results.map(({ ticker, price, eps, pe, bookValue, pb, evEbitda, dividendPerShare, dividendYield, intrinsicDividend }) => ({
          ticker,
          price,
          eps,
          pe,
          bookValue,
          pb,
          evEbitda,
          dividendPerShare,
          dividendYield,
          intrinsicDividend
        }));
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

      // Attach handler for the Full Market Scan button.  This triggers a
      // comprehensive scan over a broad universe of tickers and updates the
      // results table incrementally as undervalued companies are found.  The
      // button is disabled while the scan runs, and its label changes to
      // indicate progress.  We scan all available symbols when limit <= 0.
      if (fullScanBtn) {
        fullScanBtn.addEventListener('click', async () => {
          // Use the user‑supplied API key if provided
          if (apiKeyInput && apiKeyInput.value && apiKeyInput.value.trim()) {
            API_KEYS.alpha = apiKeyInput.value.trim();
          }
          const originalText = fullScanBtn.textContent;
          fullScanBtn.textContent = 'Scanning...';
          fullScanBtn.disabled = true;
          try {
            await scanAndDisplayUndervalued(0);
          } finally {
            fullScanBtn.textContent = originalText;
            fullScanBtn.disabled = false;
          }
        });
      }

  // Update the footer year dynamically
  const yearSpan = document.getElementById('year');
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear().toString();
  }
});
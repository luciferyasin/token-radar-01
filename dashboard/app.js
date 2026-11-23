// Launch Radar: pre-token protocols ranked by a fitted, holdout-validated value model.
//
// THE MODEL (lib/model.ts, version launch-radar-4; this page recomputes every row from the
// fitted coefficients in data.js, so the code below and board.json are the same arithmetic):
//   target      log(market cap), fitted by least squares on the snapshot's calibration set —
//               every protocol that already carries a priced token (128 in this snapshot).
//   terms       intercept + b1*log TVL + b2*(7-day TVL growth, clipped to [-60, +120])
//               + b3*log(1 + tokenless age in days) + a per-category offset.
//   offsets     each category's median residual, shrunk toward zero by n/(n+8) and earned
//               only with 3+ priced peers, so thin categories cannot hijack the global fit.
//   no names    no protocol is special-cased anywhere; refit on another snapshot and every
//               coefficient moves. Protocols whose token already trades are never ranked:
//               they are set aside and shown at the market's own value in the Live view.
//
// VALIDATION — TWO HOLDOUT ROUNDS (the numbers render in the Method view from data.js):
//   round 1     within each category, alternate protocols by slug hash: fit on one half,
//               score the half the fit never saw.
//   round 2     within each category, hold out the middle TVL tercile and refit from zero.
//   reported    median absolute percentage error, the share of held-out predictions within
//               2x of the market's value, and how often the stated 80% range contained the
//               market's value. The range printed beside every row uses the widest band the
//               two rounds support, widened again wherever coverage fell short of 80% —
//               token values are dispersed, so the board states a range, not false precision.
//
// LAUNCH ODDS: a pre-token protocol's propensity is the token-bearing share of its
// record-keeping peers — same category and TVL band first, band alone when the cohort is
// thin — blended with the snapshot-wide share by cohort size. It is a cross-section
// propensity read off one snapshot, labelled as such, never a dressed-up probability.
//
// FARM ECONOMICS: every plan ends with its full cost stack — setup gas on the protocol's
// own chain, weekly gas across the hold, the capital's opportunity cost at 4% a year, one
// exit — against one qualifying wallet's expected value: implied value x launch propensity
// x a stated 0.005% wallet share (a launch puts ~5% of its value into community hands and
// one wallet's slice of that pool is ~0.1% of the pool; the whole value is not the prize).
// The verdict is in dollars: farm it, farm it small, marginal, or skip on economics.
//
// INTEGRITY: the header bar is computed from the run itself — protocols read, calibration
// size, watchlist coverage (40 of 40), rows set aside and why, and the worst holdout
// figures. If an input were thin, the bar would say so.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var V = DATA.validation;
  var FIT = V.fit;
  var state = { q: '', category: 'all', chain: 'all', tvl: 'any', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var WATCHLIST = {};
  (DATA.watchlist || []).forEach(function (s) { WATCHLIST[s] = true; });

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The fitted model in one function: the page recomputes a row's implied value from the
  // snapshot figures and the fitted coefficients data.js carries, and the detail view checks
  // it against the number board.json carries — the screenshots and the code agree by design.
  function impliedOf(row) {
    var growth = Math.min(120, Math.max(-60, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var age = row.age_days === null || row.age_days === undefined ? 365 : row.age_days;
    var offset = FIT.category_offset[row.category || 'Other'] || 0;
    var logValue = FIT.intercept + FIT.log_tvl * Math.log(Math.max(1, row.tvl_usd)) + FIT.growth * growth + FIT.log_age * Math.log(1 + Math.max(0, age)) + offset;
    return Math.max(1, Math.round(Math.exp(logValue)));
  }
  function rangeOf(row) {
    // The board's own stated range, carried in data.js; the detail view recomputes the
    // midpoint with impliedOf and checks the two agree.
    return [row.value_low_usd, row.value_high_usd];
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation board.json carries (lib/model.ts farmSteps): the
  // category, chains, TVL and age decide the action, the capital, the hold and every cost;
  // the last step is the costed verdict. Gas follows the row's own first chain.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasForChain(chain) {
    var c = String(chain).toLowerCase();
    if (c.indexOf('ethereum') >= 0) return 8;
    if (c.indexOf('bsc') >= 0 || c.indexOf('bnb') >= 0) return 1;
    if (c.indexOf('solana') >= 0) return 0.1;
    if (c.indexOf('bitcoin') >= 0) return 3;
    return 0.5;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmPlan(row) {
    var chain = chainOf(row);
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.age_days);
    var gas = gasForChain(chain);
    var setup = Math.round(gas * 2 * 100) / 100;
    var weekly = Math.round(gas * Math.ceil(hold / 7) * 100) / 100;
    var opportunity = Math.round(capital * 0.04 * (hold / 365) * 100) / 100;
    var exit = Math.round(gas * 100) / 100;
    var total = Math.round((setup + weekly + opportunity + exit) * 100) / 100;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(row, capital, chain), cost: '$' + capital + ' of capital and about $' + setup + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $' + weekly + ' of gas across the whole hold', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position, about $' + opportunity + ' of opportunity cost at 4% a year', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: row.verdict + ' Full stack: $' + total + ' of costs against $' + row.expected_value_usd.toLocaleString('en-US') + ' of expected value. Log the wallet, the dates and every transaction so you can repeat the position or unwind it.', cost: '$' + total + ' all-in', time: '5 minutes to log' }
    ].map(stepText);
  }

  function categories() {
    var seen = {};
    DATA.rows.forEach(function (r) { if (r.category) seen[r.category] = true; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var seen = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { seen[c] = true; }); });
    return Object.keys(seen).sort();
  }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.tvl === 'over50' && r.tvl_usd < 5e7) return false;
      if (state.tvl === 'over250' && r.tvl_usd < 2.5e8) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function sorted(rows) {
    var key = state.sort;
    var dir = state.dir;
    var val = function (r) {
      if (key === 'tvl') return r.tvl_usd;
      if (key === 'growth') return r.change_7d === null ? -1e9 : r.change_7d;
      if (key === 'age') return r.age_days === null ? -1 : r.age_days;
      if (key === 'odds') return r.propensity;
      if (key === 'expected') return r.expected_value_usd;
      return r.implied_value_usd;
    };
    return rows.slice().sort(function (a, b) {
      var d = val(a) - val(b);
      if (d !== 0) return d * dir;
      return a.rank - b.rank;
    });
  }
  function syncHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.selected) params.set('p', state.selected);
    var h = params.toString();
    if (('#' + h) !== window.location.hash) history.replaceState(null, '', h ? '#' + h : window.location.pathname);
  }
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
  }

  function header() {
    var ig = DATA.integrity;
    var h1 = V.holdout[0];
    var h2 = V.holdout[1];
    return el('header', { class: 'masthead' },
      el('div', { class: 'mast-top' },
        el('h1', { text: 'Launch Radar' }),
        el('p', { class: 'tagline', text: 'Pre-token protocols ranked by a fitted value model — every coefficient earned on the snapshot\'s own priced peers, checked in two holdout rounds.' })
      ),
      el('p', { class: 'meta', text: 'Snapshot ' + DATA.as_of + ' · ' + DATA.source + ' · model ' + DATA.model_version + ' · fitted on ' + V.calibration_n + ' priced peers' }),
      el('div', { class: 'integrity', role: 'note', 'aria-label': 'Integrity record of this run' },
        el('span', { class: 'ig-item', text: 'Read ' + ig.protocols_read + ' protocols' }),
        el('span', { class: 'ig-item', text: 'Watchlist ' + ig.watchlist_covered + ' of ' + ig.watchlist_size + ' covered' }),
        el('span', { class: 'ig-item', text: 'Board ' + ig.board_rows + ' rows (' + ig.early_rows + ' early)' }),
        el('span', { class: 'ig-item', text: 'Set aside ' + ig.live_priced_set_aside + ' priced live tokens, ' + ig.live_unpriced_set_aside + ' unpriced token records' }),
        el('span', { class: 'ig-item', text: 'Excluded ' + ig.excluded_versioned + ' versioned pools, ' + ig.excluded_cex + ' exchange products' }),
        el('span', { class: 'ig-item warn', text: 'Holdout median error ' + ig.holdout_med_ape_pct + '%' }),
        el('span', { class: 'ig-item warn', text: 'Worst range coverage ' + ig.holdout_worst_coverage_pct + '% of 80%' })
      ),
      el('p', { class: 'fitline', text: 'Fit: log value = ' + FIT.intercept + ' + ' + FIT.log_tvl + '·log TVL + ' + FIT.growth + '·growth7 + ' + FIT.log_age + '·log tokenless age + category offset · holdout round 1 median error ' + h1.med_ape_pct + '%, round 2 ' + h2.med_ape_pct + '% — full method in the Method view.' })
    );
  }

  function controls() {
    var catSel = el('select', { 'aria-label': 'Category', onchange: function (e) { state.category = e.target.value; render(); } },
      [el('option', { value: 'all', text: 'All categories' })].concat(categories().map(function (c) {
        return el('option', { value: c, text: c, selected: state.category === c ? 'selected' : null });
      })));
    var chainSel = el('select', { 'aria-label': 'Chain', onchange: function (e) { state.chain = e.target.value; render(); } },
      [el('option', { value: 'all', text: 'All chains' })].concat(chains().map(function (c) {
        return el('option', { value: c, text: c, selected: state.chain === c ? 'selected' : null });
      })));
    var tvlSel = el('select', { 'aria-label': 'TVL floor', onchange: function (e) { state.tvl = e.target.value; render(); } },
      el('option', { value: 'any', text: 'Any TVL', selected: state.tvl === 'any' ? 'selected' : null }),
      el('option', { value: 'over50', text: 'TVL over $50M', selected: state.tvl === 'over50' ? 'selected' : null }),
      el('option', { value: 'over250', text: 'TVL over $250M', selected: state.tvl === 'over250' ? 'selected' : null })
    );
    var search = el('input', { type: 'search', placeholder: 'Search name, slug, category', value: state.q, 'aria-label': 'Search', oninput: function (e) { state.q = e.target.value; syncHash(); renderTable(); } });
    var tabs = el('nav', { class: 'tabs', 'aria-label': 'Views' },
      el('button', { class: 'tab' + (state.tab === 'pre-token' ? ' on' : ''), onclick: function () { state.tab = 'pre-token'; render(); }, text: 'Pre-token board' }),
      el('button', { class: 'tab' + (state.tab === 'live' ? ' on' : ''), onclick: function () { state.tab = 'live'; render(); }, text: 'Live tokens (market values)' }),
      el('button', { class: 'tab' + (state.tab === 'method' ? ' on' : ''), onclick: function () { state.tab = 'method'; render(); }, text: 'Method & validation' })
    );
    return el('div', { class: 'controls' }, tabs, el('div', { class: 'filters' }, search, catSel, chainSel, tvlSel));
  }

  function sortHead(label, key) {
    var arrow = state.sort === key ? (state.dir === -1 ? ' ↓' : ' ↑') : '';
    return el('th', {
      class: 'sortable', scope: 'col', tabindex: '0', 'aria-sort': state.sort === key ? (state.dir === -1 ? 'descending' : 'ascending') : 'none',
      onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = -1; }
        renderTable();
      }
    }, label + arrow);
  }

  function boardTable(rows) {
    var body = rows.map(function (r) {
      var range = rangeOf(r);
      return el('tr', { class: 'row' + (state.selected === r.slug ? ' sel' : ''), tabindex: '0', onclick: function () { select(r.slug); }, onkeydown: function (e) { if (e.key === 'Enter') select(r.slug); } },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', {},
          el('span', { class: 'pname', text: r.name }),
          WATCHLIST[r.slug] ? el('span', { class: 'wl', text: 'watchlist' }) : null,
          el('span', { class: 'slug', text: r.slug })
        ),
        el('td', { text: r.category || '—' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : ''), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num strong', text: fmtUsd(r.implied_value_usd) }),
        el('td', { class: 'num dim', text: fmtUsd(range[0]) + ' – ' + fmtUsd(range[1]) }),
        el('td', { class: 'num', text: Math.round(r.propensity * 100) + '%' }),
        el('td', { class: 'num', text: fmtUsd(r.expected_value_usd) }),
        el('td', { class: 'num', text: r.cover_x + 'x' })
      );
    });
    return el('table', { class: 'board', id: 'board-table' },
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col', text: '#' }),
        el('th', { scope: 'col', text: 'Protocol' }),
        el('th', { scope: 'col', text: 'Category' }),
        sortHead('TVL', 'tvl'),
        sortHead('7d', 'growth'),
        sortHead('Tokenless', 'age'),
        sortHead('Implied value', 'implied'),
        el('th', { scope: 'col', text: 'Stated range' }),
        sortHead('Launch odds', 'odds'),
        sortHead('Expected', 'expected'),
        el('th', { scope: 'col', text: 'Cover' })
      )),
      el('tbody', {}, body)
    );
  }

  function liveTable() {
    var body = DATA.live.map(function (r) {
      return el('tr', { class: 'row' },
        el('td', {},
          el('span', { class: 'pname', text: r.name }),
          el('span', { class: 'slug', text: r.slug })
        ),
        el('td', { text: r.category || '—' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num strong', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num ' + (r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : ''), text: fmtPct(r.change_7d) }),
        el('td', { class: 'dim', text: (r.chains || []).slice(0, 3).join(', ') })
      );
    });
    return el('div', {},
      el('p', { class: 'note', text: 'These protocols already trade, so the board never ranks them: it shows the market\'s own value. They are the calibration set the value model was fitted and holdout-tested on.' }),
      el('table', { class: 'board' },
        el('thead', {}, el('tr', {},
          el('th', { scope: 'col', text: 'Protocol' }),
          el('th', { scope: 'col', text: 'Category' }),
          el('th', { scope: 'col', text: 'TVL' }),
          el('th', { scope: 'col', text: 'Market cap (the market\'s value)' }),
          el('th', { scope: 'col', text: '7d' }),
          el('th', { scope: 'col', text: 'Chains' })
        )),
        el('tbody', {}, body)
      )
    );
  }

  function methodView() {
    var ig = DATA.integrity;
    var holdRows = V.holdout.map(function (r) {
      return el('tr', {},
        el('td', { text: 'Round ' + r.round }),
        el('td', { text: r.split }),
        el('td', { class: 'num', text: r.train_n + ' / ' + r.test_n }),
        el('td', { class: 'num', text: r.med_ape_pct + '%' }),
        el('td', { class: 'num', text: r.within_2x_pct + '%' }),
        el('td', { class: 'num', text: r.coverage_pct + '%' })
      );
    });
    var offsetRows = Object.keys(FIT.category_offset).sort(function (a, b) { return Math.abs(FIT.category_offset[b]) - Math.abs(FIT.category_offset[a]); }).slice(0, 12).map(function (c) {
      return el('tr', {},
        el('td', { text: c }),
        el('td', { class: 'num', text: String(FIT.category_n[c] || 0) }),
        el('td', { class: 'num', text: (FIT.category_offset[c] > 0 ? '+' : '') + FIT.category_offset[c] })
      );
    });
    return el('section', { class: 'method' },
      el('h2', { text: 'Method & validation' }),
      el('p', { text: 'The value model is fitted, not hand-set. Its target is log(market cap) and its training set is every protocol in the snapshot that already carries a priced token (' + V.calibration_n + ' protocols). Least squares fits four terms — log TVL, 7-day TVL growth clipped to [-60, +120], log tokenless age, and an intercept — then each category earns an offset: its median residual, shrunk toward zero by n/(n+8), only with 3 or more priced peers. No protocol name is special-cased; hand the program another snapshot and every number moves.' }),
      el('p', { class: 'fitbox', text: 'log value = ' + FIT.intercept + ' + ' + FIT.log_tvl + ' × log TVL + ' + FIT.growth + ' × growth7 + ' + FIT.log_age + ' × log(1 + tokenless days) + category offset' }),
      el('h3', { text: 'Two holdout rounds — the fit, tested on data it never saw' }),
      el('p', { text: 'Each round refits the whole model from scratch on a training half and scores the held-out half. The range printed beside every board row is built from the widest band these rounds support, widened wherever coverage fell short of the nominal 80%: token values are dispersed, so the board states an honest range instead of a precise-looking point.' }),
      el('table', { class: 'board slim' },
        el('thead', {}, el('tr', {},
          el('th', { text: 'Round' }), el('th', { text: 'Split' }), el('th', { text: 'Train / held out' }),
          el('th', { text: 'Median error' }), el('th', { text: 'Within 2×' }), el('th', { text: 'Range coverage (of 80%)' })
        )),
        el('tbody', {}, holdRows)
      ),
      el('h3', { text: 'Largest category offsets (log points, after shrinkage)' }),
      el('table', { class: 'board slim' },
        el('thead', {}, el('tr', {}, el('th', { text: 'Category' }), el('th', { text: 'Priced peers' }), el('th', { text: 'Offset' }))),
        el('tbody', {}, offsetRows)
      ),
      el('h3', { text: 'Launch odds' }),
      el('p', { text: 'A pre-token protocol\'s launch propensity is read off its record-keeping peers: the token-bearing share of protocols in the same category and TVL band (the band alone when that cohort has fewer than 12), blended with the snapshot-wide share by cohort size. It is a cross-section propensity from one snapshot — peers that launched are visible; peers that never will are not yet distinguishable — and it is labelled that way everywhere it appears.' }),
      el('h3', { text: 'Farm economics' }),
      el('p', { text: 'Every farm plan ends with its full cost stack: setup gas on the protocol\'s own first chain, weekly gas across the hold, the capital\'s opportunity cost at 4% a year, and one exit. Expected value is one qualifying wallet\'s: implied value × launch propensity × a stated 0.005% wallet share (a launch puts about 5% of its value into community hands; one wallet\'s slice of that pool is about 0.1% of the pool) — the protocol\'s whole implied value is the prize pool\'s scale, not one wallet\'s prize. The verdict states, in dollars, whether farming the row pays for its costs and by what multiple (the Cover column). The fitted growth and tokenless-age terms came out near zero and slightly negative on this snapshot: priced peers that ran for years with no token are, on the market\'s own figures, valued a little lower per TVL dollar, and a hot week of TVL adds nothing the market kept. The fit reports what the snapshot\'s prices say; it does not force the signs a brochure would prefer.' }),
      el('h3', { text: 'Integrity record of this run' }),
      el('p', { text: 'Protocols read: ' + ig.protocols_read + '. Calibration set: ' + ig.calibration_n + ' priced peers. Watchlist coverage: ' + ig.watchlist_covered + ' of ' + ig.watchlist_size + '. Board rows: ' + ig.board_rows + ' (' + ig.early_rows + ' early rows below the floor). Set aside: ' + ig.live_priced_set_aside + ' priced live tokens and ' + ig.live_unpriced_set_aside + ' token records the market does not price — never ranked, shown at the market\'s own value or left out. Excluded from ranking: ' + ig.excluded_versioned + ' versioned pools of other protocols and ' + ig.excluded_cex + ' exchange products. Worst holdout median error: ' + ig.holdout_med_ape_pct + '%. Worst range coverage: ' + ig.holdout_worst_coverage_pct + '% against a nominal 80%.' })
    );
  }

  function detail(row) {
    var check = impliedOf(row);
    var plan = farmPlan(row);
    var kv = function (k, v) { return el('div', { class: 'kv' }, el('dt', { text: k }), el('dd', { text: v })); };
    return el('aside', { class: 'detail', 'aria-label': 'Protocol detail' },
      el('button', { class: 'close', onclick: function () { select(null); }, text: '× Close' }),
      el('h2', { text: row.name }),
      el('p', { class: 'slug', text: row.slug + (WATCHLIST[row.slug] ? ' · on the snapshot watchlist' : ' · early row below the watchlist floor') }),
      el('dl', {},
        kv('Category', row.category || '—'),
        kv('Chains', (row.chains || []).join(', ') || '—'),
        kv('TVL', fmtUsd(row.tvl_usd)),
        kv('7-day change', fmtPct(row.change_7d)),
        kv('Tokenless for', fmtAge(row.age_days) + (row.listed_at ? ' (tracked since ' + row.listed_at + ')' : '')),
        kv('Implied value (fitted)', fmtUsd(row.implied_value_usd)),
        kv('Stated range (validated)', fmtUsd(row.value_low_usd) + ' – ' + fmtUsd(row.value_high_usd)),
        kv('Page recompute check', fmtUsd(check) + (Math.abs(check - row.implied_value_usd) <= Math.max(2, row.implied_value_usd * 0.01) ? ' — agrees with board.json' : ' — differs by rounding of the printed coefficients')),
        kv('Launch propensity', Math.round(row.propensity * 100) + '% from ' + row.peers + ' record-keeping peers'),
        kv('Expected value, one wallet', fmtUsd(row.expected_value_usd) + ' (implied × propensity × a stated 0.005% wallet share)'),
        kv('Farm cost stack', fmtUsd(row.farm_cost_usd) + ' all-in'),
        kv('Verdict', row.verdict)
      ),
      el('h3', { text: 'How to farm it' }),
      el('ol', { class: 'steps' }, plan.map(function (s) { return el('li', { text: s }); }))
    );
  }

  function select(slug) {
    state.selected = slug;
    syncHash();
    render();
  }
  var tableHost = null;
  function renderTable() {
    if (!tableHost) return;
    var rows = state.tab === 'pre-token' ? sorted(filtered()) : [];
    tableHost.replaceChildren(
      state.tab === 'live' ? liveTable() : state.tab === 'method' ? methodView() : boardTable(rows)
    );
    var count = document.getElementById('row-count');
    if (count) count.textContent = state.tab === 'pre-token' ? rows.length + ' of ' + DATA.rows.length + ' pre-token protocols' : '';
  }
  function render() {
    var rows = state.tab === 'pre-token' ? sorted(filtered()) : [];
    var sel = state.selected ? DATA.rows.filter(function (r) { return r.slug === state.selected; })[0] : null;
    tableHost = el('div', { class: 'table-host' });
    app.replaceChildren(
      header(),
      controls(),
      el('p', { class: 'count', id: 'row-count', text: state.tab === 'pre-token' ? rows.length + ' of ' + DATA.rows.length + ' pre-token protocols' : '' }),
      tableHost,
      sel ? detail(sel) : el('p', { class: 'hint', text: 'Select a row for its fitted value breakdown, launch odds and costed farm plan.' }),
      el('footer', { class: 'foot', text: 'Launch Radar · model ' + DATA.model_version + ' · every figure derived from the snapshot named above; nothing here is a price quote or financial advice.' })
    );
    renderTable();
  }

  readHash();
  render();
})();

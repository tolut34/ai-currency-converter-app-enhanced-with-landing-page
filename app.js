// Valut — Client Side Interactive Frontend Engine
document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // 1. Core Currency Configuration & Cache
    // ----------------------------------------------------
    const currencyData = {
        EUR: { symbol: '€', name: 'Euro', rate: 1.0, icon: 'euro' },
        USD: { symbol: '$', name: 'US Dollar', rate: 1.0924, icon: 'dollar-sign' },
        GBP: { symbol: '£', name: 'British Pound', rate: 0.8582, icon: 'pound-sign' },
        JPY: { symbol: '¥', name: 'Japanese Yen', rate: 170.45, icon: 'japanese-yen' },
        AUD: { symbol: 'A$', name: 'Australian Dollar', rate: 1.6321, icon: 'dollar-sign' },
        CAD: { symbol: 'C$', name: 'Canadian Dollar', rate: 1.4878, icon: 'dollar-sign' },
        CHF: { symbol: 'CHF', name: 'Swiss Franc', rate: 0.9854, icon: 'coins' },
        CNY: { symbol: '¥', name: 'Chinese Yuan', rate: 7.9125, icon: 'coins' }
    };

    let favorites = ['EUR/USD', 'GBP/USD', 'USD/JPY'];
    let conversionsCount = 24;
    let conversionHistory = [];

    // ----------------------------------------------------
    // 2. Navigation View Switches & Layout Placement
    // ----------------------------------------------------
    const dateEl = document.getElementById('current-date');
    if (dateEl) {
        try {
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            dateEl.textContent = new Date().toLocaleDateString('en-US', options);
        } catch (e) {
            console.error("Error setting date:", e);
        }
    }

    const navItems = document.querySelectorAll('.nav-item');
    const viewPanes = document.querySelectorAll('.view-pane');
    const pageTitle = document.querySelector('.page-title');

    function manageConverterWidget(targetView) {
        try {
            const widget = document.querySelector('.exchange-widget');
            if (!widget) return;

            if (targetView === 'converter') {
                const placeholder = document.getElementById('converter-focused-placeholder');
                if (placeholder && widget.parentNode !== placeholder) {
                    placeholder.appendChild(widget);
                }
            } else {
                const dashboardParent = document.querySelector('.grid-layout-left');
                const chartWidget = document.querySelector('.analytics-chart-widget');
                if (dashboardParent && widget.parentNode !== dashboardParent) {
                    if (chartWidget) {
                        dashboardParent.insertBefore(widget, chartWidget);
                    } else {
                        dashboardParent.appendChild(widget);
                    }
                }
            }
        } catch (e) {
            console.error("Error repositioning converter widget:", e);
        }
    }

    function switchView(viewName) {
        try {
            manageConverterWidget(viewName);

            navItems.forEach(item => {
                if (item.getAttribute('data-view') === viewName) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });

            viewPanes.forEach(pane => {
                if (pane.id === `view-${viewName}`) {
                    pane.classList.add('active');
                } else {
                    pane.classList.remove('active');
                }
            });

            if (pageTitle) {
                if (viewName === 'dashboard') pageTitle.textContent = 'Dashboard Overview';
                else if (viewName === 'converter') pageTitle.textContent = 'Exchange Station';
                else if (viewName === 'history') pageTitle.textContent = 'Conversion History';
                else if (viewName === 'analytics') pageTitle.textContent = 'Exchange Analytics';
                else if (viewName === 'settings') pageTitle.textContent = 'System Settings';
                else if (viewName === 'help') pageTitle.textContent = 'Support Center';
            }

            if (viewName === 'dashboard' || viewName === 'analytics') {
                initChart(viewName);
            }
            
            updateConversionDisplayGlobal();
        } catch (err) {
            console.error("Error switching view:", err);
        }
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetView = item.getAttribute('data-view');
            if (targetView) switchView(targetView);
        });
    });

    const seeAllBtn = document.getElementById('btn-see-all-history');
    if (seeAllBtn) {
        seeAllBtn.addEventListener('click', () => switchView('history'));
    }

    const favoritesCard = document.getElementById('card-btn-favorites');
    if (favoritesCard) {
        favoritesCard.addEventListener('click', () => {
            try {
                const favCont = document.getElementById('favorites-container');
                if (favCont) {
                    const target = favCont.querySelector('.fav-pill');
                    if (target) {
                        const pair = target.getAttribute('data-pair');
                        const [from, to] = pair.split('/');
                        const fromSelect = document.getElementById('from-currency');
                        const toSelect = document.getElementById('to-currency');
                        if (fromSelect && toSelect) {
                            fromSelect.value = from;
                            toSelect.value = to;
                            updateConversionDisplayGlobal();
                            updateChartPairName();
                            updateChartData();
                        }
                    }
                }
            } catch (err) {
                console.error("Error processing favorite card click:", err);
            }
            switchView('dashboard');
        });
    }

    // ----------------------------------------------------
    // 3. Theme Toggle Functionality (Light / Dark)
    // ----------------------------------------------------
    const themeToggleBtn = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            try {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'light' ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
                updateThemeIcon(newTheme);
            } catch (e) {
                console.error("Error toggling theme:", e);
            }
        });
    }

    function updateThemeIcon(theme) {
        if (!themeToggleBtn) return;
        try {
            const icon = themeToggleBtn.querySelector('i');
            if (icon) {
                if (theme === 'light') {
                    icon.setAttribute('data-lucide', 'sun');
                    themeToggleBtn.style.color = '#5334F5';
                } else {
                    icon.setAttribute('data-lucide', 'moon');
                    themeToggleBtn.style.color = '';
                }
            }
            if (window.lucide) window.lucide.createIcons();
        } catch (e) {
            console.error("Error setting theme icon:", e);
        }
    }

    // ----------------------------------------------------
    // 4. Async Backend Rates Synchronization & Fallbacks
    // ----------------------------------------------------
    async function fetchLatestRates(base = 'EUR') {
        try {
            // Attempt to query FastAPI backend proxy first
            const response = await fetch(`/api/rates?base=${base}`);
            const data = await response.json();
            if (data.success && data.rates) {
                syncRatesToConfig(data.rates, base);
                return;
            }
        } catch (err) {
            console.warn("FastAPI server offline. Fetching rates directly from public API...");
        }

        // Offline Fallback - Query public Frankfurter API directly
        try {
            const response = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}`);
            const data = await response.json();
            if (data.rates) {
                syncRatesToConfig(data.rates, base);
            }
        } catch (fallbackErr) {
            console.error("Public API fallback failed. Utilizing hardcoded rate defaults:", fallbackErr);
        }
    }

    function syncRatesToConfig(rates, base) {
        Object.keys(rates).forEach(sym => {
            if (currencyData[sym]) {
                currencyData[sym].rate = rates[sym];
            }
        });
        if (currencyData[base]) {
            currencyData[base].rate = 1.0;
        }
    }

    function getExchangeRate(from, to) {
        if (from === to) return 1.0;
        const fromRate = currencyData[from]?.rate || 1.0;
        const toRate = currencyData[to]?.rate || 1.0;
        return toRate / fromRate;
    }

    // ----------------------------------------------------
    // 5. Global Converter Sync Logic
    // ----------------------------------------------------
    function updateConversionDisplayGlobal() {
        try {
            const widget = document.querySelector('.exchange-widget');
            if (!widget) return;

            const fromAmount = widget.querySelector('#from-amount');
            const toAmount = widget.querySelector('#to-amount');
            const fromCurrency = widget.querySelector('#from-currency');
            const toCurrency = widget.querySelector('#to-currency');
            
            const rateTextVal = widget.querySelector('.rate-val');
            const fromLbl = widget.querySelector('.from-lbl');
            const toLbl = widget.querySelector('.to-lbl');
            const favoriteBtn = widget.querySelector('#favorite-pair-btn');

            if (!fromCurrency || !toCurrency) return;

            const from = fromCurrency.value;
            const to = toCurrency.value;
            const rate = getExchangeRate(from, to);

            if (fromLbl) fromLbl.textContent = from;
            if (toLbl) toLbl.textContent = to;
            if (rateTextVal) rateTextVal.textContent = rate.toFixed(4);

            if (fromAmount && toAmount) {
                const amount = parseFloat(fromAmount.value) || 0;
                const result = amount * rate;
                toAmount.value = result.toFixed(2);
            }

            const currentPair = `${from}/${to}`;
            if (favoriteBtn) {
                if (favorites.includes(currentPair)) {
                    favoriteBtn.classList.add('active');
                } else {
                    favoriteBtn.classList.remove('active');
                }
            }

            // Sync custom dropdown triggers and highlighting
            syncCustomDropdowns();
        } catch (err) {
            console.error("Error in updateConversionDisplayGlobal:", err);
        }
    }

    function getFlagSvg(currency) {
        const flagSvgs = {
            USD: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius: 50%; vertical-align: middle;">
  <clipPath id="clip-USD"><circle cx="12" cy="12" r="12" /></clipPath>
  <g clip-path="url(#clip-USD)">
    <rect width="24" height="24" fill="#B22234"/>
    <rect y="1.84" width="24" height="1.84" fill="#FFFFFF"/>
    <rect y="5.53" width="24" height="1.84" fill="#FFFFFF"/>
    <rect y="9.23" width="24" height="1.84" fill="#FFFFFF"/>
    <rect y="12.92" width="24" height="1.84" fill="#FFFFFF"/>
    <rect y="16.61" width="24" height="1.84" fill="#FFFFFF"/>
    <rect y="20.3" width="24" height="1.84" fill="#FFFFFF"/>
    <rect width="13" height="12" fill="#3C3B6E"/>
    <circle cx="3" cy="3" r="0.7" fill="#FFFFFF"/>
    <circle cx="6" cy="3" r="0.7" fill="#FFFFFF"/>
    <circle cx="9" cy="3" r="0.7" fill="#FFFFFF"/>
    <circle cx="4.5" cy="5.5" r="0.7" fill="#FFFFFF"/>
    <circle cx="7.5" cy="5.5" r="0.7" fill="#FFFFFF"/>
    <circle cx="3" cy="8" r="0.7" fill="#FFFFFF"/>
    <circle cx="6" cy="8" r="0.7" fill="#FFFFFF"/>
    <circle cx="9" cy="8" r="0.7" fill="#FFFFFF"/>
  </g>
</svg>`,
            EUR: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius: 50%; vertical-align: middle;">
  <clipPath id="clip-EUR"><circle cx="12" cy="12" r="12" /></clipPath>
  <g clip-path="url(#clip-EUR)">
    <rect width="24" height="24" fill="#003399"/>
    <circle cx="12" cy="5.5" r="0.8" fill="#FFCC00"/>
    <circle cx="12" cy="18.5" r="0.8" fill="#FFCC00"/>
    <circle cx="5.5" cy="12" r="0.8" fill="#FFCC00"/>
    <circle cx="18.5" cy="12" r="0.8" fill="#FFCC00"/>
    <circle cx="8.75" cy="6.37" r="0.8" fill="#FFCC00"/>
    <circle cx="15.25" cy="6.37" r="0.8" fill="#FFCC00"/>
    <circle cx="8.75" cy="17.63" r="0.8" fill="#FFCC00"/>
    <circle cx="15.25" cy="17.63" r="0.8" fill="#FFCC00"/>
    <circle cx="6.37" cy="8.75" r="0.8" fill="#FFCC00"/>
    <circle cx="17.63" cy="8.75" r="0.8" fill="#FFCC00"/>
    <circle cx="6.37" cy="15.25" r="0.8" fill="#FFCC00"/>
    <circle cx="17.63" cy="15.25" r="0.8" fill="#FFCC00"/>
  </g>
</svg>`,
            GBP: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius: 50%; vertical-align: middle;">
  <clipPath id="clip-GBP"><circle cx="12" cy="12" r="12" /></clipPath>
  <g clip-path="url(#clip-GBP)">
    <rect width="24" height="24" fill="#00247D"/>
    <path d="M0 0 L24 24 M24 0 L0 24" stroke="#FFFFFF" stroke-width="3"/>
    <path d="M0 0 L12 12 M24 0 L12 12 M0 24 L12 12 M24 24 L12 12" stroke="#CF142B" stroke-width="1.2"/>
    <path d="M12 0 L12 24 M0 12 L24 12" stroke="#FFFFFF" stroke-width="5"/>
    <path d="M12 0 L12 24 M0 12 L24 12" stroke="#CF142B" stroke-width="3"/>
  </g>
</svg>`,
            JPY: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius: 50%; vertical-align: middle;">
  <clipPath id="clip-JPY"><circle cx="12" cy="12" r="12" /></clipPath>
  <g clip-path="url(#clip-JPY)">
    <rect width="24" height="24" fill="#FFFFFF"/>
    <circle cx="12" cy="12" r="5" fill="#BC002D"/>
  </g>
</svg>`,
            CHF: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius: 50%; vertical-align: middle;">
  <clipPath id="clip-CHF"><circle cx="12" cy="12" r="12" /></clipPath>
  <g clip-path="url(#clip-CHF)">
    <rect width="24" height="24" fill="#D52B1E"/>
    <rect x="10" y="5" width="4" height="14" fill="#FFFFFF" rx="1"/>
    <rect x="5" y="10" width="14" height="4" fill="#FFFFFF" rx="1"/>
  </g>
</svg>`,
            CAD: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius: 50%; vertical-align: middle;">
  <clipPath id="clip-CAD"><circle cx="12" cy="12" r="12" /></clipPath>
  <g clip-path="url(#clip-CAD)">
    <rect width="24" height="24" fill="#FF0000"/>
    <rect x="6" width="12" height="24" fill="#FFFFFF"/>
    <path d="M12 5 L13.5 8.5 L17 8 L15 11 L18 13.5 L14 14 L14.5 17.5 L12 16 L9.5 17.5 L10 14 L6 13.5 L9 11 L7 8 L10.5 8.5 Z" fill="#FF0000"/>
  </g>
</svg>`,
            AUD: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius: 50%; vertical-align: middle;">
  <clipPath id="clip-AUD"><circle cx="12" cy="12" r="12" /></clipPath>
  <g clip-path="url(#clip-AUD)">
    <rect width="24" height="24" fill="#00008B"/>
    <g transform="scale(0.5)">
      <rect width="24" height="24" fill="#00247D"/>
      <path d="M0 0 L24 24 M24 0 L0 24" stroke="#FFFFFF" stroke-width="3"/>
      <path d="M0 0 L24 24 M24 0 L0 24" stroke="#CF142B" stroke-width="1.2"/>
      <path d="M12 0 L12 24 M0 12 L24 12" stroke="#FFFFFF" stroke-width="5"/>
      <path d="M12 0 L12 24 M0 12 L24 12" stroke="#CF142B" stroke-width="3"/>
    </g>
    <circle cx="6" cy="17" r="1.5" fill="#FFFFFF"/>
    <circle cx="18" cy="6" r="0.8" fill="#FFFFFF"/>
    <circle cx="15.5" cy="10" r="0.8" fill="#FFFFFF"/>
    <circle cx="20.5" cy="12" r="0.8" fill="#FFFFFF"/>
    <circle cx="18" cy="15" r="0.8" fill="#FFFFFF"/>
    <circle cx="19" cy="10.5" r="0.5" fill="#FFFFFF"/>
  </g>
</svg>`,
            CNY: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius: 50%; vertical-align: middle;">
  <clipPath id="clip-CNY"><circle cx="12" cy="12" r="12" /></clipPath>
  <g clip-path="url(#clip-CNY)">
    <rect width="24" height="24" fill="#DE2910"/>
    <polygon points="5.5,4.25 6.1,5.8 7.7,5.8 6.4,6.7 6.9,8.3 5.5,7.3 4.1,8.3 4.6,6.7 3.3,5.8 4.9,5.8" fill="#FFDE00"/>
    <circle cx="9" cy="3.5" r="0.4" fill="#FFDE00"/>
    <circle cx="10" cy="5" r="0.4" fill="#FFDE00"/>
    <circle cx="10" cy="7" r="0.4" fill="#FFDE00"/>
    <circle cx="9" cy="8.5" r="0.4" fill="#FFDE00"/>
  </g>
</svg>`
        };
        return flagSvgs[currency] || '';
    }

    function setupCustomDropdowns() {
        const selectCols = document.querySelectorAll('.select-col');
        selectCols.forEach(col => {
            const nativeSelect = col.querySelector('.currency-select');
            if (!nativeSelect) return;

            if (col.querySelector('.custom-select-wrapper')) return;

            const selectId = nativeSelect.id;
            const wrapper = document.createElement('div');
            wrapper.className = 'custom-select-wrapper';
            wrapper.id = `${selectId}-custom`;

            const trigger = document.createElement('button');
            trigger.className = 'custom-select-trigger';
            trigger.type = 'button';

            const flagSpan = document.createElement('span');
            flagSpan.className = 'custom-select-flag';

            const textSpan = document.createElement('span');
            textSpan.className = 'custom-select-text';

            const chevron = document.createElement('i');
            chevron.setAttribute('data-lucide', 'chevron-down');
            chevron.className = 'chevron-icon';

            trigger.appendChild(flagSpan);
            trigger.appendChild(textSpan);
            trigger.appendChild(chevron);

            const dropdown = document.createElement('div');
            dropdown.className = 'custom-select-dropdown';

            const searchWrapper = document.createElement('div');
            searchWrapper.className = 'custom-select-search-wrapper';

            const searchIcon = document.createElement('i');
            searchIcon.setAttribute('data-lucide', 'search');
            searchIcon.className = 'search-icon';

            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.className = 'custom-select-search-input';
            searchInput.placeholder = 'Search currency...';

            searchWrapper.appendChild(searchIcon);
            searchWrapper.appendChild(searchInput);
            dropdown.appendChild(searchWrapper);

            const optionsWrapper = document.createElement('div');
            optionsWrapper.className = 'custom-select-options';

            Array.from(nativeSelect.options).forEach(opt => {
                const optionEl = document.createElement('div');
                optionEl.className = 'custom-select-option';
                optionEl.setAttribute('data-value', opt.value);

                const optFlag = document.createElement('span');
                optFlag.className = 'custom-select-flag';
                optFlag.innerHTML = getFlagSvg(opt.value);

                const optText = document.createElement('span');
                optText.className = 'custom-select-text';
                optText.textContent = opt.textContent;

                optionEl.appendChild(optFlag);
                optionEl.appendChild(optText);

                optionEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    nativeSelect.value = opt.value;
                    nativeSelect.dispatchEvent(new Event('change'));
                    closeAllCustomDropdowns();
                });

                optionsWrapper.appendChild(optionEl);
            });

            dropdown.appendChild(optionsWrapper);
            wrapper.appendChild(trigger);
            wrapper.appendChild(dropdown);
            col.appendChild(wrapper);

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = wrapper.classList.contains('open');
                closeAllCustomDropdowns();
                if (!isOpen) {
                    wrapper.classList.add('open');
                    searchInput.value = '';
                    filterOptions(optionsWrapper, '');
                    setTimeout(() => searchInput.focus(), 50);
                }
            });

            searchInput.addEventListener('input', (e) => {
                filterOptions(optionsWrapper, e.target.value);
            });

            searchInput.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });

        if (window.lucide) {
            window.lucide.createIcons();
        }

        document.addEventListener('click', () => {
            closeAllCustomDropdowns();
        });
    }

    function closeAllCustomDropdowns() {
        document.querySelectorAll('.custom-select-wrapper').forEach(w => {
            w.classList.remove('open');
        });
    }

    function filterOptions(optionsWrapper, query) {
        const options = optionsWrapper.querySelectorAll('.custom-select-option');
        const cleanQuery = query.toLowerCase().trim();
        options.forEach(opt => {
            const text = opt.querySelector('.custom-select-text').textContent.toLowerCase();
            const val = opt.getAttribute('data-value').toLowerCase();
            if (text.includes(cleanQuery) || val.includes(cleanQuery)) {
                opt.classList.remove('hidden');
            } else {
                opt.classList.add('hidden');
            }
        });
    }

    function syncCustomDropdowns() {
        const selectCols = document.querySelectorAll('.select-col');
        selectCols.forEach(col => {
            const nativeSelect = col.querySelector('.currency-select');
            const wrapper = col.querySelector('.custom-select-wrapper');
            if (!nativeSelect || !wrapper) return;

            const trigger = wrapper.querySelector('.custom-select-trigger');
            const flagSpan = trigger.querySelector('.custom-select-flag');
            const textSpan = trigger.querySelector('.custom-select-text');
            
            const selectedVal = nativeSelect.value;
            const selectedOpt = Array.from(nativeSelect.options).find(o => o.value === selectedVal);
            
            if (selectedOpt) {
                flagSpan.innerHTML = getFlagSvg(selectedVal);
                textSpan.textContent = selectedOpt.textContent;
            }

            const options = wrapper.querySelectorAll('.custom-select-option');
            options.forEach(opt => {
                if (opt.getAttribute('data-value') === selectedVal) {
                    opt.classList.add('selected');
                } else {
                    opt.classList.remove('selected');
                }
            });
        });
    }

    function initializeConverter() {
        try {
            const widget = document.querySelector('.exchange-widget');
            if (!widget) return;

            // Setup custom selectors visually replacing native ones
            setupCustomDropdowns();

            const fromAmount = widget.querySelector('#from-amount');
            const fromCurrency = widget.querySelector('#from-currency');
            const toCurrency = widget.querySelector('#to-currency');
            const swapBtn = widget.querySelector('#swap-currencies-btn');
            const convertBtn = widget.querySelector('#convert-submit-btn');
            const spinner = widget.querySelector('#converter-spinner');
            const favoriteBtn = widget.querySelector('#favorite-pair-btn');

            if (fromAmount) {
                fromAmount.addEventListener('input', updateConversionDisplayGlobal);
            }

            if (fromCurrency) {
                fromCurrency.addEventListener('change', () => {
                    updateConversionDisplayGlobal();
                    updateChartPairName();
                    updateChartData();
                });
            }

            if (toCurrency) {
                toCurrency.addEventListener('change', () => {
                    updateConversionDisplayGlobal();
                    updateChartPairName();
                    updateChartData();
                });
            }

            if (swapBtn) {
                swapBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (fromCurrency && toCurrency) {
                        const temp = fromCurrency.value;
                        fromCurrency.value = toCurrency.value;
                        toCurrency.value = temp;
                        updateConversionDisplayGlobal();
                        updateChartPairName();
                        updateChartData();
                    }
                });
            }

            if (favoriteBtn) {
                favoriteBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (fromCurrency && toCurrency) {
                        const from = fromCurrency.value;
                        const to = toCurrency.value;
                        const pair = `${from}/${to}`;

                        if (favorites.includes(pair)) {
                            favorites = favorites.filter(p => p !== pair);
                            favoriteBtn.classList.remove('active');
                        } else {
                            favorites.push(pair);
                            favoriteBtn.classList.add('active');
                        }
                        renderFavorites();
                    }
                });
            }

            if (convertBtn) {
                convertBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    
                    if (spinner) spinner.style.display = 'block';
                    convertBtn.setAttribute('disabled', 'true');
                    const btnTxt = convertBtn.querySelector('.btn-txt');
                    if (btnTxt) btnTxt.textContent = 'Processing...';

                    // Timeout delay simulation
                    setTimeout(async () => {
                        try {
                            if (!fromCurrency || !toCurrency || !fromAmount) return;
                            
                            const from = fromCurrency.value;
                            const to = toCurrency.value;
                            const amt = parseFloat(fromAmount.value) || 0;
                            
                            let rate = getExchangeRate(from, to);
                            let recAmt = amt * rate;

                            // Fetch calculations from backend conversion endpoint if online
                            try {
                                const response = await fetch(`/api/convert?from=${from}&to=${to}&amount=${amt}`);
                                const data = await response.json();
                                if (data.success) {
                                    rate = data.rate;
                                    recAmt = data.result;
                                }
                            } catch (apiErr) {
                                console.warn("Backend convert endpoint failed, using client-side calculation.");
                            }

                            const toAmount = widget.querySelector('#to-amount');
                            if (toAmount) toAmount.value = recAmt.toFixed(2);

                            const newRecord = {
                                time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
                                from: from,
                                fromAmt: amt,
                                to: to,
                                toAmt: parseFloat(recAmt.toFixed(2)),
                                rate: parseFloat(rate.toFixed(4)),
                                date: new Date().toISOString().split('T')[0]
                            };

                            // Save to SQLite via FastAPI backend
                            await saveTransactionRecord(newRecord);
                            await loadTransactionHistory();

                            // Sync local UI
                            renderRecentHistory();
                            renderDetailedHistory();
                            updateWeeklyConversionsCount();
                        } catch (calcError) {
                            console.error("Conversion error:", calcError);
                        } finally {
                            if (spinner) spinner.style.display = 'none';
                            convertBtn.removeAttribute('disabled');
                            if (btnTxt) btnTxt.textContent = 'Convert Currency';
                        }
                    }, 600);
                });
            }

            updateConversionDisplayGlobal();
        } catch (err) {
            console.error("Failed to initialize converter:", err);
        }
    }

    initializeConverter();

    // ----------------------------------------------------
    // 6. Backend Persistence Controllers
    // ----------------------------------------------------
    async function loadTransactionHistory() {
        try {
            const response = await fetch('/api/history');
            const data = await response.json();
            if (data.success && data.history) {
                conversionHistory = data.history;
                conversionsCount = data.history.length;
                return;
            }
        } catch (err) {
            console.warn("Backend offline. Fetching log history from browser local storage fallback...");
        }

        // Cache fallback logic for local sandboxes
        const cached = localStorage.getItem('valut_history');
        if (cached) {
            conversionHistory = JSON.parse(cached);
            conversionsCount = conversionHistory.length;
        } else {
            // Default mock values if first launch
            conversionHistory = [
                { time: '14:23', from: 'EUR', fromAmt: 250, to: 'USD', toAmt: 273.1, rate: 1.0924, date: '2026-05-19' },
                { time: '12:05', from: 'GBP', fromAmt: 100, to: 'EUR', toAmt: 116.52, rate: 1.1652, date: '2026-05-19' },
                { time: '09:44', from: 'USD', fromAmt: 1200, to: 'JPY', toAmt: 187235, rate: 156.02, date: '2026-05-19' },
                { time: 'Yesterday', from: 'EUR', fromAmt: 50, to: 'CAD', toAmt: 74.39, rate: 1.4878, date: '2026-05-18' },
                { time: 'Yesterday', from: 'AUD', fromAmt: 300, to: 'USD', toAmt: 200.79, rate: 0.6693, date: '2026-05-18' }
            ];
            conversionsCount = 24;
            localStorage.setItem('valut_history', JSON.stringify(conversionHistory));
        }
    }

    async function saveTransactionRecord(record) {
        try {
            const response = await fetch('/api/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(record)
            });
            const data = await response.json();
            if (data.success) return true;
        } catch (err) {
            console.warn("Failed to write log to backend. Syncing LocalStorage...");
        }

        conversionHistory.unshift(record);
        localStorage.setItem('valut_history', JSON.stringify(conversionHistory));
        return false;
    }

    async function clearTransactionHistory() {
        try {
            const response = await fetch('/api/history', { method: 'DELETE' });
            const data = await response.json();
            if (data.success) {
                conversionHistory = [];
                conversionsCount = 0;
                localStorage.setItem('valut_history', JSON.stringify([]));
                return true;
            }
        } catch (err) {
            console.warn("Backend server offline. Cleared browser LocalStorage records.");
        }

        conversionHistory = [];
        conversionsCount = 0;
        localStorage.setItem('valut_history', JSON.stringify([]));
        return true;
    }

    // ----------------------------------------------------
    // 7. Favorites List Renderer
    // ----------------------------------------------------
    const favoritesContainer = document.getElementById('favorites-container');
    const favoritesCountEl = document.getElementById('favorites-count');

    function renderFavorites() {
        try {
            if (favoritesCountEl) favoritesCountEl.textContent = favorites.length;
            if (!favoritesContainer) return;
            
            favoritesContainer.innerHTML = '';

            if (favorites.length === 0) {
                favoritesContainer.innerHTML = '<div class="card-subtext">No pinned pairs. Add stars on the converter!</div>';
                return;
            }

            favorites.forEach(pair => {
                const [from, to] = pair.split('/');
                const rate = getExchangeRate(from, to).toFixed(4);

                const pill = document.createElement('div');
                pill.className = 'fav-pill';
                pill.setAttribute('data-pair', pair);
                pill.innerHTML = `
                    <span class="fav-pair">${pair}</span>
                    <span class="fav-rate">${rate}</span>
                    <button class="fav-remove" title="Remove Favorite">
                        <i data-lucide="x"></i>
                    </button>
                `;

                pill.addEventListener('click', (e) => {
                    if (e.target.closest('.fav-remove')) return;
                    const fromSelect = document.getElementById('from-currency');
                    const toSelect = document.getElementById('to-currency');
                    if (fromSelect && toSelect) {
                        fromSelect.value = from;
                        toSelect.value = to;
                        
                        updateConversionDisplayGlobal();
                        updateChartPairName();
                        updateChartData();
                    }
                });

                const removeBtn = pill.querySelector('.fav-remove');
                if (removeBtn) {
                    removeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        favorites = favorites.filter(p => p !== pair);
                        renderFavorites();
                        
                        const widget = document.querySelector('.exchange-widget');
                        if (widget) {
                            const activeFrom = widget.querySelector('#from-currency')?.value;
                            const activeTo = widget.querySelector('#to-currency')?.value;
                            if (`${activeFrom}/${activeTo}` === pair) {
                                widget.querySelector('#favorite-pair-btn')?.classList.remove('active');
                            }
                        }
                    });
                }

                favoritesContainer.appendChild(pill);
            });

            if (window.lucide) window.lucide.createIcons();
        } catch (e) {
            console.error("Error rendering favorites list:", e);
        }
    }

    // ----------------------------------------------------
    // 8. Market Rates Table Renderer (Base EUR)
    // ----------------------------------------------------
    const trendsContainer = document.getElementById('trends-container');

    function renderMarketTrends() {
        try {
            if (!trendsContainer) return;
            trendsContainer.innerHTML = '';

            const markets = ['USD', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY'];
            
            markets.forEach(sym => {
                const rate = currencyData[sym]?.rate || 1.0;
                const isPositive = (sym.charCodeAt(0) % 2 === 0);
                const changePercent = ((sym.charCodeAt(1) % 10) / 7).toFixed(2);

                const row = document.createElement('div');
                row.className = 'trend-row';
                row.style.cursor = 'pointer';
                row.innerHTML = `
                    <div class="trend-currency-info">
                        <span class="trend-symbol">EUR / ${sym}</span>
                        <span class="trend-name">${currencyData[sym]?.name || ''}</span>
                    </div>
                    <div class="trend-stats">
                        <span class="trend-rate-val">${rate.toFixed(4)}</span>
                        <span class="trend-percentage ${isPositive ? 'up' : 'down'}">
                            ${isPositive ? '+' : '-'}${changePercent}%
                        </span>
                    </div>
                `;

                row.addEventListener('click', () => {
                    const fromSelect = document.getElementById('from-currency');
                    const toSelect = document.getElementById('to-currency');
                    if (fromSelect && toSelect) {
                        fromSelect.value = 'EUR';
                        toSelect.value = sym;
                        
                        updateConversionDisplayGlobal();
                        updateChartPairName();
                        updateChartData();
                    }
                });

                trendsContainer.appendChild(row);
            });
        } catch (e) {
            console.error("Error rendering market trends:", e);
        }
    }

    // ----------------------------------------------------
    // 9. History Table Renderers
    // ----------------------------------------------------
    const dashboardRecentTbody = document.getElementById('dashboard-recent-history');
    const detailedHistoryTbody = document.getElementById('detailed-history-tbody');
    const conversionsCardVal = document.getElementById('total-conversions-count');

    function updateWeeklyConversionsCount() {
        if (conversionsCardVal) conversionsCardVal.textContent = conversionsCount;
    }

    function renderRecentHistory() {
        try {
            if (!dashboardRecentTbody) return;
            dashboardRecentTbody.innerHTML = '';

            const miniLogs = conversionHistory.slice(0, 4);
            if (miniLogs.length === 0) {
                dashboardRecentTbody.innerHTML = `<tr><td colspan="4" class="card-subtext" style="text-align: center;">No transactions logged yet.</td></tr>`;
                return;
            }

            miniLogs.forEach(log => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><span class="activity-time">${log.time}</span></td>
                    <td><span class="activity-pair">${log.from}/${log.to}</span></td>
                    <td><span class="activity-sold">${log.fromAmt} ${log.from}</span></td>
                    <td><span class="activity-recv">${log.toAmt.toFixed(2)} ${log.to}</span></td>
                `;
                dashboardRecentTbody.appendChild(tr);
            });
        } catch (e) {
            console.error("Error rendering recent history:", e);
        }
    }

    function renderDetailedHistory(filterText = '') {
        try {
            if (!detailedHistoryTbody) return;
            detailedHistoryTbody.innerHTML = '';

            let logs = conversionHistory;
            if (filterText) {
                const query = filterText.toLowerCase();
                logs = conversionHistory.filter(log => 
                    log.from.toLowerCase().includes(query) || 
                    log.to.toLowerCase().includes(query) || 
                    log.date.includes(query)
                );
            }

            if (logs.length === 0) {
                detailedHistoryTbody.innerHTML = `<tr><td colspan="7" class="card-subtext" style="text-align: center;">No matching transactions found.</td></tr>`;
                return;
            }

            logs.forEach(log => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${log.date} ${log.time}</td>
                    <td><strong>${log.from}</strong> — ${currencyData[log.from]?.name || ''}</td>
                    <td>${log.fromAmt.toFixed(2)} ${log.from}</td>
                    <td><strong>${log.to}</strong> — ${currencyData[log.to]?.name || ''}</td>
                    <td class="text-success"><strong>${log.toAmt.toFixed(2)} ${log.to}</strong></td>
                    <td>${log.rate}</td>
                    <td><span class="status-pill success">Settled</span></td>
                `;
                detailedHistoryTbody.appendChild(tr);
            });
        } catch (e) {
            console.error("Error rendering detailed history:", e);
        }
    }

    const historySearch = document.getElementById('history-search');
    if (historySearch) {
        historySearch.addEventListener('input', (e) => {
            renderDetailedHistory(e.target.value);
        });
    }

    const clearHistoryBtn = document.getElementById('clear-history-btn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', async () => {
            try {
                if (confirm('Are you sure you want to clear the entire SQLite conversion database log?')) {
                    await clearTransactionHistory();
                    renderRecentHistory();
                    renderDetailedHistory();
                    updateWeeklyConversionsCount();
                }
            } catch (e) {
                console.error("Error clearing logs:", e);
            }
        });
    }

    // ----------------------------------------------------
    // 10. Chart.js Data Visualizations & API Connect
    // ----------------------------------------------------
    let chartInstance = null;
    let chartFocusedInstance = null;
    let activeTimeframe = '1M';

    function getChartLabelDates(tf) {
        const labels = [];
        const d = new Date();
        try {
            if (tf === '7D') {
                for (let i = 6; i >= 0; i--) {
                    const day = new Date();
                    day.setDate(d.getDate() - i);
                    labels.push(day.toLocaleDateString('en-US', { weekday: 'short' }));
                }
            } else if (tf === '1M') {
                for (let i = 29; i >= 0; i -= 4) {
                    const day = new Date();
                    day.setDate(d.getDate() - i);
                    labels.push(day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                }
            } else if (tf === '1Y') {
                for (let i = 11; i >= 0; i--) {
                    const m = new Date();
                    m.setMonth(d.getMonth() - i);
                    labels.push(m.toLocaleDateString('en-US', { month: 'short' }));
                }
            }
        } catch (e) {
            console.error("Error compiling chart dates:", e);
        }
        return labels;
    }

    function generateChartRates(from, to, tf) {
        const data = [];
        try {
            const rate = getExchangeRate(from, to);
            let length = 7;
            if (tf === '1M') length = 8;
            else if (tf === '1Y') length = 12;

            let current = rate * 0.97;
            for (let i = 0; i < length; i++) {
                const step = (Math.random() - 0.48) * 0.015 * rate;
                current += step;
                data.push(parseFloat(current.toFixed(4)));
            }
            data[data.length - 1] = parseFloat(rate.toFixed(4));
        } catch (e) {
            console.error("Error generating simulated chart rates:", e);
        }
        return data;
    }

    async function fetchChartHistoricalData(from, to, tf) {
        try {
            // Attempt to query FastAPI backend API for historical Frankfurter points
            const response = await fetch(`/api/chart?from=${from}&to=${to}&timeframe=${tf}`);
            const data = await response.json();
            if (data.success) {
                return { labels: data.labels, data: data.data };
            }
        } catch (err) {
            console.warn("Backend chart endpoint failed. Querying Frankfurter API directly...");
        }

        // Direct Browser client queries to public API if server is offline
        try {
            const end = new Date();
            const start = new Date();
            if (tf === '7D') start.setDate(end.getDate() - 7);
            else if (tf === '1M') start.setDate(end.getDate() - 30);
            else if (tf === '1Y') start.setDate(end.getDate() - 365);

            const startStr = start.toISOString().split('T')[0];
            const endStr = end.toISOString().split('T')[0];

            const response = await fetch(`https://api.frankfurter.dev/v1/${startStr}..${endStr}?base=${from}&symbols=${to}`);
            const data = await response.json();
            if (data.rates) {
                const sortedDates = Object.keys(data.rates).sort();
                const labels = [];
                const dataPoints = [];

                if (tf === '7D') {
                    sortedDates.forEach(d => {
                        labels.push(new Date(d).toLocaleDateString('en-US', { weekday: 'short' }));
                        dataPoints.push(data.rates[d][to]);
                    });
                } else if (tf === '1M') {
                    sortedDates.forEach((d, idx) => {
                        if (idx % 3 === 0 || idx === sortedDates.length - 1) {
                            labels.push(new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                            dataPoints.push(data.rates[d][to]);
                        }
                    });
                } else if (tf === '1Y') {
                    // Group averages by month
                    const monthGroups = {};
                    sortedDates.forEach(d => {
                        const month = new Date(d).toLocaleDateString('en-US', { month: 'short' });
                        if (!monthGroups[month]) monthGroups[month] = [];
                        monthGroups[month].push(data.rates[d][to]);
                    });
                    Object.keys(monthGroups).forEach(m => {
                        labels.push(m);
                        const avg = monthGroups[m].reduce((a, b) => a + b, 0) / monthGroups[m].length;
                        dataPoints.push(parseFloat(avg.toFixed(4)));
                    });
                }

                return { labels, data: dataPoints };
            }
        } catch (fallbackErr) {
            console.error("Direct Frankfurter API chart query failed. Utilizing simulated data:", fallbackErr);
        }

        // Final safe simulated fallback
        return {
            labels: getChartLabelDates(tf),
            data: generateChartRates(from, to, tf)
        };
    }

    function updateChartPairName() {
        try {
            const fromSelect = document.getElementById('from-currency');
            const toSelect = document.getElementById('to-currency');
            if (!fromSelect || !toSelect) return;

            const from = fromSelect.value;
            const to = toSelect.value;
            
            const titleEl = document.getElementById('chart-pair-name');
            if (titleEl) titleEl.textContent = `${from} to ${to} Historical Trend`;

            const cardVal = document.getElementById('card-rate-val');
            if (cardVal) cardVal.textContent = getExchangeRate(from, to).toFixed(4);

            const badge = document.getElementById('rate-trend-badge');
            if (badge) {
                const rateChange = ((from.charCodeAt(0) + to.charCodeAt(0)) % 10) / 4;
                const isPos = from.charCodeAt(0) > to.charCodeAt(0);
                badge.textContent = `${isPos ? '+' : '-'}${rateChange.toFixed(2)}%`;
                badge.className = `trend-badge ${isPos ? 'positive' : 'negative'}`;
            }
        } catch (e) {
            console.error("Error updating chart headers:", e);
        }
    }

    async function updateChartData() {
        try {
            const fromSelect = document.getElementById('from-currency');
            const toSelect = document.getElementById('to-currency');
            if (!fromSelect || !toSelect) return;

            const from = fromSelect.value;
            const to = toSelect.value;
            
            const { labels, data } = await fetchChartHistoricalData(from, to, activeTimeframe);

            if (chartInstance) {
                chartInstance.data.labels = labels;
                chartInstance.data.datasets[0].data = data;
                chartInstance.data.datasets[0].label = `${from}/${to}`;
                chartInstance.update();
            }

            if (chartFocusedInstance) {
                chartFocusedInstance.data.labels = labels;
                chartFocusedInstance.data.datasets[0].data = data;
                chartFocusedInstance.data.datasets[0].label = `${from}/${to}`;
                chartFocusedInstance.update();
            }
        } catch (e) {
            console.error("Error updating charts dataset:", e);
        }
    }

    function createLineChart(ctx, label, labels, data) {
        if (typeof Chart === 'undefined') return null;
        try {
            const strokeColor = '#5334F5';
            const fillGradient = ctx.createLinearGradient(0, 0, 0, 180);
            fillGradient.addColorStop(0, 'rgba(83, 52, 245, 0.35)');
            fillGradient.addColorStop(1, 'rgba(83, 52, 245, 0.0)');

            return new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: label,
                        data: data,
                        borderColor: strokeColor,
                        borderWidth: 3,
                        pointBackgroundColor: '#FFFFFF',
                        pointBorderColor: strokeColor,
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        tension: 0.35,
                        fill: true,
                        backgroundColor: fillGradient
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            grid: { display: false, drawBorder: false },
                            ticks: {
                                color: '#94A3B8',
                                font: { family: 'Inter', size: 10 }
                            }
                        },
                        y: {
                            grid: {
                                color: 'rgba(255, 255, 255, 0.03)',
                                drawBorder: false
                            },
                            ticks: {
                                color: '#94A3B8',
                                font: { family: 'Inter', size: 10 }
                            }
                        }
                    }
                }
            });
        } catch (e) {
            console.error("Error generating line chart:", e);
            return null;
        }
    }

    async function initChart(viewName = 'dashboard') {
        if (typeof Chart === 'undefined') {
            console.warn("Chart.js library is not available.");
            return;
        }

        try {
            const fromSelect = document.getElementById('from-currency');
            const toSelect = document.getElementById('to-currency');
            if (!fromSelect || !toSelect) return;

            const from = fromSelect.value;
            const to = toSelect.value;
            
            const { labels, data } = await fetchChartHistoricalData(from, to, activeTimeframe);

            if (viewName === 'dashboard') {
                const canvas = document.getElementById('historicalChart');
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                if (chartInstance) {
                    chartInstance.destroy();
                    chartInstance = null;
                }

                chartInstance = createLineChart(ctx, `${from}/${to}`, labels, data);
            } else if (viewName === 'analytics') {
                const placeholder = document.getElementById('focused-chart-placeholder');
                const originalChart = document.querySelector('.analytics-chart-widget');
                if (placeholder && originalChart) {
                    placeholder.innerHTML = '';
                    const cloned = originalChart.cloneNode(true);
                    placeholder.appendChild(cloned);

                    const tfBtns = cloned.querySelectorAll('.tf-btn');
                    tfBtns.forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            tfBtns.forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                            activeTimeframe = btn.getAttribute('data-timeframe');
                            updateChartData();
                        });
                    });

                    const canvas = cloned.querySelector('canvas');
                    if (canvas) {
                        canvas.id = 'historicalChartFocused';
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            if (chartFocusedInstance) {
                                chartFocusedInstance.destroy();
                                chartFocusedInstance = null;
                            }
                            chartFocusedInstance = createLineChart(ctx, `${from}/${to}`, labels, data);
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Error setting up charts:", e);
        }
    }

    const timeframeButtons = document.querySelectorAll('.tf-btn');
    timeframeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            timeframeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTimeframe = btn.getAttribute('data-timeframe');
            updateChartData();
        });
    });

    // ----------------------------------------------------
    // 11. Initial Application Setup & Startup Async Flow
    // ----------------------------------------------------
    async function startApplication() {
        try {
            // 1. Fetch live rates and load SQLite transaction histories
            await fetchLatestRates('EUR');
            await loadTransactionHistory();

            // 2. Render UI lists
            renderFavorites();
            renderMarketTrends();
            renderRecentHistory();
            renderDetailedHistory();
            updateWeeklyConversionsCount();

            // 3. Initialize default dashboard chart
            await initChart('dashboard');
        } catch (err) {
            console.error("Error starting application logic:", err);
        }
    }

    startApplication();

    // ----------------------------------------------------
    // 12. Settings Form Submission
    // ----------------------------------------------------
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', async () => {
            try {
                const baseCurSelect = document.getElementById('settings-base-currency');
                const syncRateSelect = document.getElementById('settings-sync-rate');
                if (!baseCurSelect || !syncRateSelect) return;

                const baseCur = baseCurSelect.value;
                const syncRate = syncRateSelect.value;
                
                // Re-sync base currency rates
                await fetchLatestRates(baseCur);

                const fromSelect = document.getElementById('from-currency');
                if (fromSelect && fromSelect.value !== baseCur) {
                    fromSelect.value = baseCur;
                    updateConversionDisplayGlobal();
                    updateChartPairName();
                    updateChartData();
                }
                
                renderMarketTrends();
                renderFavorites();

                alert(`Settings saved successfully!\nDefault Base: ${baseCur}\nSync Interval: ${syncRate}`);
            } catch (e) {
                print("Error saving settings options:", e);
            }
        });
    }
});

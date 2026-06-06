/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  IS-IT-RAINING PAGE  —  Open-Meteo weather guess game + pixel anchor    │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   DOMContentLoaded ──► init()                                            │
  │                          │                                               │
  │                          ├─ ctx from #weatherman-canvas                  │
  │                          ├─ bind() ──► #ir-yes/#ir-no ──► answer(bool)   │
  │                          │             #ir-cash    ──► cashOut()         │
  │                          │             #ir-next    ──► pushIt()          │
  │                          │             #ir-restart ──► startNewRun()     │
  │                          │             #ir-max     ──► fill wager        │
  │                          │             #ir-wager   ──► renderLadder      │
  │                          │             #ir-mute    ──► toggle IRSound    │
  │                          ├─ decorateMiniTVs() (background channels)      │
  │                          ├─ startNewRun()                                │
  │                          └─ rAF ──► loop()                               │
  │                                                                          │
  │   loop() ──► tickBlink(now) ──► drawWeatherman(now)                      │
  │     drawWeatherman ──► chooseFrame(now) → paint art grid →               │
  │                         drawAnimatedDrips(now)                           │
  │                                                                          │
  │   Run flow:                                                              │
  │     startNewRun() ──► loadCity()                                         │
  │     loadCity() (async)                                                   │
  │        ├─ pickCity() ──► CITIES[i]                                       │
  │        ├─ IRSound.channelChange()                                        │
  │        ├─ fetchWeather(city) ──► current_weather (Open-Meteo)            │
  │        └─ composeQuestion(cw) ──► {type:'rain'|'cloud'|'temp', ...}      │
  │                                                                          │
  │     answer(yesPressed)                                                   │
  │        ├─ first call: Wallet.spend(wager); Child.recordPlay()            │
  │        ├─ evaluateGuess(yesPressed) ──► {correct, ...}                   │
  │        ├─ formatRevealText(judgment, correct) ──► string                 │
  │        ├─ correct ──► rung++; pot=potForRung(rung,wager);               │
  │        │              IRSound.correct(rung); state='climb'              │
  │        └─ wrong   ──► strikes++; ≤MAX_STRIKES → state='climb' (free      │
  │                       miss, pot+rung kept); else pot=0;rung=0;state=     │
  │                       'busted'; IRSound.wrong()                          │
  │                                                                          │
  │     cashOut() ──► Wallet.add(pot); IRSound.cashOut(); state='cashed'    │
  │     pushIt()  ──► IRSound.pushIt(); loadCity()                          │
  │                                                                          │
  │   Helpers: rungMultiplier(n), potForRung(n,wager), formatMult(m),        │
  │            pickQuestionType(), getWager(), setStatus(text, cls),         │
  │            renderPot(opts), renderLadder(), renderQuestion(),            │
  │            setButtons(), skyColors()                                     │
  │                                                                          │
  │   Exports: none (IIFE-local)                                             │
  │   External deps: window.Wallet, window.IRSound, window.Child,            │
  │                   window.Quotes, window.Taglines,                        │
  │                   api.open-meteo.com/v1/forecast                         │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  CITIES=[~170 {name,lat,lon}] US-wide; RAIN_CODES=Set(WMO drizzle/rain/freezing/showers/tstorm); CLEAR_CODES=Set(0,1); CODE_LABELS={wmo→str}
  LADDER_RUNGS=10; LADDER_BASE=0.15; LADDER_GROWTH=1.75
  ART_SMUG_A=[44×40 char rows; pixel weatherman]; ART_SMUG_B=A w/ rows 20-21 open mouth+teeth; ART_SOUR_A/B=frown variants; PALETTE={ch→hex}
  STUMP_ROW=33; STUMP_COL=2
  QUOTES_BASE=[11 noir sayings]; ADS_BASE=[10 70s ad spots]; SCROLL_QUOTES=QUOTES_BASE+global.Quotes; SCROLL_ADS=ADS_BASE; SCROLL_TAGLINES=Taglines.normal w/ ✦ wrap
  state: runState='loading'|'guess'|'climb'|'busted'|'cashed', runActive=F, runWager=0, rung=0, pot=0, strikes=0, MAX_STRIKES=1, currentCity, currentWeather, currentQuestion={type:'rain'|'cloud'|'temp',threshold?}, mood='smug'|'sour', blinkUntil=0, nextBlinkAt=0, canvas, ctx
  rungMultiplier(n)→num: LADDER_BASE*pow(LADDER_GROWTH,n-1)
  potForRung(n,wager)→int: n≤0?0:floor(mult*wager)
  formatMult(m)→str: '×'+(m<10?.toFixed(2):.toFixed(1))
  pickQuestionType()→str: r<.6 rain, <.8 temp, else cloud
  composeQuestion(cw)→Q: rain/cloud→{type}; temp→threshold=actualF±10
  chooseFrame(now)→art: talking=guess||loading; isB=talking && floor(now/280)%2; mood='sour'?SOUR_A/B:SMUG_A/B
  drawAnimatedDrips(now): 3 drops staggered 1500ms; dy=floor(phase*11); dx=STUMP_COL-floor(phase*2); fill PALETTE.r; phase<.18→bright PALETTE.R
  skyColors()→{sky,horizon}: climb=green; busted=red; else blue
  drawWeatherman(now): art=chooseFrame; canvas.W/H=art dims; fill sky+horizon; ∀ch in art fillRect(x,y,1,1)=PALETTE[ch]; blink E→F; drawAnimatedDrips
  tickBlink(now): now>nextBlinkAt&&now>blinkUntil→blinkUntil=now+140, nextBlinkAt=now+2500+rnd*2500
  loop(): now=perfNow; tickBlink; drawWeatherman; rAF
  pickCity()→city: rnd until ≠currentCity
  setStatus(text,cls): #ir-result.text=text; toggle classes
  getWager()→int: max(1,floor(#ir-wager.value||0)); writeback
  renderPot({grow?,bust?,cashed?}): .tv-lcd-pot val.text=pot; rungVal.text=rung; toggle classes; grow→rAF add is-grow
  renderLadder(): wager=runActive?runWager:getWager; ∀list ∀n 1..10 li w/ classes (is-climbed/current/next); mult+coins
  renderQuestion(): set prefix/city/suffix; !Q→'Tuning in to …'; rain/cloud/temp variants
  setButtons(): wager+max.disabled=runActive; yes/no shown always, .disabled=runState!=='guess'; cash/next/restart hidden default; climb→cash+next shown; busted/cashed→restart shown
  fetchWeather(city)async→cw: GET open-meteo url w/ lat/lon, current_weather, temp=F; ret data.current_weather; throw on bad
  loadCity()async: runState='loading'; pickCity; clear weather/Q; renderQuestion; setStatus 'Tuning in…'; setButtons; IRSound.channelChange; try fetchWeather; catch→runActive?'climb',Signal's out:'cashed',Signal's out; else weather=cw, Q=composeQuestion, state='guess', renderQuestion, setStatus '', setButtons
  startNewRun(): IRSound.powerOn; runActive=F,runWager=0,rung=0,pot=0,mood='smug'; renderPot+Ladder; loadCity
  pushIt(): guard(state!=='climb'); IRSound.pushIt; loadCity
  evaluateGuess(yesPressed)→{correct,...}: rain→raining=RAIN_CODES.has(code); cloud→isClear=CLEAR_CODES.has(code); temp→isAbove=actualF>threshold
  formatRevealText(j,correct)→str: rain/cloud/temp lead glyph + label/code + tempF or vs threshold
  answer(yes): guard(state!=='guess'); IRSound.click; !runActive→spend(wager) (broke→err) + Child.recordPlay + runWager,runActive=T; j=evaluate; reveal=format; correct→rung+=1,pot=potForRung,mood='sour',state='climb',setStatus is-win,renderPot grow,IRSound.correct(rung); else→strikes++; ≤MAX_STRIKES→state='climb' (pot+rung kept, STRIKE x/1 status, IRSound.wrong); else→mood='smug',lost=pot+wager,pot=0,rung=0,runActive=F,state='busted',setStatus is-loss,renderPot bust,IRSound.wrong
  cashOut(): guard(state!=='climb'); won=pot; Wallet.add(won); setStatus '+N coins'; runActive=F,state='cashed',mood='sour'; renderPot cashed; IRSound.cashOut
  bind(): yes→answer(T); no→answer(F); cash→cashOut; next→pushIt; restart→startNewRun; max→#ir-wager=Wallet.balance,renderLadder; wager input→!runActive&&renderLadder; mute→toggle IRSound.setMuted, icon swap
  decorateMiniTVs(): ∀.tv-mini by data-mode: standby→3 labels rotate; channel→CH NN; off→scanline; child-face→every 620ms update from Child.describeFace; quotes/ads/taglines→.scroll-track marquee duplicated, CHARS_PER_SEC=9, anim duration max(45,len/9)s
  init(): canvas=#weatherman-canvas; ctx=2d; bind; decorateMiniTVs; startNewRun; rAF(loop)
  exports: none (IIFE-local); on DOMContentLoaded→init
*/

(function (global) {
  // ===== American cities (name + coordinates) =====
  // Spread across regions and climates so the answer isn't always "no".
  // Roughly 170 cities. Ordered loosely by region (West → Mountain → Plains →
  // South → Southeast → Mid-Atlantic → Northeast → Midwest → Alaska/Hawaii).
  const CITIES = [
    // ----- Pacific Northwest -----
    { name: 'Seattle, WA',          lat: 47.6062, lon: -122.3321 },
    { name: 'Tacoma, WA',           lat: 47.2529, lon: -122.4443 },
    { name: 'Spokane, WA',          lat: 47.6588, lon: -117.4260 },
    { name: 'Bellingham, WA',       lat: 48.7519, lon: -122.4787 },
    { name: 'Olympia, WA',          lat: 47.0379, lon: -122.9007 },
    { name: 'Portland, OR',         lat: 45.5152, lon: -122.6784 },
    { name: 'Eugene, OR',           lat: 44.0521, lon: -123.0868 },
    { name: 'Bend, OR',             lat: 44.0582, lon: -121.3153 },
    { name: 'Salem, OR',            lat: 44.9429, lon: -123.0351 },
    // ----- California -----
    { name: 'San Francisco, CA',    lat: 37.7749, lon: -122.4194 },
    { name: 'Oakland, CA',          lat: 37.8044, lon: -122.2712 },
    { name: 'San Jose, CA',         lat: 37.3382, lon: -121.8863 },
    { name: 'Sacramento, CA',       lat: 38.5816, lon: -121.4944 },
    { name: 'Fresno, CA',           lat: 36.7378, lon: -119.7871 },
    { name: 'Bakersfield, CA',      lat: 35.3733, lon: -119.0187 },
    { name: 'Los Angeles, CA',      lat: 34.0522, lon: -118.2437 },
    { name: 'Long Beach, CA',       lat: 33.7701, lon: -118.1937 },
    { name: 'Anaheim, CA',          lat: 33.8366, lon: -117.9143 },
    { name: 'Riverside, CA',        lat: 33.9533, lon: -117.3962 },
    { name: 'Santa Barbara, CA',    lat: 34.4208, lon: -119.6982 },
    { name: 'Palm Springs, CA',     lat: 33.8303, lon: -116.5453 },
    { name: 'San Diego, CA',        lat: 32.7157, lon: -117.1611 },
    // ----- Nevada / Arizona -----
    { name: 'Las Vegas, NV',        lat: 36.1699, lon: -115.1398 },
    { name: 'Reno, NV',             lat: 39.5296, lon: -119.8138 },
    { name: 'Carson City, NV',      lat: 39.1638, lon: -119.7674 },
    { name: 'Phoenix, AZ',          lat: 33.4484, lon: -112.0740 },
    { name: 'Tucson, AZ',           lat: 32.2226, lon: -110.9747 },
    { name: 'Mesa, AZ',             lat: 33.4152, lon: -111.8315 },
    { name: 'Scottsdale, AZ',       lat: 33.4942, lon: -111.9261 },
    { name: 'Flagstaff, AZ',        lat: 35.1983, lon: -111.6513 },
    // ----- New Mexico -----
    { name: 'Albuquerque, NM',      lat: 35.0844, lon: -106.6504 },
    { name: 'Santa Fe, NM',         lat: 35.6870, lon: -105.9378 },
    { name: 'Las Cruces, NM',       lat: 32.3199, lon: -106.7637 },
    { name: 'Roswell, NM',          lat: 33.3943, lon: -104.5230 },
    // ----- Colorado / Utah / Wyoming -----
    { name: 'Denver, CO',           lat: 39.7392, lon: -104.9903 },
    { name: 'Colorado Springs, CO', lat: 38.8339, lon: -104.8214 },
    { name: 'Aurora, CO',           lat: 39.7294, lon: -104.8319 },
    { name: 'Boulder, CO',          lat: 40.0150, lon: -105.2705 },
    { name: 'Fort Collins, CO',     lat: 40.5853, lon: -105.0844 },
    { name: 'Aspen, CO',            lat: 39.1911, lon: -106.8175 },
    { name: 'Salt Lake City, UT',   lat: 40.7608, lon: -111.8910 },
    { name: 'Provo, UT',            lat: 40.2338, lon: -111.6585 },
    { name: 'Park City, UT',        lat: 40.6461, lon: -111.4980 },
    { name: 'Cheyenne, WY',         lat: 41.1400, lon: -104.8202 },
    { name: 'Casper, WY',           lat: 42.8666, lon: -106.3131 },
    { name: 'Jackson, WY',          lat: 43.4799, lon: -110.7624 },
    // ----- Idaho / Montana -----
    { name: 'Boise, ID',            lat: 43.6150, lon: -116.2023 },
    { name: 'Idaho Falls, ID',      lat: 43.4666, lon: -112.0341 },
    { name: 'Twin Falls, ID',       lat: 42.5630, lon: -114.4609 },
    { name: "Coeur d'Alene, ID",    lat: 47.6777, lon: -116.7805 },
    { name: 'Billings, MT',         lat: 45.7833, lon: -108.5007 },
    { name: 'Bozeman, MT',          lat: 45.6770, lon: -111.0429 },
    { name: 'Helena, MT',           lat: 46.5891, lon: -112.0391 },
    { name: 'Missoula, MT',         lat: 46.8721, lon: -113.9940 },
    // ----- Plains -----
    { name: 'Fargo, ND',            lat: 46.8772, lon:  -96.7898 },
    { name: 'Bismarck, ND',         lat: 46.8083, lon: -100.7837 },
    { name: 'Sioux Falls, SD',      lat: 43.5446, lon:  -96.7311 },
    { name: 'Rapid City, SD',       lat: 44.0805, lon: -103.2310 },
    { name: 'Lincoln, NE',          lat: 40.8136, lon:  -96.7026 },
    { name: 'Omaha, NE',            lat: 41.2565, lon:  -95.9345 },
    { name: 'Wichita, KS',          lat: 37.6872, lon:  -97.3301 },
    { name: 'Topeka, KS',           lat: 39.0473, lon:  -95.6752 },
    { name: 'Oklahoma City, OK',    lat: 35.4676, lon:  -97.5164 },
    { name: 'Tulsa, OK',            lat: 36.1540, lon:  -95.9928 },
    // ----- Texas -----
    { name: 'Houston, TX',          lat: 29.7604, lon:  -95.3698 },
    { name: 'Dallas, TX',           lat: 32.7767, lon:  -96.7970 },
    { name: 'Fort Worth, TX',       lat: 32.7555, lon:  -97.3308 },
    { name: 'Arlington, TX',        lat: 32.7357, lon:  -97.1081 },
    { name: 'Austin, TX',           lat: 30.2672, lon:  -97.7431 },
    { name: 'San Antonio, TX',      lat: 29.4241, lon:  -98.4936 },
    { name: 'El Paso, TX',          lat: 31.7619, lon: -106.4850 },
    { name: 'Lubbock, TX',          lat: 33.5779, lon: -101.8552 },
    { name: 'Amarillo, TX',         lat: 35.2220, lon: -101.8313 },
    { name: 'Corpus Christi, TX',   lat: 27.8006, lon:  -97.3964 },
    { name: 'McAllen, TX',          lat: 26.2034, lon:  -98.2300 },
    { name: 'Galveston, TX',        lat: 29.3013, lon:  -94.7977 },
    // ----- Deep South -----
    { name: 'New Orleans, LA',      lat: 29.9511, lon:  -90.0715 },
    { name: 'Baton Rouge, LA',      lat: 30.4515, lon:  -91.1871 },
    { name: 'Shreveport, LA',       lat: 32.5252, lon:  -93.7502 },
    { name: 'Lafayette, LA',        lat: 30.2241, lon:  -92.0198 },
    { name: 'Little Rock, AR',      lat: 34.7465, lon:  -92.2896 },
    { name: 'Fayetteville, AR',     lat: 36.0626, lon:  -94.1574 },
    { name: 'Jackson, MS',          lat: 32.2988, lon:  -90.1848 },
    { name: 'Biloxi, MS',           lat: 30.3960, lon:  -88.8853 },
    { name: 'Birmingham, AL',       lat: 33.5186, lon:  -86.8104 },
    { name: 'Montgomery, AL',       lat: 32.3792, lon:  -86.3077 },
    { name: 'Mobile, AL',           lat: 30.6954, lon:  -88.0399 },
    { name: 'Huntsville, AL',       lat: 34.7304, lon:  -86.5861 },
    { name: 'Memphis, TN',          lat: 35.1495, lon:  -90.0490 },
    { name: 'Nashville, TN',        lat: 36.1627, lon:  -86.7816 },
    { name: 'Knoxville, TN',        lat: 35.9606, lon:  -83.9207 },
    { name: 'Chattanooga, TN',      lat: 35.0456, lon:  -85.3097 },
    { name: 'Louisville, KY',       lat: 38.2527, lon:  -85.7585 },
    { name: 'Lexington, KY',        lat: 38.0406, lon:  -84.5037 },
    { name: 'Frankfort, KY',        lat: 38.2009, lon:  -84.8733 },
    { name: 'Charleston, WV',       lat: 38.3498, lon:  -81.6326 },
    // ----- Southeast -----
    { name: 'Atlanta, GA',          lat: 33.7490, lon:  -84.3880 },
    { name: 'Savannah, GA',         lat: 32.0809, lon:  -81.0912 },
    { name: 'Augusta, GA',          lat: 33.4735, lon:  -82.0105 },
    { name: 'Macon, GA',            lat: 32.8407, lon:  -83.6324 },
    { name: 'Columbus, GA',         lat: 32.4610, lon:  -84.9877 },
    { name: 'Charlotte, NC',        lat: 35.2271, lon:  -80.8431 },
    { name: 'Raleigh, NC',          lat: 35.7796, lon:  -78.6382 },
    { name: 'Greensboro, NC',       lat: 36.0726, lon:  -79.7920 },
    { name: 'Durham, NC',           lat: 35.9940, lon:  -78.8986 },
    { name: 'Asheville, NC',        lat: 35.5951, lon:  -82.5515 },
    { name: 'Wilmington, NC',       lat: 34.2257, lon:  -77.9447 },
    { name: 'Columbia, SC',         lat: 34.0007, lon:  -81.0348 },
    { name: 'Charleston, SC',       lat: 32.7765, lon:  -79.9311 },
    { name: 'Myrtle Beach, SC',     lat: 33.6891, lon:  -78.8867 },
    { name: 'Greenville, SC',       lat: 34.8526, lon:  -82.3940 },
    // ----- Florida -----
    { name: 'Miami, FL',            lat: 25.7617, lon:  -80.1918 },
    { name: 'Orlando, FL',          lat: 28.5383, lon:  -81.3792 },
    { name: 'Tampa, FL',            lat: 27.9506, lon:  -82.4572 },
    { name: 'St. Petersburg, FL',   lat: 27.7676, lon:  -82.6403 },
    { name: 'Jacksonville, FL',     lat: 30.3322, lon:  -81.6557 },
    { name: 'Tallahassee, FL',      lat: 30.4383, lon:  -84.2807 },
    { name: 'Fort Lauderdale, FL',  lat: 26.1224, lon:  -80.1373 },
    { name: 'West Palm Beach, FL',  lat: 26.7153, lon:  -80.0534 },
    { name: 'Pensacola, FL',        lat: 30.4213, lon:  -87.2169 },
    { name: 'Key West, FL',         lat: 24.5551, lon:  -81.7800 },
    // ----- Mid-Atlantic -----
    { name: 'Washington, DC',       lat: 38.9072, lon:  -77.0369 },
    { name: 'Richmond, VA',         lat: 37.5407, lon:  -77.4360 },
    { name: 'Virginia Beach, VA',   lat: 36.8529, lon:  -75.9780 },
    { name: 'Norfolk, VA',          lat: 36.8508, lon:  -76.2859 },
    { name: 'Roanoke, VA',          lat: 37.2710, lon:  -79.9414 },
    { name: 'Baltimore, MD',        lat: 39.2904, lon:  -76.6122 },
    { name: 'Annapolis, MD',        lat: 38.9784, lon:  -76.4922 },
    { name: 'Wilmington, DE',       lat: 39.7392, lon:  -75.5398 },
    { name: 'Dover, DE',            lat: 39.1582, lon:  -75.5244 },
    { name: 'Philadelphia, PA',     lat: 39.9526, lon:  -75.1652 },
    { name: 'Pittsburgh, PA',       lat: 40.4406, lon:  -79.9959 },
    { name: 'Harrisburg, PA',       lat: 40.2732, lon:  -76.8867 },
    { name: 'Allentown, PA',        lat: 40.6084, lon:  -75.4902 },
    { name: 'Erie, PA',             lat: 42.1292, lon:  -80.0851 },
    { name: 'Scranton, PA',         lat: 41.4090, lon:  -75.6624 },
    { name: 'Newark, NJ',           lat: 40.7357, lon:  -74.1724 },
    { name: 'Trenton, NJ',          lat: 40.2206, lon:  -74.7597 },
    { name: 'Jersey City, NJ',      lat: 40.7178, lon:  -74.0431 },
    { name: 'Atlantic City, NJ',    lat: 39.3643, lon:  -74.4229 },
    // ----- New York / New England -----
    { name: 'New York, NY',         lat: 40.7128, lon:  -74.0060 },
    { name: 'Buffalo, NY',          lat: 42.8864, lon:  -78.8784 },
    { name: 'Albany, NY',           lat: 42.6526, lon:  -73.7562 },
    { name: 'Syracuse, NY',         lat: 43.0481, lon:  -76.1474 },
    { name: 'Rochester, NY',        lat: 43.1566, lon:  -77.6088 },
    { name: 'Hartford, CT',         lat: 41.7658, lon:  -72.6734 },
    { name: 'New Haven, CT',        lat: 41.3083, lon:  -72.9279 },
    { name: 'Bridgeport, CT',       lat: 41.1865, lon:  -73.1952 },
    { name: 'Providence, RI',       lat: 41.8240, lon:  -71.4128 },
    { name: 'Boston, MA',           lat: 42.3601, lon:  -71.0589 },
    { name: 'Worcester, MA',        lat: 42.2626, lon:  -71.8023 },
    { name: 'Springfield, MA',      lat: 42.1015, lon:  -72.5898 },
    { name: 'Cambridge, MA',        lat: 42.3736, lon:  -71.1097 },
    { name: 'Portland, ME',         lat: 43.6591, lon:  -70.2568 },
    { name: 'Bangor, ME',           lat: 44.8016, lon:  -68.7712 },
    { name: 'Bar Harbor, ME',       lat: 44.3876, lon:  -68.2039 },
    { name: 'Manchester, NH',       lat: 42.9956, lon:  -71.4548 },
    { name: 'Concord, NH',          lat: 43.2081, lon:  -71.5376 },
    { name: 'Burlington, VT',       lat: 44.4759, lon:  -73.2121 },
    { name: 'Montpelier, VT',       lat: 44.2601, lon:  -72.5754 },
    // ----- Midwest -----
    { name: 'Cleveland, OH',        lat: 41.4993, lon:  -81.6944 },
    { name: 'Columbus, OH',         lat: 39.9612, lon:  -82.9988 },
    { name: 'Cincinnati, OH',       lat: 39.1031, lon:  -84.5120 },
    { name: 'Toledo, OH',           lat: 41.6528, lon:  -83.5379 },
    { name: 'Dayton, OH',           lat: 39.7589, lon:  -84.1916 },
    { name: 'Akron, OH',            lat: 41.0814, lon:  -81.5190 },
    { name: 'Detroit, MI',          lat: 42.3314, lon:  -83.0458 },
    { name: 'Grand Rapids, MI',     lat: 42.9634, lon:  -85.6681 },
    { name: 'Ann Arbor, MI',        lat: 42.2808, lon:  -83.7430 },
    { name: 'Lansing, MI',          lat: 42.7325, lon:  -84.5555 },
    { name: 'Traverse City, MI',    lat: 44.7631, lon:  -85.6206 },
    { name: 'Marquette, MI',        lat: 46.5436, lon:  -87.3954 },
    { name: 'Indianapolis, IN',     lat: 39.7684, lon:  -86.1581 },
    { name: 'Fort Wayne, IN',       lat: 41.0793, lon:  -85.1394 },
    { name: 'South Bend, IN',       lat: 41.6764, lon:  -86.2520 },
    { name: 'Evansville, IN',       lat: 37.9716, lon:  -87.5711 },
    { name: 'Bloomington, IN',      lat: 39.1653, lon:  -86.5264 },
    { name: 'Chicago, IL',          lat: 41.8781, lon:  -87.6298 },
    { name: 'Springfield, IL',      lat: 39.7817, lon:  -89.6501 },
    { name: 'Peoria, IL',           lat: 40.6936, lon:  -89.5890 },
    { name: 'Rockford, IL',         lat: 42.2711, lon:  -89.0937 },
    { name: 'Champaign, IL',        lat: 40.1164, lon:  -88.2434 },
    { name: 'Milwaukee, WI',        lat: 43.0389, lon:  -87.9065 },
    { name: 'Madison, WI',          lat: 43.0731, lon:  -89.4012 },
    { name: 'Green Bay, WI',        lat: 44.5133, lon:  -88.0133 },
    { name: 'Eau Claire, WI',       lat: 44.8113, lon:  -91.4985 },
    { name: 'Minneapolis, MN',      lat: 44.9778, lon:  -93.2650 },
    { name: 'St. Paul, MN',         lat: 44.9537, lon:  -93.0900 },
    { name: 'Duluth, MN',           lat: 46.7867, lon:  -92.1005 },
    { name: 'Rochester, MN',        lat: 44.0121, lon:  -92.4802 },
    { name: 'Des Moines, IA',       lat: 41.5868, lon:  -93.6250 },
    { name: 'Cedar Rapids, IA',     lat: 41.9779, lon:  -91.6656 },
    { name: 'Davenport, IA',        lat: 41.5236, lon:  -90.5776 },
    { name: 'Iowa City, IA',        lat: 41.6611, lon:  -91.5302 },
    { name: 'St. Louis, MO',        lat: 38.6270, lon:  -90.1994 },
    { name: 'Kansas City, MO',      lat: 39.0997, lon:  -94.5786 },
    { name: 'Springfield, MO',      lat: 37.2090, lon:  -93.2923 },
    { name: 'Columbia, MO',         lat: 38.9517, lon:  -92.3341 },
    { name: 'Jefferson City, MO',   lat: 38.5767, lon:  -92.1735 },
    // ----- Alaska / Hawaii -----
    { name: 'Anchorage, AK',        lat: 61.2181, lon: -149.9003 },
    { name: 'Juneau, AK',           lat: 58.3019, lon: -134.4197 },
    { name: 'Fairbanks, AK',        lat: 64.8378, lon: -147.7164 },
    { name: 'Honolulu, HI',         lat: 21.3069, lon: -157.8583 },
    { name: 'Hilo, HI',             lat: 19.7297, lon: -155.0900 },
    { name: 'Kahului, HI',          lat: 20.8893, lon: -156.4729 },
  ];

  // WMO weather codes we count as "raining" (drizzle, rain, freezing rain,
  // rain showers, and rain-bearing thunderstorms). Snow/fog/clear are NO.
  const RAIN_CODES = new Set([
    51, 53, 55,         // drizzle
    56, 57,             // freezing drizzle
    61, 63, 65,         // rain
    66, 67,             // freezing rain
    80, 81, 82,         // rain showers
    95, 96, 99,         // thunderstorm (rain-bearing)
  ]);

  // Codes 0 (clear) and 1 (mainly clear) count as a "clear sky". Anything
  // else — partly cloudy, overcast, fog, any precipitation — is NOT clear.
  const CLEAR_CODES = new Set([0, 1]);

  // Human-friendly labels for the post-result reveal.
  const CODE_LABELS = {
    0:  'Clear sky',
    1:  'Mainly clear',
    2:  'Partly cloudy',
    3:  'Overcast',
    45: 'Fog',
    48: 'Freezing fog',
    51: 'Light drizzle',
    53: 'Drizzle',
    55: 'Heavy drizzle',
    56: 'Freezing drizzle',
    57: 'Heavy freezing drizzle',
    61: 'Light rain',
    63: 'Rain',
    65: 'Heavy rain',
    66: 'Freezing rain',
    67: 'Heavy freezing rain',
    71: 'Light snow',
    73: 'Snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Light rain showers',
    81: 'Rain showers',
    82: 'Violent rain showers',
    85: 'Snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm w/ hail',
    99: 'Severe thunderstorm w/ hail',
  };

  // ===== Prize ladder =====
  // Rung 1 pays 0.15× the wager. Each next right answer multiplies the pot by
  // 1.75×. Max payout (rung 10) ≈ 23× wager. Player can cash out at any rung;
  // a wrong guess wipes the pot entirely.
  const LADDER_RUNGS = 10;
  const LADDER_BASE = 0.15;
  const LADDER_GROWTH = 1.75;
  function rungMultiplier(n) {
    // n is 1-based.
    return LADDER_BASE * Math.pow(LADDER_GROWTH, n - 1);
  }
  function potForRung(n, wager) {
    if (n <= 0) return 0;
    return Math.floor(rungMultiplier(n) * wager);
  }
  function formatMult(m) {
    return '×' + (m < 10 ? m.toFixed(2) : m.toFixed(1));
  }

  // ===== Pixel art =====
  // 40×44 grid, Sierra-style shading inspired by the user-supplied reference
  // (1970s TV-anchor portrait: slicked-back salt-and-pepper hair, bushy
  // brows, warm grin showing teeth, navy suit, red rose boutonnière, tie
  // with red flecks). Chip's right arm holds a wooden pointer; his LEFT arm
  // is severed at the wrist — a bright bloody stump with animated drips
  // running down the canvas in JS overlay (see drawAnimatedDrips).
  //
  // Each mood has TWO frames; the mouth swaps between closed/open so the
  // anchor visibly "talks" while a question is on screen.
  //
  // Color keys:
  //   .  transparent
  //   K  hair dark        D  hair mid-tone     G  grey (temples)
  //   F  face base        L  face highlight    f  face shadow
  //   B  eyebrow (bushy)  E  eye pupil
  //   l  lip color        W  teeth white
  //   M  mouth interior (when grimacing)
  //   N  neck             n  neck shadow
  //   J  suit navy        j  suit highlight    d  suit shadow
  //   S  shirt            T  tie               q  tie pattern dot
  //   C  rose bright      c  rose dark         v  rose leaf
  //   H  hand (skin)
  //   P  pointer wood     p  pointer shadow
  //   R  stump wound      r  blood drip
  const ART_SMUG_A = [
    '........................................',
    '........................................',
    '..................DDDD..................',
    '.................DDDDDD.................',
    '...............DDKKKKKKDD...............',
    '..............DKKKKKKKKKKD..............',
    '.............KKKKKKKKKKKKKK.............',
    '.............GKKKKKKKKKKKKG.............',
    '.............GKFFFFFFFFFFKG.............',
    '.............GFFFFFFFFFFFFG.............',
    '.............GFFFFFFFFFFFFG.............',
    '.............GFLLLLLLLLLLFG.............',
    '.............GFFFFFFFFFFFFG.............',
    '.............GBBBFFFFFFBBBG.............',
    '.............GBBBFFFFFFBBBG.............',
    '.............fFFFFFFFFFFFFf.............',
    '.............FFEEFFFFFFEEFF.............',
    '.............fFFFFFFFFFFFFf.............',
    '.............FFFFFFffFFFFFF.............',
    '.............FFFFFffffFFFFF.............',
    '.............FFllllllllllFF.............',
    '.............FFFllllllllFFF.............',
    '.............FFfFFFFFFFFfFF.............',
    '.............ffFFFFFFFFFFff.............',
    '..............fFFFFFFFFFFf..............',
    '...............fFFFFFFFFf...............',
    '..................NNNN..................',
    '..................NNnn..................',
    '..............JJjSSSSSSjJJ..............',
    '.............JJjSSSSSSSSjJJ.............',
    '............JJJjSSTTTTSSjJJJ............',
    '...........JJJjSSTqTTqTSSjJJJ...........',
    '.RRJJJJJJJJJJJjSSTqTqTTSSjJJJJJJJHHPPPPp',
    '............JJjSSTqTqTTSSjJJ............',
    '...........JJJjSSTqTqTTSSjJcC...........',
    '..........JJJJjSSTqTqTTSSjJCCJ..........',
    '.........JJJJJjSSTqTqTTSSjJCcJJ.........',
    '........JJJJJJjSSTqTqTTSSjJJJJJJ........',
    '.......JJJJJJJjSSTqTqTTSSjJJJJJJJ.......',
    '......JJJJJJJJjSSTqTqTTSSjJJJJJJJJ......',
    '.....JJJJJJJJJjSSTqTqTTSSjJJJJJJJJJ.....',
    '....JJJJJJJJJJjSSTqTqTTSSjJJJJJJJJJJ....',
    '...JJJJJJJJJJJjSSSSSSSSSSjJJJJJJJJJJJ...',
    '...dddddddddddddddddddddddddddddddddd...',
  ];

  // Frame B: open mouth showing teeth — the anchor "talks" while a question
  // is on screen by alternating A/B every ~280ms.
  const ART_SMUG_B = ART_SMUG_A.slice();
  ART_SMUG_B[20] = '.............FlllWWWWWWlllF.............';
  ART_SMUG_B[21] = '.............FFllllllllllFF.............';

  const ART_SOUR_A = ART_SMUG_A.slice();
  // Frown — mouth corners droop; closed.
  ART_SOUR_A[20] = '.............FFFllllllllFFF.............';
  ART_SOUR_A[21] = '.............FFlFFFFFFFFlFF.............';

  const ART_SOUR_B = ART_SMUG_A.slice();
  // Frown grimace — open mouth with dark interior.
  ART_SOUR_B[20] = '.............FFllllllllllFF.............';
  ART_SOUR_B[21] = '.............FFlMMMMMMMMlFF.............';

  const PALETTE = {
    K: '#1a0a04', // hair dark
    D: '#3a2818', // hair mid-tone (top highlight band)
    G: '#a8a09a', // grey temples
    F: '#e8b890', // face base
    L: '#f5d2a8', // face highlight (forehead, cheek)
    f: '#b88060', // face shadow (jaw, sides, nose)
    B: '#1a0a06', // bushy eyebrow
    E: '#1a0a08', // eye pupil
    l: '#c46850', // lip warm
    W: '#f8e8d0', // teeth white
    M: '#4a0808', // mouth interior (when grimacing)
    N: '#d8a880', // neck
    n: '#a87858', // neck shadow
    J: '#1a1a26', // suit navy base
    j: '#2a2a36', // suit highlight
    d: '#0a0a14', // suit shadow / bottom band
    S: '#e8d8c0', // shirt
    T: '#1a1a30', // tie dark navy
    q: '#a82020', // tie pattern red flecks
    C: '#d81a18', // rose bright red
    c: '#7a0a10', // rose darker red
    v: '#3a5a28', // rose leaf green
    H: '#e8b890', // hand (matches face)
    P: '#7a4a1a', // pointer wood
    p: '#4a2810', // pointer shadow tip
    R: '#c81818', // stump wound — bright blood
    r: '#6e0a0c', // drip / dark blood
  };

  // ===== Run state =====
  // States:
  //   'loading' — fetching weather for the current city; buttons disabled
  //   'guess'   — question is shown, ready for player to answer
  //   'climb'   — last guess was correct; player chooses CASH or PUSH
  //   'busted'  — last guess was wrong; pot wiped, click NEW RUN
  //   'cashed'  — player cashed out; click NEW RUN
  //
  // runActive tells us whether the wager has been spent on this run yet (so
  // we don't double-charge mid-run).
  let runState = 'loading';
  let runActive = false;
  let runWager = 0;
  let rung = 0;
  let pot = 0;
  // One free wrong answer per run. The second wrong busts as before. Reset
  // every startNewRun. Surfaced on the STRIKES LCD next to RUNG.
  const MAX_STRIKES = 1;
  let strikes = 0;
  let currentCity = null;
  let currentWeather = null;   // last fetched current_weather from Open-Meteo
  let currentQuestion = null;  // { type: 'rain' } | { type: 'temp', threshold }

  // Rain is the default; temperature and cloud questions appear occasionally.
  // Weights: 60% rain, 20% temp, 20% cloud. Retune by changing the bands.
  function pickQuestionType() {
    const r = Math.random();
    if (r < 0.60) return 'rain';
    if (r < 0.80) return 'temp';
    return 'cloud';
  }

  function composeQuestion(cw) {
    const type = pickQuestionType();
    if (type === 'rain')  return { type: 'rain' };
    if (type === 'cloud') return { type: 'cloud' };
    // Temperature: threshold is exactly ±10°F from the actual reading.
    // Actual 80°F → threshold is either 90°F (correct answer: BELOW) or
    // 70°F (correct answer: ABOVE). Always a clean coin-flip with a tell.
    const actualF = Math.round(cw.temperature);
    const sign = Math.random() < 0.5 ? -1 : 1;
    return { type: 'temp', threshold: actualF + sign * 10 };
  }

  // ===== Pixel weatherman =====
  let canvas, ctx;
  let mood = 'smug';
  let blinkUntil = 0;
  let nextBlinkAt = 0;

  // Stump column (where blood drips fall from). Hardcoded to match the
  // sprite — the stump is at row 32 cols 1-2 in the new 40×44 grid.
  const STUMP_ROW = 33;
  const STUMP_COL = 2;

  function chooseFrame(now) {
    // Talk while a question is active. During climb/busted/cashed the mouth
    // is locked closed so the result is read uninterrupted.
    const talking = runState === 'guess' || runState === 'loading';
    const isB = talking && Math.floor(now / 280) % 2 === 1;
    if (mood === 'sour') return isB ? ART_SOUR_B : ART_SOUR_A;
    return isB ? ART_SMUG_B : ART_SMUG_A;
  }

  function drawAnimatedDrips(now) {
    // Three drops staggered through a 1500ms cycle, drifting down-and-left
    // from the stump as they fall toward the bottom of the canvas.
    const CYCLE = 1500;
    const DROPS = 3;
    for (let i = 0; i < DROPS; i++) {
      const phase = ((now + i * (CYCLE / DROPS)) % CYCLE) / CYCLE; // 0..1
      // dy is how many rows below the stump the drop has fallen.
      const dy = Math.floor(phase * 11);
      // dx drifts slightly left as the drop falls.
      const dx = STUMP_COL - Math.floor(phase * 2);
      const y = STUMP_ROW + dy;
      const x = Math.max(0, dx);
      if (y >= canvas.height) continue;
      ctx.fillStyle = PALETTE.r;
      ctx.fillRect(x, y, 1, 1);
      // The freshly-cut drop near the stump gets a brighter pixel so the
      // "fresh wound" reads even when most drops are dark.
      if (phase < 0.18) {
        ctx.fillStyle = PALETTE.R;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // Backdrop tint follows the last judgment: blue while we're working a
  // question, green on a correct guess (until the player pushes or cashes
  // out), red on a bust (until they start a new run).
  function skyColors() {
    if (runState === 'climb')  return { sky: '#0a4a1a', horizon: '#1a7a3a' };
    if (runState === 'busted') return { sky: '#4a0a0a', horizon: '#7a1a1a' };
    return { sky: '#0a3a5a', horizon: '#1a5a3a' };
  }

  function drawWeatherman(now) {
    const art = chooseFrame(now);
    const W = art[0].length;
    const H = art.length;
    canvas.width = W;
    canvas.height = H;
    const colors = skyColors();
    ctx.fillStyle = colors.sky;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = colors.horizon;
    ctx.fillRect(0, H - 4, W, 4);

    const blinking = now < blinkUntil;
    for (let y = 0; y < H; y++) {
      const row = art[y];
      for (let x = 0; x < W; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        let color = PALETTE[ch];
        if (blinking && ch === 'E') color = PALETTE.F;
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    drawAnimatedDrips(now);
  }

  function tickBlink(now) {
    if (now > nextBlinkAt && now > blinkUntil) {
      blinkUntil = now + 140;
      nextBlinkAt = now + 2500 + Math.random() * 2500;
    }
  }

  function loop() {
    const now = performance.now();
    tickBlink(now);
    drawWeatherman(now);
    requestAnimationFrame(loop);
  }

  // ===== Helpers =====

  function pickCity() {
    let pick;
    do {
      pick = CITIES[Math.floor(Math.random() * CITIES.length)];
    } while (pick === currentCity && CITIES.length > 1);
    return pick;
  }

  function setStatus(text, cls) {
    const el = document.getElementById('ir-result');
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('is-win', 'is-loss', 'is-err');
    if (cls) el.classList.add(cls);
    el.classList.toggle('is-on', !!text);
  }

  function getWager() {
    const w = document.getElementById('ir-wager');
    const v = Math.max(1, Math.floor(Number(w.value) || 0));
    if (String(v) !== w.value) w.value = v;
    return v;
  }

  function renderPot(opts) {
    opts = opts || {};
    const wrap = document.querySelector('.tv-lcd-pot');
    const val = document.getElementById('ir-pot-value');
    const rungVal = document.getElementById('ir-rung-value');
    const strikesWrap = document.querySelector('.tv-lcd-strikes');
    const strikesVal = document.getElementById('ir-strikes-value');
    if (!wrap || !val) return;
    val.textContent = pot;
    if (rungVal) rungVal.textContent = rung;
    if (strikesVal) strikesVal.textContent = strikes + '/' + MAX_STRIKES;
    if (strikesWrap) {
      strikesWrap.classList.remove('is-warn');
      if (strikes >= MAX_STRIKES) strikesWrap.classList.add('is-warn');
    }
    wrap.classList.remove('is-grow', 'is-bust', 'is-cashed');
    if (opts.bust)   wrap.classList.add('is-bust');
    if (opts.cashed) wrap.classList.add('is-cashed');
    if (opts.grow) {
      // Re-trigger the bump animation by toggling the class on next frame.
      requestAnimationFrame(() => wrap.classList.add('is-grow'));
    }
  }

  // Slam the big red ✕ over the CRT for the duration of the CSS animation.
  // Class is removed at the end so the same node can re-fire on the next
  // strike (e.g. a fresh run that strikes again on its first guess).
  function flashStrikeX() {
    const el = document.getElementById('ir-strike-x');
    if (!el) return;
    el.classList.remove('is-on');
    // Force reflow so the animation restarts even if the class is reapplied
    // before the browser has rendered the removal.
    void el.offsetWidth;
    el.classList.add('is-on');
    setTimeout(() => el.classList.remove('is-on'), 1200);
  }

  function renderLadder() {
    const lists = document.querySelectorAll('.ir-ladder-list');
    if (!lists.length) return;
    // Use the locked wager during an active run, otherwise the live input
    // value so the player can preview payouts before committing.
    const wager = runActive ? runWager : getWager();
    lists.forEach((list) => {
      list.innerHTML = '';
      for (let n = 1; n <= LADDER_RUNGS; n++) {
        const li = document.createElement('li');
        li.className = 'ir-ladder-rung';
        if (n <= rung) li.classList.add('is-climbed');
        if (n === rung) li.classList.add('is-current');
        if (n === rung + 1 && (runState === 'guess' || runState === 'climb'))
          li.classList.add('is-next');
        const mult = rungMultiplier(n);
        const coins = potForRung(n, wager);
        li.innerHTML =
          '<span class="ir-ladder-mult">' + formatMult(mult) + '</span>' +
          '<span class="ir-ladder-coins">' + coins + '</span>';
        list.appendChild(li);
      }
    });
  }

  // The on-screen question text is split into prefix/city/suffix so we can
  // swap between "Is it raining in CITY?" and "In CITY, above 65°F?" without
  // rebuilding the DOM each time.
  function renderQuestion() {
    const prefix = document.getElementById('ir-q-prefix');
    const cityEl = document.getElementById('ir-city');
    const suffix = document.getElementById('ir-q-suffix');
    if (!prefix || !cityEl || !suffix) return;
    cityEl.textContent = currentCity ? currentCity.name : '—';
    if (!currentQuestion) {
      prefix.textContent = 'Tuning in to';
      suffix.textContent = '…';
      return;
    }
    // Every question phrases as a clean yes/no so the buttons can stay
    // labelled YES / NO regardless of round type.
    if (currentQuestion.type === 'rain') {
      prefix.textContent = 'Is it raining in';
      suffix.textContent = '?';
    } else if (currentQuestion.type === 'cloud') {
      prefix.textContent = 'Is the sky clear in';
      suffix.textContent = '?';
    } else {
      prefix.textContent = 'Is it above ' + currentQuestion.threshold + '°F in';
      suffix.textContent = '?';
    }
  }

  function setButtons() {
    const yes  = document.getElementById('ir-yes');
    const no   = document.getElementById('ir-no');
    const cash = document.getElementById('ir-cash');
    const next = document.getElementById('ir-next');
    const restart = document.getElementById('ir-restart');
    const wager = document.getElementById('ir-wager');
    const max   = document.getElementById('ir-max');

    // Wager input locks the moment a run starts charging. It opens back up at
    // 'busted' and 'cashed' so the next run can have a fresh stake.
    wager.disabled = runActive;
    max.disabled   = runActive;

    // YES / NO live in their own row and stay visible the whole time so the
    // player always knows where the answer buttons are. They just disable
    // when there's no question to answer.
    yes.hidden = no.hidden = false;
    yes.textContent = '✓ YES';
    no.textContent  = '✗ NO';
    const answerable = (runState === 'guess');
    yes.disabled = no.disabled = !answerable;

    // Decision buttons live in their own row below. Hidden by default; shown
    // only in the states that require them.
    cash.hidden = next.hidden = restart.hidden = true;

    if (runState === 'climb') {
      cash.hidden = false;
      next.hidden = false;
      cash.textContent = '💰 CASH · ' + pot;
      next.textContent = 'PUSH IT →';
    } else if (runState === 'busted' || runState === 'cashed') {
      restart.hidden = false;
      restart.textContent = 'NEW RUN →';
    }
  }

  async function fetchWeather(city) {
    // temperature_unit=fahrenheit because the game is American-cities themed
    // and the temperature questions are scored in °F.
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' +
      city.lat + '&longitude=' + city.lon +
      '&current_weather=true&temperature_unit=fahrenheit';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Weather API ' + res.status);
    const data = await res.json();
    if (!data || !data.current_weather) throw new Error('Malformed response');
    return data.current_weather;
  }

  // ===== Flow =====

  async function loadCity() {
    runState = 'loading';
    currentCity = pickCity();
    currentWeather = null;
    currentQuestion = null;
    renderQuestion();
    setStatus('Tuning in…', null);
    setButtons();
    if (global.IRSound) global.IRSound.channelChange();

    let cw;
    try {
      cw = await fetchWeather(currentCity);
    } catch (e) {
      // No data. If this happened on the very first lookup of a run (wager not
      // yet spent), the player loses nothing — they just click NEW RUN and we
      // try another city. If they're mid-run with an active pot, we drop them
      // back into 'climb' so they can either cash out their current pot or
      // push again (which retries the load).
      if (runActive) {
        runState = 'climb';
        setStatus("Signal's out — cash out, or push to retry.", 'is-err');
      } else {
        runState = 'cashed';
        setStatus("Signal's out. Try NEW RUN.", 'is-err');
      }
      setButtons();
      return;
    }

    currentWeather = cw;
    currentQuestion = composeQuestion(cw);
    runState = 'guess';
    renderQuestion();
    setStatus('', null);
    setButtons();
  }

  function startNewRun() {
    if (global.IRSound) global.IRSound.powerOn();
    runActive = false;
    runWager = 0;
    rung = 0;
    pot = 0;
    strikes = 0;
    mood = 'smug';
    renderPot();
    renderLadder();
    loadCity();
  }

  function pushIt() {
    if (runState !== 'climb') return;
    if (global.IRSound) global.IRSound.pushIt();
    loadCity();
  }

  function evaluateGuess(yesPressed) {
    // rain:  YES = "it's raining"
    // cloud: YES = "the sky is clear"
    // temp:  YES = "above the threshold"
    if (currentQuestion.type === 'rain') {
      const raining = RAIN_CODES.has(currentWeather.weathercode);
      return { correct: yesPressed === raining, raining };
    }
    if (currentQuestion.type === 'cloud') {
      const isClear = CLEAR_CODES.has(currentWeather.weathercode);
      return { correct: yesPressed === isClear, isClear };
    }
    const actualF = Math.round(currentWeather.temperature);
    const isAbove = actualF > currentQuestion.threshold;
    return { correct: yesPressed === isAbove, isAbove, actualF };
  }

  function formatRevealText(judgment, correct) {
    const tempF = Math.round(currentWeather.temperature);
    const label = CODE_LABELS[currentWeather.weathercode] ||
      ('Code ' + currentWeather.weathercode);
    if (currentQuestion.type === 'rain') {
      const lead = correct
        ? (judgment.raining ? '☂ Raining — ' : '☀ Dry — ')
        : (judgment.raining ? '☂ Actually raining — ' : '☀ Actually dry — ');
      return lead + label + ', ' + tempF + '°F';
    }
    if (currentQuestion.type === 'cloud') {
      const lead = correct
        ? (judgment.isClear ? '☀ Clear — ' : '☁ Cloudy — ')
        : (judgment.isClear ? '☀ Actually clear — ' : '☁ Actually cloudy — ');
      return lead + label + ', ' + tempF + '°F';
    }
    const lead = correct
      ? (judgment.isAbove ? '↑ Above — ' : '↓ Below — ')
      : (judgment.isAbove ? '↑ Actually above — ' : '↓ Actually below — ');
    return lead + judgment.actualF + '°F vs ' + currentQuestion.threshold + '°F';
  }

  function answer(yesPressed) {
    if (runState !== 'guess') return;
    if (global.IRSound) global.IRSound.click();

    // Spend the wager the first time the player commits to a guess this run.
    if (!runActive) {
      const wager = getWager();
      if (!Wallet.spend(wager)) {
        if (global.IRSound) global.IRSound.broke();
        setStatus("You're broke. Lower the wager.", 'is-err');
        return;
      }
      if (global.Child && typeof global.Child.recordPlay === 'function') {
        global.Child.recordPlay();
      }
      runWager = wager;
      runActive = true;
    }

    const judgment = evaluateGuess(yesPressed);
    const reveal = formatRevealText(judgment, judgment.correct);

    if (judgment.correct) {
      rung += 1;
      pot = potForRung(rung, runWager);
      mood = 'sour';
      runState = 'climb';
      setStatus(reveal + ' · pot ' + pot, 'is-win');
      renderPot({ grow: true });
      renderLadder();
      setButtons();
      if (global.IRSound) global.IRSound.correct(rung);
    } else {
      // One free strike per run: first wrong keeps pot/rung, drops into climb
      // so the player can CASH or PUSH; the second wrong busts as before.
      strikes += 1;
      if (strikes <= MAX_STRIKES) {
        mood = 'smug';
        runState = 'climb';
        setStatus(reveal + ' · STRIKE ' + strikes + '/' + MAX_STRIKES + ' · pot ' + pot, 'is-loss');
        renderPot();
        renderLadder();
        setButtons();
        flashStrikeX();
        if (global.IRSound) global.IRSound.wrong();
      } else {
        mood = 'smug';
        const lost = pot + runWager;
        pot = 0;
        rung = 0;
        runActive = false;
        runState = 'busted';
        setStatus(reveal + ' · −' + lost + ' coins', 'is-loss');
        renderPot({ bust: true });
        renderLadder();
        setButtons();
        if (global.IRSound) global.IRSound.wrong();
      }
    }
  }

  function cashOut() {
    if (runState !== 'climb') return;
    const won = pot;
    Wallet.add(won);
    setStatus('Cashed out: +' + won + ' coins. Smug man weeps.', 'is-win');
    // Leave pot/rung on display so the player can see their winning haul
    // until they explicitly start a NEW RUN.
    runActive = false;
    runState = 'cashed';
    mood = 'sour';
    renderPot({ cashed: true });
    renderLadder();
    setButtons();
    if (global.IRSound) global.IRSound.cashOut();
  }

  function bind() {
    document.getElementById('ir-yes').addEventListener('click', () => answer(true));
    document.getElementById('ir-no').addEventListener('click',  () => answer(false));
    document.getElementById('ir-cash').addEventListener('click', cashOut);
    document.getElementById('ir-next').addEventListener('click', pushIt);
    document.getElementById('ir-restart').addEventListener('click', startNewRun);
    document.getElementById('ir-max').addEventListener('click', () => {
      const w = document.getElementById('ir-wager');
      w.value = Math.max(1, Wallet.getBalance());
      renderLadder();
    });
    document.getElementById('ir-wager').addEventListener('input', () => {
      // Live-update the ladder's coin column as the player adjusts the stake.
      if (!runActive) renderLadder();
    });
    const muteBtn = document.getElementById('ir-mute');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        const wasMuted = global.IRSound && global.IRSound.isMuted();
        if (global.IRSound) global.IRSound.setMuted(!wasMuted);
        muteBtn.textContent = wasMuted ? '🔊' : '🔇';
        muteBtn.classList.toggle('is-muted', !wasMuted);
        // Click feedback only when un-muting — otherwise we'd play a click
        // and then mute, which is a confusing one-shot artifact.
        if (wasMuted && global.IRSound) global.IRSound.click();
      });
    }
  }

  // Decorative content for the scrolling mini-TVs. Quotes channel pulls our
  // weather-noir originals plus the literary fragments from window.Quotes
  // (mirror of assets/json/quotes.json). Ads channel mixes our fake 70s products
  // with the palace taglines from window.Taglines.normal (uppercased + ★).
  const QUOTES_BASE = [
    'CHIP THE SMUG NEVER SLEEPS',
    'EVERY CLOUD HAS ITS ALIBI',
    "FORECASTS LIE — SKIES DON'T",
    'TOMORROW IT WILL RAIN ON SOMEONE',
    'THE BAROMETER REMEMBERS YOUR NAME',
    'BRING AN UMBRELLA TO YOUR OWN FUNERAL',
    'IF YOU CAN SEE THE STARS YOU ARE ALREADY LOST',
    'WEATHER IS WHAT HAPPENS WHILE YOU MAKE OTHER PLANS',
    'A WARM FRONT IS COMING. PRETEND TO BE SURPRISED',
    'THE STORM ALWAYS ARRIVES. BE PATIENT',
    'NICE DAY FOR A WALK. SOMEWHERE ELSE',
  ];
  const ADS_BASE = [
    "★ CARTER'S LITTLE LIVER PILLS — for TIRED BLOOD",
    '★ MAKE TONITE A KOJAK NITE — only on CHANNEL 13',
    "★ DOC PURPLE'S NERVE TONIC — free coupon inside",
    '★ THE SUCCESS-O-MATIC — yours for just $19.95',
    '★ STAY UP LATE WITH FORTUNA-VISION',
    "★ BUDDY'S BURGER BARN — open till 11, even SUNDAYS",
    '★ NEW from NORGE — the AVOCADO refrigerator of TOMORROW',
    '★ FEELING DRAFTY? call MIDWEST STORM WINDOWS today',
    '★ ASK YOUR DOCTOR about MAGNATEC PIPE TOBACCO',
    "★ FORTUNA'S PALACE — where every dream comes true",
  ];
  const externalQuotes = Array.isArray(global.Quotes) ? global.Quotes : [];
  const externalTaglines =
    (global.Taglines && Array.isArray(global.Taglines.normal))
      ? global.Taglines.normal
      : [];
  const SCROLL_QUOTES = QUOTES_BASE.concat(externalQuotes);
  // Ads channel keeps just our 70s product spots — it stays short and snappy.
  const SCROLL_ADS = ADS_BASE.slice();
  // Taglines now get their own dedicated mode, framed like a Fortuna's Palace
  // station-ident loop.
  const SCROLL_TAGLINES = externalTaglines.map((t) => '✦ ' + t + ' ✦');

  // Inject per-mode content into the wall of background mini TVs (labels,
  // scanline overlays). Pure decoration so it's all aria-hidden upstream.
  function decorateMiniTVs() {
    const STANDBY_TEXTS = [
      '◯<br>PLEASE<br>STAND BY',
      '◯<br>BE RIGHT<br>BACK',
      '◯<br>STAND BY<br>13',
    ];
    let standbyIdx = 0;
    document.querySelectorAll('.tv-mini').forEach((tv) => {
      const mode = tv.dataset.mode;
      if (mode === 'standby') {
        const lab = document.createElement('div');
        lab.className = 'standby-label';
        lab.innerHTML = STANDBY_TEXTS[standbyIdx % STANDBY_TEXTS.length];
        standbyIdx++;
        tv.appendChild(lab);
      } else if (mode === 'channel') {
        const lab = document.createElement('div');
        lab.className = 'ch-label';
        lab.innerHTML = 'CH<span class="ch-num">' +
          (tv.dataset.ch || '00') + '</span>';
        tv.appendChild(lab);
      } else if (mode === 'off') {
        const scan = document.createElement('div');
        scan.className = 'off-scan';
        tv.appendChild(scan);
      } else if (mode === 'child-face') {
        // Pulled from window.Child — same tama-face frames the lobby widget
        // uses, but here we render it upside-down, smeared, and flickering.
        // Falls back to a static glyph if Child isn't loaded.
        const face = document.createElement('div');
        face.className = 'child-face-display';
        tv.appendChild(face);
        let frameIdx = 0;
        function paintChildFace() {
          if (!global.Child || typeof global.Child.describeFace !== 'function') {
            face.textContent = '(✗_✗)';
            return;
          }
          const d = global.Child.describeFace(global.Child.getState());
          face.textContent = d.frames[frameIdx % d.frames.length];
          face.dataset.mood = d.mood;
          frameIdx++;
        }
        paintChildFace();
        // Slow-ish cycle so the distortion reads, not just blinking ASCII.
        setInterval(paintChildFace, 620);
      } else if (mode === 'quotes' || mode === 'ads' || mode === 'taglines') {
        const pool = mode === 'quotes' ? SCROLL_QUOTES :
                     mode === 'ads'    ? SCROLL_ADS    : SCROLL_TAGLINES;
        // Outer track scrolls; inner span carries the styling so the quotes
        // channel's jitter doesn't fight the scroll transform.
        const track = document.createElement('div');
        track.className = 'scroll-track scroll-' + mode;
        const marquee = document.createElement('div');
        marquee.className = 'scroll-marquee';
        // Duplicate the joined text so the loop is seamless when the marquee
        // wraps from -50% back to 0%.
        const joined = pool.join('   ·   ');
        marquee.innerHTML = '<span class="scroll-text">' + joined +
          '   ·   ' + joined + '   ·   </span>';
        // Pace each channel by content length so adding lines makes the
        // scroll longer, not faster. ~9 chars/sec is comfortably readable.
        const CHARS_PER_SEC = 9;
        const cycleSec = Math.max(45, Math.round(joined.length / CHARS_PER_SEC));
        marquee.style.animationDuration = cycleSec + 's';
        track.appendChild(marquee);
        tv.appendChild(track);
      }
    });
  }

  function init() {
    canvas = document.getElementById('weatherman-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    bind();
    decorateMiniTVs();
    startNewRun();
    requestAnimationFrame(loop);
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);

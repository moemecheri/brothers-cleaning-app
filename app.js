(function(){
'use strict';
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function lsGet(k, fb){ try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch(e){ return fb; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
function money(n){ return '$' + Math.round(n).toLocaleString('en-CA'); }
function r5(n){ return Math.max(0, Math.round(n / 5) * 5); }
function hrs(h){ var q = Math.max(0.25, Math.round(h * 4) / 4); return String(+q.toFixed(2)) + (q === 1 ? ' hr' : ' hrs'); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function plural(n, one, many){ return n + ' ' + (n === 1 ? one : (many || one + 's')); }
function todayISO(){ var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }

/* =========================================================
   PRICING DATA (Ottawa going rates, see "Where these prices come from")
   ========================================================= */
var OFREQ = {
  once:     {label:'One time',      word:'one-time',       visits:0,     price:1.6,  time:1.8,  min:180},
  monthly:  {label:'Monthly',       word:'monthly',        visits:1,     price:1.25, time:1.3,  min:110},
  biweekly: {label:'Every 2 weeks', word:'every 2 weeks',  visits:2.17,  price:1.12, time:1.15, min:110},
  weekly:   {label:'Weekly',        word:'weekly',         visits:4.33,  price:1,    time:1,    min:110},
  x2:       {label:'2× a week',     word:'2 times a week', visits:8.67,  price:0.6,  time:0.8,  min:70},
  x3:       {label:'3× a week',     word:'3 times a week', visits:13,    price:0.48, time:0.7,  min:60},
  x5:       {label:'5× a week',     word:'5 times a week', visits:21.67, price:0.35, time:0.6,  min:50}
};
var OTYPE = {
  office:  {label:'Office',                 f:1},
  medical: {label:'Medical / dental clinic', f:1.35},
  retail:  {label:'Store',                  f:1.1},
  daycare: {label:'Daycare / school',       f:1.25},
  gym:     {label:'Gym / studio',           f:1.15}
};
/* price per sq ft per weekly visit, by slice of the space (bigger = cheaper per sq ft) */
var BRACKETS = [[1000, 0.13], [2000, 0.08], [3000, 0.06], [6000, 0.05], [Infinity, 0.04]];
var HFREQ = {
  once:     {label:'One time',      word:'one-time',      visits:0,    disc:0,    time:1},
  monthly:  {label:'Monthly',       word:'monthly',       visits:1,    disc:0.10, time:1},
  biweekly: {label:'Every 2 weeks', word:'every 2 weeks', visits:2.17, disc:0.15, time:0.85},
  weekly:   {label:'Weekly',        word:'weekly',        visits:4.33, disc:0.20, time:0.75}
};
var HTYPE = {
  standard: {label:'Standard', mult:1,    time:1},
  deep:     {label:'Deep',     mult:1.6,  time:1.7},
  move:     {label:'Move in / move out', mult:1.85, time:1.9}
};
var HSIZE = {
  s0: {label:'under 1,000 sq ft', adj:-10, h:-0.3},
  s1: {label:'1,000–1,999 sq ft', adj:0,   h:0},
  s2: {label:'2,000–2,999 sq ft', adj:30,  h:0.5},
  s3: {label:'3,000+ sq ft',      adj:65,  h:1.0}
};

var DEFAULT_Q = {kind:'office', client:'', area:'', otype:'office', sqft:1200, wash:1, kitchen:true, ofreq:'weekly', firstDeep:true,
  bed:3, full:2, half:0, hsize:'s1', htype:'standard', hfreq:'biweekly', oven:false, fridge:false, cabinets:false, baseboards:false,
  basement:false, pets:false, windows:0, stairs:1, disc:10, hst:false, leadId:''};
var Q = Object.assign({}, DEFAULT_Q, lsGet('bc-quote', {}));
var ME = Object.assign({name:'Moe', phone:'', email:'bc_solution@myyahoo.com', address:'119 Winterhaven Drive, Orléans, ON K1W 0H3'}, lsGet('bc-me', {}));
if (!ME.address) ME.address = '119 Winterhaven Drive, Orléans, ON K1W 0H3';

function sqftBase(s){
  var rem = Math.max(0, s), t = 0;
  for (var i = 0; i < BRACKETS.length && rem > 0; i++){ var p = Math.min(rem, BRACKETS[i][0]); t += p * BRACKETS[i][1]; rem -= p; }
  return t;
}

function calcOffice(q){
  var fr = OFREQ[q.ofreq] || OFREQ.weekly, ty = OTYPE[q.otype] || OTYPE.office;
  var sq = Math.max(100, +q.sqft || 0), wash = Math.max(0, +q.wash || 0);
  var weeklyBase = sqftBase(sq) * ty.f + Math.max(0, wash - 1) * 12 + (q.kitchen ? 0 : -8);
  var mid = r5(Math.max(fr.min, weeklyBase * fr.price));
  var workBase = (sq / 2200 + 0.25 * wash + (q.kitchen ? 0.25 : 0) + 0.15) * ty.f;
  var res = {kind:'office', fr:fr, mid:mid, low:r5(mid * 0.8), high:r5(mid * 1.3), hours: workBase * fr.time, visits: fr.visits, first:null};
  if (q.ofreq !== 'once' && q.firstDeep){
    var fmid = r5(Math.max(OFREQ.once.min, weeklyBase * OFREQ.once.price));
    res.first = {mid:fmid, hours: workBase * OFREQ.once.time, label:'First visit (deep clean)'};
  }
  return res;
}

function calcHouse(q){
  var ty = HTYPE[q.htype] || HTYPE.standard;
  var fkey = q.htype === 'move' ? 'once' : q.hfreq;
  var fr = HFREQ[fkey] || HFREQ.once, sz = HSIZE[q.hsize] || HSIZE.s1;
  var bed = Math.max(0, +q.bed || 0), full = Math.max(0, +q.full || 0), half = Math.max(0, +q.half || 0);
  var stairs = Math.max(0, +q.stairs || 0), win = Math.max(0, +q.windows || 0);
  var base = 85 + 18 * bed + 25 * full + 12 * half + sz.adj + (q.basement ? 40 : 0) + 10 * stairs;
  var workBase = 1.0 + 0.45 * bed + 0.6 * full + 0.3 * half + sz.h + (q.basement ? 0.6 : 0) + 0.15 * stairs;
  var extras = 0, extrasH = 0;
  if (q.oven){ extras += 35; extrasH += 0.75; }
  if (q.fridge){ extras += 35; extrasH += 0.5; }
  if (q.cabinets && q.htype !== 'move'){ extras += 40; extrasH += 0.75; }
  if (q.baseboards && q.htype === 'standard'){ extras += 30; extrasH += 0.5; }
  if (win){ extras += 6 * win; extrasH += 0.1 * win; }
  var pets = q.pets ? 15 : 0, petsH = q.pets ? 0.25 : 0;
  var firstMid = r5(Math.max(120, base * ty.mult + extras + pets));
  var firstHours = workBase * ty.time + extrasH + petsH;
  if (fkey === 'once'){
    return {kind:'house', fr:fr, fkey:fkey, mid:firstMid, low:r5(firstMid * 0.85), high:r5(firstMid * 1.25), hours:firstHours, visits:0, first:null};
  }
  var mid = r5(Math.max(100, base * (1 - fr.disc) + pets));
  return {kind:'house', fr:fr, fkey:fkey, mid:mid, low:r5(mid * 0.85), high:r5(mid * 1.25), hours: workBase * fr.time + petsH, visits: fr.visits,
    first:{mid:firstMid, hours:firstHours, label: q.htype === 'deep' ? 'First visit (deep clean)' : 'First visit'}};
}

function calc(){ return Q.kind === 'office' ? calcOffice(Q) : calcHouse(Q); }
function yourPrice(mid){ return r5(mid * (1 - (Q.disc || 0) / 100)); }

/* =========================================================
   QUOTE FORM
   ========================================================= */
var numIds = ['sqft','wash','bed','full','half','windows','stairs'];
var checkIds = ['kitchen','firstDeep','oven','fridge','cabinets','baseboards','basement','pets','hst'];
var radioNames = ['ofreq','htype','hfreq','disc'];

function fillForm(){
  $('#client').value = Q.client; $('#area').value = Q.area; $('#otype').value = Q.otype; $('#hsize').value = Q.hsize;
  numIds.forEach(function(id){ $('#' + id).value = Q[id]; });
  checkIds.forEach(function(id){ $('#' + id).checked = !!Q[id]; });
  radioNames.forEach(function(n){ var el = $('input[name="' + n + '"][value="' + Q[n] + '"]'); if (el) el.checked = true; });
}

function readForm(){
  Q.client = $('#client').value.trim(); Q.area = $('#area').value.trim(); Q.otype = $('#otype').value; Q.hsize = $('#hsize').value;
  numIds.forEach(function(id){ var v = parseInt($('#' + id).value, 10); Q[id] = isNaN(v) ? 0 : v; });
  checkIds.forEach(function(id){ Q[id] = $('#' + id).checked; });
  radioNames.forEach(function(n){ var el = $('input[name="' + n + '"]:checked'); if (el) Q[n] = n === 'disc' ? +el.value : el.value; });
}

function syncVisibility(){
  var office = Q.kind === 'office';
  $('#office-fields').hidden = !office; $('#house-fields').hidden = office;
  $('#office-fields').style.display = office ? 'flex' : 'none';
  $('#house-fields').style.display = office ? 'none' : 'flex';
  $('#k-office').setAttribute('aria-pressed', office); $('#k-house').setAttribute('aria-pressed', !office);
  $('#firstDeep-wrap').hidden = Q.ofreq === 'once';
  var move = Q.htype === 'move';
  $$('input[name="hfreq"]').forEach(function(r){ r.disabled = move && r.value !== 'once'; });
  if (move){ $('#hf-once').checked = true; }
  $('#cabinets-wrap').hidden = move;
  $('#baseboards-wrap').hidden = Q.htype !== 'standard';
  $('#client').placeholder = office ? 'e.g. Innes Road Dental' : 'e.g. Sarah T.';
}

function onQuoteChange(){
  readForm();
  if (Q.htype === 'move') Q.hfreq = 'once';
  /* the 'change' that follows typing must not redraw the buttons mid-tap */
  var sig = JSON.stringify(Q); if (sig === onQuoteChange.last) return; onQuoteChange.last = sig;
  syncVisibility(); lsSet('bc-quote', Q); renderResult(); stepsDirty = true;
}

function renderResult(){
  var r = calc(), d = Q.disc || 0, you = yourPrice(r.mid), recurring = r.visits > 0;
  var month = recurring ? r5(you * r.visits) : 0;
  var firstYou = r.first ? yourPrice(r.first.mid) : 0;
  var perHour = you / Math.max(0.25, r.hours);
  var unit = recurring ? 'per visit' : 'for the job';
  var html = '';
  html += '<div class="market"><div class="eyebrow">Ottawa going rate</div>' +
          '<div class="market-line"><span class="market-price">' + money(r.mid) + '</span><span class="market-range">' + unit + ' · usual range ' + money(r.low) + '–' + money(r.high) + '</span></div></div>';
  html += '<div class="pricetag"><div class="pt-label">Your starter price' + (d ? ' · ' + d + '% under' : '') + '</div>' +
          '<div class="pt-price">' + money(you) + ' <small>' + unit + '</small></div>' +
          (recurring ? '<div class="pt-sub">≈ ' + money(month) + ' a month · ' + r.fr.word + '</div>' : '<div class="pt-sub">' + (Q.kind === 'house' ? (HTYPE[Q.htype].label + ' clean, one time') : 'One-time clean') + '</div>') +
          '</div>';
  var facts = [];
  if (r.first) facts.push([r.first.label, money(firstYou)]);
  facts.push(['Work time per visit', hrs(r.hours) + ' · about ' + hrs(r.hours / 2) + ' with 2 of you']);
  if (r.first) facts.push(['First visit work time', hrs(r.first.hours)]);
  facts.push(['You make per work hour', money(perHour) + ' <small>(before gas & supplies)</small>']);
  if (recurring) facts.push(['Per year', money(month * 12)]);
  if (Q.hst){
    facts.push(['With 13% HST', money(you * 1.13) + ' ' + unit + (recurring ? ' · ' + money(month * 1.13) + '/mo' : '')]);
  }
  html += '<dl class="facts">' + facts.map(function(f){ return '<div><dt>' + f[0] + '</dt><dd>' + f[1] + '</dd></div>'; }).join('') + '</dl>';
  if (perHour < 35){
    html += '<div class="alert warn">That works out to under $35 per work hour. Ottawa cleaners charge about $30–$45 an hour each, so you\'d barely cover gas and supplies. Lower the discount or raise the price.</div>';
  } else if (Q.kind === 'office' && Q.otype === 'medical'){
    html += '<div class="alert warn">Clinics need extra care: never touch sharps bins or biohazard bags. Ask what disinfectant they want you to use.</div>';
  }
  html += '<div class="actions"><button type="button" class="btn primary" id="copyQuote">Copy quote for client</button><button type="button" class="btn dark" id="saveLead">' + (linkedLead() ? 'Update this lead' : 'Save to leads') + '</button><button type="button" class="btn ghost" id="toSteps">Make a job from this →</button></div>' +
          '<div class="status-msg" id="quoteMsg" role="status"></div>' +
          '<textarea id="quoteText" class="copybox" readonly hidden aria-label="Quote text"></textarea>';
  $('#result').innerHTML = html;
  $('#copyQuote').addEventListener('click', function(){ copyText(quoteMessage(), $('#quoteText'), $('#quoteMsg'), 'Copied. Paste it into a text or email.'); });
  $('#saveLead').addEventListener('click', saveQuoteAsLead);
  $('#toSteps').addEventListener('click', function(){ openNewJob(); });
  $('#stripPrice').textContent = money(you) + (recurring ? ' / visit' : '');
  $('#stripSub').textContent = recurring ? '≈ ' + money(month) + ' a month' : 'Going rate ' + money(r.mid);
}

function quoteMessage(){
  var r = calc(), you = yourPrice(r.mid), recurring = r.visits > 0, month = recurring ? r5(you * r.visits) : 0;
  var hstTag = Q.hst ? ' + HST' : '';
  var hi = 'Hi' + (Q.client ? ' ' + Q.client : '') + ',';
  var lines = [hi, '', 'Thanks for your time. Here is your cleaning quote from Brothers Cleaning Solution.', ''];
  var inc;
  if (Q.kind === 'office'){
    var ty = OTYPE[Q.otype];
    lines.push('Place: ' + ty.label + ', about ' + Number(Q.sqft).toLocaleString('en-CA') + ' sq ft, ' + plural(Q.wash, 'washroom') + (Q.kitchen ? ', kitchen/break room' : '') + (Q.area ? ' (' + Q.area + ')' : ''));
    lines.push('Schedule: ' + r.fr.label);
    if (recurring){
      lines.push('Price: ' + money(you) + ' per visit' + hstTag + ' (about ' + money(month) + ' a month, billed monthly)');
      if (r.first) lines.push('First visit, full deep clean: ' + money(yourPrice(r.first.mid)) + hstTag);
    } else {
      lines.push('Price: ' + money(you) + hstTag + ' for the job');
    }
    inc = ['Empty all garbage and recycling, new liners', 'Dust and wipe desks, ledges and surfaces', 'Disinfect door handles, light switches and other high-touch spots',
      'Clean and disinfect washrooms: toilets, sinks, mirrors, floors', 'Refill paper towel, toilet paper and soap from your supply'];
    if (Q.kitchen) inc.push('Kitchen/break room: counters, sink, tables, outside of appliances');
    inc.push('Vacuum carpets and mop hard floors');
    if (r.first || Q.ofreq === 'once') inc.push('Deep clean adds: baseboards, door frames, vents, inside microwave, wall marks');
    lines.push('', 'Each visit includes:');
    inc.forEach(function(t){ lines.push('- ' + t); });
    lines.push('', 'We can clean after hours, evenings or weekends, so your team is never disturbed. No long contract: 30 days notice to stop.');
  } else {
    var ht = HTYPE[Q.htype], sz = HSIZE[Q.hsize];
    lines.push('Home: ' + plural(Q.bed, 'bedroom') + ', ' + plural(Q.full, 'bathroom') + (Q.half ? ', ' + plural(Q.half, 'half bath', 'half baths') : '') + ', ' + sz.label + (Q.area ? ' (' + Q.area + ')' : ''));
    if (recurring){
      lines.push(r.first.label + ': ' + money(yourPrice(r.first.mid)) + hstTag);
      lines.push('Then ' + r.fr.word + ': ' + money(you) + ' per visit' + hstTag + ' (about ' + money(month) + ' a month)');
    } else {
      lines.push(ht.label + ' clean: ' + money(you) + hstTag);
    }
    var ex = [];
    if (Q.oven) ex.push('inside oven'); if (Q.fridge) ex.push('inside fridge');
    if (Q.cabinets && Q.htype !== 'move') ex.push('inside cabinets');
    if (Q.baseboards && Q.htype === 'standard') ex.push('baseboards');
    if (Q.windows) ex.push(plural(Q.windows, 'window') + ' (inside)');
    if (ex.length) lines.push('Extras included' + (recurring ? ' on the first visit' : '') + ': ' + ex.join(', '));
    inc = ['Kitchen: counters, stovetop, sink, outside of appliances, microwave inside and out', 'Bathrooms: shower/tub, toilet, sink, mirrors, floors',
      'Bedrooms and living areas: dusting, surfaces, mirrors', 'Vacuum and mop all floors, garbage taken out'];
    if (Q.htype === 'deep') inc.push('Deep clean adds: baseboards, door frames, light switches, vents, window sills');
    if (Q.htype === 'move') inc.push('Move-out adds: inside all cabinets, drawers, closets, fridge and oven, wall marks');
    lines.push('', 'Included:');
    inc.forEach(function(t){ lines.push('- ' + t); });
    lines.push('', 'We bring all our own supplies.');
  }
  lines.push('', 'Reply here to book, or with any questions.', '', (ME.name ? ME.name + ', ' : '') + 'Brothers Cleaning Solution' + (ME.phone ? '\n' + ME.phone : '') + (ME.email ? '\n' + ME.email : ''));
  return lines.join('\n');
}

/* copy helper: clipboard first, then show selectable text */
function copyText(text, box, msgEl, okMsg){
  function fallback(){
    box.hidden = false; box.value = text; box.focus(); box.select();
    msgEl.style.color = ''; msgEl.textContent = 'Copy didn\'t work here. The text is selected below — copy it by hand.';
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){ box.hidden = true; msgEl.textContent = okMsg; setTimeout(function(){ if (msgEl.textContent === okMsg) msgEl.textContent = ''; }, 3500); }, fallback);
    } else fallback();
  } catch(e){ fallback(); }
}


/* S(id, title, cloths, tasks, note, stop, photo): photo = this room gets a Before and After photo. */
function S(id, title, cloths, tasks, note, stop, photo){ return {id:id, title:title, cloths:cloths, tasks:tasks, note:note || '', stop:!!stop, photo:!!photo}; }

function buildSteps(q){
  var out = [];
  q = q || Q;
  if (q.kind === 'office'){
    var deep = q.ofreq === 'once' || q.ofreq === 'monthly';
    out.push(S('start', 'Arrive and set up', [], [
      'Turn off the alarm with the client\'s code. Sign in if there is a sign-in sheet.',
      'Lock the front door behind you.',
      'Turn on the lights in every room you will clean.',
      'Put on gloves.',
      'Fill your caddy: blue, green, yellow and red cloths, all-purpose spray, glass spray, disinfectant, toilet cleaner, toilet brush, garbage bags.',
      'Walk through every room. If something is already broken or stained, take a photo and text it to the client before you start.',
      'In every washroom, squirt toilet cleaner under the rim of each toilet and urinal. Don\'t scrub yet. Let it soak.'
    ], 'If you are alone after hours, keep the front door locked the whole time.'));
    out.push(S('trash', 'Garbage and recycling', [], [
      'Go room by room. Empty every garbage can and recycling bin, even the small ones under desks.',
      'Garbage and recycling go in separate bags. Never mix them.',
      'If a can is sticky or smells, spray the inside with all-purpose spray, wipe it and let it dry.',
      'Put a new bag in every can. Fold the top of the bag over the rim so it doesn\'t slip.',
      'Tie every full bag closed.',
      'Take the bags to the building\'s garbage room or outside bins.'
    ], 'Never push garbage down with your hand. There could be glass or needles inside.'));
    out.push(S('desks', 'Office area: desks and dusting', ['blue'], [
      'Take a blue cloth and fold it in four. When one side gets dirty, flip to a clean side.',
      'Dust from high to low: tops of shelves, cabinets and walls between desks first, then window sills, then desks.',
      'Spray all-purpose spray on the cloth, not on the desk.',
      'Wipe the empty parts of each desk. Don\'t move papers. Don\'t touch computers, keyboards or screens.',
      'Wipe chair arms, meeting tables and the reception counter.',
      'Push every chair back in under its desk.'
    ], 'Not sure if you can touch or move something? Leave it.', false, true));
    out.push(S('touch', 'Door handles and light switches', ['blue'], [
      'Spray disinfectant on every door handle, push plate, light switch and railing.',
      'Do the elevator buttons and the front door handle too.',
      'Leave it wet for the time written on the bottle. Usually that is 1 to 10 minutes.',
      'Then wipe it with a clean blue cloth.'
    ], 'Disinfectant only kills germs if it stays wet for the time on the bottle.'));
    out.push(S('glass', 'Front entrance and glass', ['blue'], [
      'Spray glass cleaner on a blue cloth, not straight on the glass.',
      'Wipe the fingerprints off the front doors and any glass walls. Go from top to bottom.',
      'Dry the glass with a clean, dry cloth until you see no streaks.',
      'Take the entrance mat outside and shake it, or vacuum it.',
      'Wipe the front of the reception desk.'
    ], '', false, true));
    if (q.kitchen) out.push(S('kitchen', 'Kitchen / break room', ['green'], [
      'Switch to a green cloth. The kitchen cloth is never used anywhere else.',
      'Spray all-purpose spray on the counters and tables and wipe them. Then wipe the chairs.',
      'Put a cup of water in the microwave and run it for 2 minutes. The steam loosens the dirt. Then wipe the inside.',
      'Wipe the outside of the fridge, microwave, coffee machine and cabinet doors. Wipe the handles extra well.',
      'Scrub the sink and the tap with a scrub pad. Rinse, then dry them with a dry cloth so they shine.',
      'Don\'t throw out any food and don\'t wash dishes unless the client asked.'
    ], '', false, true));
    var nWash = Math.max(0, +q.wash || 0);
    for (var w = 1; w <= nWash; w++){
      out.push(S('wash' + w, nWash > 1 ? 'Washroom ' + w : 'Washroom', ['yellow','red'], [
        'Refill the toilet paper, paper towels and soap from the client\'s supplies.',
        'Spray glass cleaner on a yellow cloth and clean the mirror.',
        'Spray disinfectant on the sinks, taps, counter, soap and towel holders. Wait the time on the bottle, then wipe with a yellow cloth.',
        'Yellow cloth: wipe the stall doors, the walls next to the toilets, the door handle and the light switch.',
        'Switch to a red cloth. Spray disinfectant on the outside of each toilet and urinal. Wipe top to bottom: handle, tank, lid, seat (both sides), then the base.',
        'Scrub inside each bowl with the toilet brush, under the rim too. Flush.',
        'Empty the garbage. For the small bins inside the stalls, lift out the whole bag. Never touch what\'s inside.',
        'Mop the floor with disinfectant. Start at the back wall and mop toward the door so you never step on the wet floor.'
      ], 'The red cloth is only for toilets and urinals. It never leaves the washroom. Wash red cloths separately.', false, true));
    }
    if (q.otype === 'medical') out.push(S('medical', 'Exam and treatment rooms', ['blue'], [
      'Put on new gloves before each room.',
      'Only use the disinfectant the clinic gives you or says is OK.',
      'Spray and wipe exam tables, chairs, counters, door handles and light switches. Leave it wet for the time on the bottle.',
      'Empty the regular garbage only.',
      'If you see blood or body fluid, don\'t touch it. Leave it and text the clinic.'
    ], 'Never touch needle boxes (sharps containers) or red or yellow biohazard bags. Clinic staff handle those.', true, true));
    if (q.otype === 'daycare') out.push(S('daycare', 'Kids\' areas', ['blue'], [
      'Only use cleaners the daycare says are OK.',
      'Wipe everything at kid height: tables, chairs, cubbies, and handprints on doors and glass.',
      'Clean toys only if the daycare asks. Let them dry on their own.',
      'Before you vacuum, look on the floor for small toys and pick them up.'
    ], 'Keep all cleaning products up high, out of kids\' reach, the whole time you are there.', true, true));
    if (q.otype === 'gym') out.push(S('gym', 'Gym floor and change rooms', ['blue','yellow','red'], [
      'Blue cloth with disinfectant: wipe the handles, grips, benches, mats and seats on every machine.',
      'Clean the mirrors with glass spray, top to bottom.',
      'Change rooms: clean them like a washroom. Yellow cloth for sinks and benches, red cloth for toilets.',
      'Rubber floors: vacuum first, then mop with plain all-purpose cleaner. Never use oil or wax on rubber.'
    ], '', false, true));
    if (q.otype === 'retail') out.push(S('retail', 'Store floor', ['blue'], [
      'Clean the glass display cases and the front door glass with glass spray.',
      'Wipe the checkout counter. Don\'t spray the card machine or the screen.',
      'Dust the shelves you can reach without moving products.',
      'Fitting rooms: clean the mirror, wipe the bench, vacuum the floor.'
    ], '', false, true));
    if (deep || (q.firstDeep && q.ofreq !== 'once')) out.push(S('deep', deep ? 'Detail work' : 'First visit only: deep clean', ['blue'], [
      'Wipe the baseboards (the strip at the bottom of the walls) all the way around each room.',
      'Wipe the doors and door frames, top to bottom.',
      'Dust air vents, blinds and lights you can reach with the extendable duster. Never stand on chairs or desks.',
      'Wipe chair legs and table legs.',
      'Spot-clean marks on walls. Test a small hidden spot first. If paint comes off, stop.',
      'Clean inside the fridge only if the client emptied it.'
    ]));
    out.push(S('floors', 'Floors (always last)', [], [
      'Pick up small things from the floor. Don\'t unplug anything.',
      'Vacuum all carpets. Go slowly in straight lines and overlap each line a little.',
      'Vacuum the edges along the walls and under the desks you can reach.',
      'Sweep or dust-mop all hard floors.',
      'Put the wet floor sign where people walk in.',
      'Mop the hard floors. Start in the far corner and mop backward toward the door so you never step on the wet floor.',
      'Rinse and squeeze the mop often. When the water looks dirty, change it.'
    ]));
    out.push(S('finish', 'Before you leave', [], [
      'Walk through every room one more time and look for anything you missed.',
      'Empty the mop bucket in a utility sink or a toilet. Never in the kitchen sink.',
      'Pack up all your stuff. Don\'t leave cloths or bottles behind.',
      'Turn off the lights, lock all doors and windows, and turn the alarm back on.',
      'Text the client anything you noticed: low supplies, leaks, broken things.'
    ]));
  } else {
    var t = q.htype;
    out.push(S('start', 'Arrive and set up', [], [
      'Say hi. Ask the client what matters most today, and if there are rooms or things to skip.',
      'Make sure pets are in a safe place, away from where you work.',
      'Put on shoe covers before you walk in.',
      'Walk through the house. If something is already broken or stained, take a photo and tell the client before you start.',
      'Bring the caddy in and put on gloves.',
      'Spray the tubs, showers and toilets now so the cleaner soaks while you work.' + (q.oven ? ' Spray the inside of the oven with degreaser too (oven off and cool).' : '')
    ]));
    out.push(S('kitchen', 'Kitchen', ['green'], [
      'Switch to a green cloth. The kitchen cloth is never used anywhere else.',
      'Move small things off the counters. Spray and wipe the counters and the wall behind them. Put things back.',
      'Clean the stovetop. Use a non-scratch pad on stuck spots.',
      'Put a cup of water in the microwave and run it for 2 minutes. Then wipe the inside and outside.',
      'Wipe the outside of the fridge, dishwasher, oven and cabinet doors. Wipe all the handles.',
      'Scrub the sink and the tap. Rinse, then dry them with a dry cloth so they shine.',
      'Wipe the table and chairs. Take out the garbage and put in a new bag.'
    ], '', false, true));
    if (q.oven) out.push(S('oven', 'Inside the oven', ['green'], [
      'Make sure the oven is off and cool.',
      'Take out the racks. Put them in the sink or the tub with hot soapy water.',
      'Wipe out the degreaser you sprayed at the start. Scrub stuck spots with a non-scratch pad.',
      'Clean the oven door glass inside and outside.',
      'Scrub the racks, rinse them, dry them and put them back.'
    ], '', false, true));
    if (q.fridge || t === 'move') out.push(S('fridge', 'Inside the fridge', ['green'], [
      'Ask the client before you move or throw out any food.',
      'Take out the shelves and drawers. Wash them in warm soapy water and dry them.',
      'Wipe the inside walls, then the rubber door seals.',
      'Put the shelves, drawers and food back the way they were.'
    ], '', false, true));
    for (var b = 1; b <= Math.max(0, +q.bed || 0); b++){
      out.push(S('bed' + b, q.bed > 1 ? 'Bedroom ' + b : 'Bedroom', ['blue'], [
        'Dust from high to low: ceiling fan, shelves, window sills, dresser, nightstands.',
        'Clean the mirror with glass spray.',
        'Make the bed. Change the sheets only if the client left clean ones out.',
        'Don\'t open drawers or closets.',
        'Vacuum the whole floor, including under the bed where you can reach.'
      ], '', false, true));
    }
    for (var f = 1; f <= Math.max(0, +q.full || 0); f++){
      out.push(S('bath' + f, q.full > 1 ? 'Bathroom ' + f : 'Bathroom', ['yellow','red'], [
        'Scrub the tub or shower walls and the glass door with a scrub brush. Rinse with water.',
        'Yellow cloth: clean the sink, counter and tap. Then the mirror with glass spray. Then the cabinet doors.',
        'Switch to a red cloth. Wipe the outside of the toilet top to bottom: handle, tank, lid, seat (both sides), base.',
        'Scrub inside the bowl with the toilet brush, under the rim too. Flush.',
        'Empty the garbage.',
        'Mop the floor. Start at the back and mop toward the door.'
      ], 'The red cloth is only for the toilet.', false, true));
    }
    for (var h = 1; h <= Math.max(0, +q.half || 0); h++){
      out.push(S('half' + h, q.half > 1 ? 'Half bath ' + h : 'Half bath', ['yellow','red'], [
        'Yellow cloth: clean the sink, tap, mirror and counter.',
        'Red cloth: wipe the outside of the toilet top to bottom. Then brush inside the bowl and flush.',
        'Empty the garbage and mop the floor toward the door.'
      ], '', false, true));
    }
    out.push(S('living', 'Living and dining', ['blue'], [
      'Dust from high to low: shelves, picture frames, tables, TV stand.',
      'TV screen: wipe gently with a dry cloth only. No spray.',
      'Wipe the light switches and door handles.',
      'Take off the couch cushions if they come off. Vacuum under them, put them back and straighten the pillows.'
    ], '', false, true));
    if (q.stairs > 0) out.push(S('stairs', q.stairs > 1 ? 'Stairs (' + q.stairs + ' flights)' : 'Stairs', ['blue'], [
      'Wipe the handrail and the posts.',
      'Start at the top. Vacuum each step, edges included, and work your way down.'
    ], '', false, true));
    if (q.basement) out.push(S('basement', 'Finished basement', ['blue'], [
      'Dust and wipe all surfaces, high to low.',
      'If there is a bathroom, clean it the same way as the other bathrooms.',
      'Vacuum, then mop the hard floors.'
    ], '', false, true));
    if (q.windows > 0) out.push(S('windows', 'Inside windows (' + q.windows + ')', ['blue'], [
      'Spray glass cleaner on a blue cloth. Clean the inside glass from top to bottom.',
      'Dry it with a clean cloth until you see no streaks.',
      'Wipe the window sill. Vacuum the dirt out of the tracks.'
    ]));
    if (t === 'deep' || t === 'move' || q.baseboards) out.push(S('detail', t === 'move' ? 'Move-out detail' : (t === 'deep' ? 'Deep clean detail' : 'Baseboards'), ['blue'],
      (t === 'standard' ? ['Wipe the baseboards (the strip at the bottom of the walls) in every room.'] : [
        'Wipe the baseboards (the strip at the bottom of the walls) in every room.',
        'Wipe the doors, door frames, light switches and outlet covers.',
        'Dust air vents and lights you can reach with the extendable duster. Never stand on furniture.',
        'Clean the window sills and tracks.',
        'Scrub the bathroom grout (the lines between tiles) and the shower tracks.',
        'Move light furniture, clean underneath, and put it back.'
      ]).concat(t === 'move' ? ['Wipe inside every cabinet and drawer.', 'Wipe the closet shelves and rods.', 'Spot-clean marks on walls. Test a small hidden spot first.'] : [])));
    if (q.cabinets && t !== 'move') out.push(S('cabinets', 'Inside cabinets', ['green'], [
      'Only clean cabinets the client has emptied.',
      'Wipe the shelves and the inside of the doors. Let them dry before anything goes back in.'
    ]));
    out.push(S('floors', 'Floors (always last)', [], [
      'Pick up small things from the floor.',
      'Vacuum every room. Go slowly in straight lines and get the edges too.',
      'Mop the hard floors. Start at the far corner of each room and mop backward toward the door.',
      'Change the mop water when it looks dirty.'
    ]));
    out.push(S('finish', 'Before you leave', [], [
      'Walk through with the client if they are home. Fix anything they point out.',
      'Put back anything you moved.',
      'Take all the garbage out to the client\'s bins.',
      'Pack up all your stuff. Don\'t leave cloths or bottles behind.',
      'Lock up and return the key the way the client asked.'
    ]));
  }
  return out;
}

/* =========================================================
   CONNECTION + STATE
   ========================================================= */
var CFG = window.BC_CONFIG || {};
var SB = null;                       /* the Supabase client */
var USER = null, PROFILE = null, ROLE = '';
var readOnly = false, stepsDirty = true;
var leads = [], setupDone = {}, team = [], invites = [], jobs = [], photosByJob = {};
var signed = {};                     /* photo path -> {url, exp} */
var STATUSES = [
  ['new', 'New'], ['contacted', 'Contacted'], ['walkthrough', 'Walkthrough booked'],
  ['quoted', 'Quoted'], ['won', 'Won'], ['lost', 'Lost']
];
var STATUS_LABEL = {}; STATUSES.forEach(function(s){ STATUS_LABEL[s[0]] = s[1]; });
var TYPE_LABEL = {office:'Office', medical:'Clinic', retail:'Store', daycare:'Daycare / school', gym:'Gym / studio', pm:'Property manager', house:'House / condo'};
var ME_DEFAULT = {name:'Moe', phone:'', email:'bc_solution@myyahoo.com', address:'119 Winterhaven Drive, Orléans, ON K1W 0H3'};
var KIND_LABEL = {before:'Before', after:'After'};
var CAM_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
var channels = [];

function configured(){ return !!(CFG.url && CFG.key && !/YOUR_/.test(CFG.url + CFG.key) && window.supabase && window.supabase.createClient); }
/* supabase calls resolve {data, error}; turn that into a normal promise */
function q(p){ return Promise.resolve(p).then(function(r){ if (r && r.error) throw r.error; return r ? r.data : null; }); }
function setBanner(msg){ var b = $('#banner'); b.textContent = msg || ''; b.hidden = !msg; }
function errText(e){
  var m = String((e && (e.message || e.msg || e.error_description)) || e || '');
  if (/Failed to fetch|NetworkError|network|Load failed/i.test(m)) return 'No internet connection. Check it and try again.';
  if (/JWT|expired|not authenticated|401/i.test(m)) return 'You were signed out. Sign in again.';
  if (/row-level security|permission|not allowed|42501/i.test(m)) return 'You\'re not allowed to do that.';
  return 'Something went wrong. Try again.';
}
function onWriteError(e){ setBanner('Couldn\'t save that. ' + errText(e)); setTimeout(function(){ setBanner(''); }, 6000); }
function newId(){ return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function personName(id){ var p = team.filter(function(x){ return x.id === id; })[0]; return p ? (p.full_name || p.email.split('@')[0]) : 'Someone'; }
function niceDate(iso){
  if (!iso) return '';
  var t = todayISO(), d = new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso);
  if (String(iso).slice(0, 10) === t) return 'Today';
  var tm = new Date(t + 'T12:00:00'); tm.setDate(tm.getDate() + 1);
  if (d.toDateString() === tm.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-CA', {weekday:'short', month:'short', day:'numeric'});
}
function niceTime(iso){ if (!iso) return ''; return new Date(iso).toLocaleTimeString('en-CA', {hour:'numeric', minute:'2-digit'}); }
function clock(hhmm){ if (!hhmm) return ''; var p = hhmm.split(':'), d = new Date(); d.setHours(+p[0], +p[1], 0, 0); return d.toLocaleTimeString('en-CA', {hour:'numeric', minute:'2-digit'}); }
function stamp(){ return new Date().toLocaleString('en-CA', {month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit'}); }
function mapsLink(addr){ return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr); }

/* =========================================================
   DATA: leads, settings, team, jobs, photos
   ========================================================= */
function loadLeads(){
  return q(SB.from('leads').select('id,data')).then(function(rows){
    leads = (rows || []).map(function(r){ return Object.assign({}, r.data, {id:r.id}); });
    renderLeads();
  });
}
function addLead(obj){
  var now = new Date().toISOString(), id = newId();
  var data = Object.assign({}, obj, {createdAt:now, updatedAt:now}); delete data.id;
  return q(SB.from('leads').insert({id:id, data:data})).then(function(){
    leads.push(Object.assign({}, data, {id:id})); renderLeads();
  }, function(e){ onWriteError(e); throw e; });
}
function updateLead(id, patch){
  var cur = findLead(id); if (!cur) return Promise.reject(new Error('missing lead'));
  var next = Object.assign({}, cur, patch, {updatedAt:new Date().toISOString()});
  var data = Object.assign({}, next); delete data.id;
  return q(SB.from('leads').update({data:data}).eq('id', id)).then(function(){
    leads = leads.map(function(l){ return l.id === id ? next : l; }); renderLeads();
  }, function(e){ onWriteError(e); renderLeads(); throw e; });
}
function deleteLead(id){
  return q(SB.from('leads').delete().eq('id', id)).then(function(){
    leads = leads.filter(function(l){ return l.id !== id; }); renderLeads();
  }, onWriteError);
}

var settingChain = Promise.resolve();
function saveSetting(key, value){
  settingChain = settingChain.then(function(){ return q(SB.from('settings').upsert({key:key, value:value})); }).catch(onWriteError);
  return settingChain;
}
function loadSettings(){
  return q(SB.from('settings').select('key,value')).then(function(rows){
    (rows || []).forEach(function(r){
      if (r.key === 'setup') setupDone = (r.value && r.value.done) || {};
      if (r.key === 'me') ME = Object.assign({}, ME_DEFAULT, r.value || {});
    });
    fillMe(); renderSetup(); renderLeads();
  });
}
function setSetup(key, val){
  setupDone = Object.assign({}, setupDone); setupDone[key] = val;
  renderSetup(); saveSetting('setup', {done:setupDone});
}
function fillMe(){ $('#me-name').value = ME.name || ''; $('#me-phone').value = ME.phone || ''; $('#me-email').value = ME.email || ''; $('#me-address').value = ME.address || ''; var w = $('#detailsWarn'); if (w) w.hidden = !!ME.address; }
var meTimer = 0;
function readMe(e){
  if (!/^me-/.test(e.target.id || '')) return;
  ME = {name: $('#me-name').value.trim(), phone: $('#me-phone').value.trim(), email: $('#me-email').value.trim(), address: $('#me-address').value.trim()};
  var w = $('#detailsWarn'); if (w) w.hidden = !!ME.address;
  clearTimeout(meTimer); meTimer = setTimeout(function(){ saveSetting('me', ME); }, 700);
}

function loadTeam(){
  return q(SB.from('profiles').select('id,email,full_name,role,active,created_at').order('created_at')).then(function(rows){ team = rows || []; });
}
function loadInvites(){
  return q(SB.from('invites').select('*').is('used_at', null).order('created_at')).then(function(rows){ invites = rows || []; });
}
function loadJobs(){
  return q(SB.from('jobs').select('*').order('job_date', {ascending:true}).order('start_time', {ascending:true}).limit(1000)).then(function(rows){
    jobs = rows || [];
    var ids = jobs.map(function(j){ return j.id; });
    if (!ids.length){ photosByJob = {}; return; }
    return q(SB.from('photos').select('id,job_id,room_id,kind,path,taken_by,taken_at').in('job_id', ids)).then(function(ph){
      photosByJob = {}; (ph || []).forEach(function(p){ (photosByJob[p.job_id] = photosByJob[p.job_id] || []).push(p); });
    });
  });
}
function loadJobPhotos(id){
  return q(SB.from('photos').select('id,job_id,room_id,kind,path,taken_by,taken_at').eq('job_id', id)).then(function(ph){ photosByJob[id] = ph || []; });
}
function reloadJob(id){
  return q(SB.from('jobs').select('*').eq('id', id).maybeSingle()).then(function(row){
    jobs = jobs.filter(function(j){ return j.id !== id; }); if (row) jobs.push(row);
    return loadJobPhotos(id);
  });
}
function findJob(id){ return jobs.filter(function(j){ return j.id === id; })[0] || null; }
function photoOf(jobId, room, kind){ return (photosByJob[jobId] || []).filter(function(p){ return p.room_id === room && p.kind === kind; })[0] || null; }
function photoTotals(job){
  var rooms = job.rooms || [], full = 0, shots = 0;
  rooms.forEach(function(r){ var b = photoOf(job.id, r.id, 'before'), a = photoOf(job.id, r.id, 'after'); if (b) shots++; if (a) shots++; if (b && a) full++; });
  return {rooms:rooms.length, full:full, shots:shots};
}
/* private photos are shown through short-lived links */
function signPaths(paths){
  var now = Date.now(), need = paths.filter(function(p){ return !signed[p] || signed[p].exp < now + 60000; });
  if (!need.length) return Promise.resolve();
  return q(SB.storage.from('photos').createSignedUrls(need, 3600)).then(function(list){
    (list || []).forEach(function(x){ if (x && x.signedUrl && x.path) signed[x.path] = {url:x.signedUrl, exp: now + 3500 * 1000}; });
  }).catch(function(){});
}
function srcOf(path){ return signed[path] ? signed[path].url : ''; }

/* live updates; if they can't connect, the app refreshes on focus and every 30 s on a job */
function listen(){
  stopListening();
  try {
    var ch = SB.channel('bc-live')
      .on('postgres_changes', {event:'*', schema:'public', table:'jobs'}, function(){ liveJobs(); })
      .on('postgres_changes', {event:'*', schema:'public', table:'photos'}, function(p){ var r = p.new && p.new.job_id ? p.new : p.old; livePhotos(r && r.job_id); });
    if (ROLE === 'admin') ch.on('postgres_changes', {event:'*', schema:'public', table:'leads'}, function(){ clearTimeout(listen.lt); listen.lt = setTimeout(function(){ loadLeads().catch(function(){}); }, 400); });
    ch.subscribe(); channels.push(ch);
  } catch(e){}
}
function stopListening(){ channels.forEach(function(c){ try { SB.removeChannel(c); } catch(e){} }); channels = []; }
var liveT = 0;
function liveJobs(){ clearTimeout(liveT); liveT = setTimeout(function(){ refreshAll(); }, 300); }
function livePhotos(jobId){
  if (!jobId) return;
  if (currentJobId === jobId){ clearTimeout(livePhotos.t); livePhotos.t = setTimeout(function(){ loadJobPhotos(jobId).then(function(){ return signJobPhotos(findJob(jobId)); }).then(function(){ renderPhotoBars(); renderJobHead(); }); }, 300); }
  else liveJobs();
}
function refreshAll(){
  return loadJobs().then(function(){
    renderJobsAdmin(); renderMyJobs(); updateBadges();
    if (currentJobId){ var j = findJob(currentJobId); if (!j){ closeJob(); return; } return signJobPhotos(j).then(function(){ renderJobScreen(false); }); }
  }).catch(function(){});
}

/* =========================================================
   LOGIN
   ========================================================= */
function showOnly(id){
  ['bootScreen','configScreen','blockedScreen','authScreen','tab-myjobs','tab-job','tab-quote','tab-jobs','tab-leads','tab-team','tab-start'].forEach(function(s){ var el = document.getElementById(s); if (el) el.hidden = s !== id; });
  $('#strip').hidden = id !== 'tab-quote';
  window.scrollTo(0, 0);
}
function authMsg(text, bad){ var m = $('#authMsg'); m.style.color = bad ? 'var(--bad)' : 'var(--good)'; m.textContent = text || ''; }
function showAuth(which){
  showOnly('authScreen'); $('#tabbar').hidden = true; $('#meBox').hidden = true;
  ['signin','signup','forgot','newpass'].forEach(function(k){
    var f = {signin:'#signinForm', signup:'#signupForm', forgot:'#forgotForm', newpass:'#newPassForm'}[k];
    $(f).hidden = k !== which;
  });
  $$('.auth-tab').forEach(function(t){ t.setAttribute('aria-selected', t.dataset.auth === which ? 'true' : 'false'); });
  $('.auth-tabs').hidden = which === 'newpass';
  authMsg('');
}
function authError(e, where){
  var m = String((e && (e.message || e.msg)) || '');
  if (/Invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/Database error saving new user|NOT_INVITED/i.test(m)) return 'This email isn\'t on the team list. Ask Moe to add you first, then try again.';
  if (/already registered|already exists/i.test(m)) return 'This email already has an account. Sign in instead.';
  if (/Email not confirmed/i.test(m)) return 'Check your email and tap the confirm link first.';
  if (/password/i.test(m) && /least|short|weak/i.test(m)) return 'That password is too short. Use at least 8 characters.';
  if (/rate limit|too many|429/i.test(m)) return 'Too many tries. Wait a minute and try again.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No internet connection. Check it and try again.';
  return where === 'signup' ? 'Couldn\'t create the account. Try again.' : 'Couldn\'t sign in. Try again.';
}
function validEmail(s){ return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s); }
function busy(btn, on, label){ if (!btn) return; if (on){ btn.dataset.label = btn.textContent; btn.textContent = label || 'One sec…'; btn.disabled = true; } else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; } }

function doSignIn(e){
  e.preventDefault();
  var email = $('#si-email').value.trim(), pass = $('#si-pass').value;
  if (!validEmail(email)) return authMsg('Type your email.', true);
  if (!pass) return authMsg('Type your password.', true);
  busy($('#si-go'), true, 'Signing in…');
  SB.auth.signInWithPassword({email:email, password:pass}).then(function(r){
    busy($('#si-go'), false);
    if (r.error) return authMsg(authError(r.error, 'signin'), true);
    $('#si-pass').value = '';
  }, function(err){ busy($('#si-go'), false); authMsg(authError(err, 'signin'), true); });
}
function doSignUp(e){
  e.preventDefault();
  var email = $('#su-email').value.trim(), p1 = $('#su-pass').value, p2 = $('#su-pass2').value;
  if (!validEmail(email)) return authMsg('Type the email Moe added for you.', true);
  if (p1.length < 8) return authMsg('Use at least 8 characters for the password.', true);
  if (p1 !== p2) return authMsg('The two passwords don\'t match.', true);
  busy($('#su-go'), true, 'Creating…');
  SB.auth.signUp({email:email, password:p1}).then(function(r){
    busy($('#su-go'), false);
    if (r.error) return authMsg(authError(r.error, 'signup'), true);
    $('#su-pass').value = ''; $('#su-pass2').value = '';
    if (!r.data || !r.data.session){ showAuth('signin'); $('#si-email').value = email; authMsg('Account made. Check your email for a confirm link, then sign in.'); }
  }, function(err){ busy($('#su-go'), false); authMsg(authError(err, 'signup'), true); });
}
function doForgot(e){
  e.preventDefault();
  var email = $('#fp-email').value.trim();
  if (!validEmail(email)) return authMsg('Type your email.', true);
  busy($('#fp-go'), true, 'Sending…');
  SB.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname}).then(function(r){
    busy($('#fp-go'), false);
    if (r.error) return authMsg(authError(r.error), true);
    authMsg('If that email is on the team, a reset link is on its way. Check your inbox and junk folder.');
  }, function(err){ busy($('#fp-go'), false); authMsg(authError(err), true); });
}
function doNewPass(e){
  e.preventDefault();
  var p1 = $('#np-pass').value, p2 = $('#np-pass2').value;
  if (p1.length < 8) return authMsg('Use at least 8 characters for the password.', true);
  if (p1 !== p2) return authMsg('The two passwords don\'t match.', true);
  busy($('#np-go'), true, 'Saving…');
  SB.auth.updateUser({password:p1}).then(function(r){
    busy($('#np-go'), false);
    if (r.error) return authMsg(authError(r.error), true);
    $('#np-pass').value = ''; $('#np-pass2').value = '';
    recovering = false; startSession(USER, true);
  }, function(err){ busy($('#np-go'), false); authMsg(authError(err), true); });
}

var recovering = false, sessionUser = '';
function startSession(user, force){
  if (!user) return;
  if (!force && sessionUser === user.id) return;
  sessionUser = user.id; USER = user;
  q(SB.from('profiles').select('*').eq('id', user.id).maybeSingle()).then(function(p){
    PROFILE = p;
    if (!p || !p.active){ showOnly('blockedScreen'); $('#meBox').hidden = false; $('#meChip').textContent = user.email; $('#tabbar').hidden = true; return; }
    ROLE = p.role;
    $('#meBox').hidden = false;
    $('#meChip').textContent = (p.full_name || p.email.split('@')[0]) + ' · ' + (ROLE === 'admin' ? 'Admin' : 'Worker');
    var loads = [loadTeam(), loadJobs()];
    if (ROLE === 'admin') loads.push(loadLeads(), loadSettings(), loadInvites());
    return Promise.all(loads).then(function(){
      listen();
      if (ROLE === 'admin'){
        $('#tabbar').hidden = false;
        renderJobsAdmin(); renderTeam(); updateBadges();
        var t = location.hash.replace('#', '');
        showTab(['quote','jobs','leads','team','start'].indexOf(t) >= 0 ? t : lsGet('bc-tab', 'jobs'));
      } else {
        $('#tabbar').hidden = true;
        renderMyJobs(); showOnly('tab-myjobs');
      }
      var open = lsGet('bc-openjob', '');
      if (open && findJob(open) && findJob(open).status !== 'done') openJob(open);
    });
  }).catch(function(e){
    sessionUser = ''; showOnly('authScreen'); showAuth('signin'); authMsg(errText(e), true);
  });
}
function endSession(){
  stopListening();
  USER = null; PROFILE = null; ROLE = ''; sessionUser = ''; currentJobId = '';
  leads = []; jobs = []; team = []; invites = []; photosByJob = {}; signed = {}; setupDone = {};
  lsSet('bc-openjob', '');
  $('#meBox').hidden = true; $('#tabbar').hidden = true;
  showAuth('signin');
}
function signOut(){ SB.auth.signOut().then(endSession, endSession); }

/* =========================================================
   NAVIGATION
   ========================================================= */
var current = 'jobs';
function showTab(name){
  if (ROLE !== 'admin') return;
  current = name; currentJobId = ''; stopJobPoll();
  showOnly('tab-' + name);
  $$('.tab-btn').forEach(function(b){ if (b.dataset.tab === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (name === 'jobs') renderJobsAdmin();
  if (name === 'team') renderTeam();
  lsSet('bc-tab', name);
  if (history.replaceState) history.replaceState(null, '', '#' + name);
}
function updateBadges(){
  var t = todayISO(), n = jobs.filter(function(j){ return j.status !== 'done' && j.job_date <= t; }).length;
  var b = $('#jobsBadge'); if (b){ b.textContent = n; b.hidden = !n; }
}

/* =========================================================
   JOB LISTS
   ========================================================= */
var jobFilter = 'coming';
function jobState(j){
  if (j.status === 'done') return {cls:'good', text:'Done'};
  if (j.status === 'in_progress') return {cls:'open', text:'In progress'};
  if (j.job_date < todayISO()) return {cls:'bad', text:'Not done yet'};
  return {cls:'', text:'Scheduled'};
}
function jobCard(j, admin){
  var st = jobState(j), t = photoTotals(j);
  var who = (j.assigned || []).map(personName).join(', ') || 'Nobody yet';
  return '<article class="card job-card2" data-job="' + esc(j.id) + '">' +
    '<div class="jc-top"><div><h3>' + esc(j.client) + '</h3><div class="jc-when">' + esc(niceDate(j.job_date)) + (j.start_time ? ' · ' + esc(clock(j.start_time)) : '') + '</div></div>' +
    '<span class="state ' + st.cls + '">' + esc(st.text) + '</span></div>' +
    (j.address ? '<div class="jc-line">' + esc(j.address) + '</div>' : '') +
    '<div class="jc-line muted">' + (admin ? 'Team: ' + esc(who) + ' · ' : '') + 'Photos: ' + t.full + '/' + t.rooms + ' rooms</div>' +
    '<div class="actions"><button type="button" class="btn small primary" data-openjob="' + esc(j.id) + '">' + (j.status === 'done' ? 'See photos' : (j.status === 'in_progress' ? 'Continue' : 'Open')) + '</button>' +
    (admin ? '<button type="button" class="btn small ghost" data-editjob="' + esc(j.id) + '">Edit</button><button type="button" class="btn small ghost danger" data-deljob="' + esc(j.id) + '">' + (pendingJobDelete === j.id ? 'Tap again to delete' : 'Delete') + '</button>' : '') +
    '</div></article>';
}
var pendingJobDelete = '';
function renderJobsAdmin(){
  var list = $('#jobList'); if (!list || ROLE !== 'admin') return;
  $$('#jobFilters button').forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.jf === jobFilter ? 'true' : 'false'); });
  var t = todayISO(), arr = jobs.slice();
  if (jobFilter === 'coming') arr = arr.filter(function(j){ return j.status !== 'done'; });
  if (jobFilter === 'done') arr = arr.filter(function(j){ return j.status === 'done'; }).reverse();
  if (!arr.length){
    list.innerHTML = '<div class="card empty">' + (jobFilter === 'done' ? 'No finished jobs yet.' : 'No jobs coming up. Tap “+ New job” to add one.') + '</div>';
    return;
  }
  list.innerHTML = arr.map(function(j){ return jobCard(j, true); }).join('');
}
function renderMyJobs(){
  var list = $('#myJobsList'); if (!list || ROLE === 'admin') return;
  var name = PROFILE ? (PROFILE.full_name || '') : '';
  $('#myJobsLede').textContent = (name ? 'Hi ' + name + '. ' : '') + 'Tap a job to open it.';
  var open = jobs.filter(function(j){ return j.status !== 'done'; });
  var done = jobs.filter(function(j){ return j.status === 'done'; }).reverse().slice(0, 10);
  var html = open.length ? open.map(function(j){ return jobCard(j, false); }).join('') : '<div class="card empty">No jobs for you right now. Moe will add them here.</div>';
  if (done.length) html += '<h2 class="list-head">Finished</h2>' + done.map(function(j){ return jobCard(j, false); }).join('');
  list.innerHTML = html;
}

/* =========================================================
   NEW / EDIT JOB (admin)
   ========================================================= */
var editingJob = '';
function roomsFromQuote(){ return buildSteps(Q).filter(function(s){ return s.photo; }).map(function(s){ return {id:s.id, title:s.title}; }); }
function openNewJob(prefill){
  showTab('jobs'); editingJob = '';
  var l = Q.leadId ? findLead(Q.leadId) : null;
  $('#jf-title').textContent = 'New job';
  $('#jf-client').value = (prefill && prefill.client) || Q.client || (l ? cleanName(l.name) : '');
  $('#jf-address').value = (l && l.notes) ? String(l.notes).split('\n')[0].replace(/\.$/, '') : '';
  $('#jf-date').value = todayISO(); $('#jf-time').value = ''; $('#jf-notes').value = '';
  $('#jf-reroom-wrap').hidden = true; $('#jf-reroom').checked = false;
  renderWorkerPicks([]);
  $('#jf-rooms').textContent = 'From the Quote tab: ' + jobSummary(Object.assign({}, Q, {client:''})).join(' · ') + '. Rooms with photos: ' + roomsFromQuote().map(function(r){ return r.title; }).join(', ') + '. Change the Quote tab first if that\'s wrong.';
  $('#jf-msg').textContent = '';
  $('#jobForm').hidden = false; $('#newJobBtn').hidden = true;
  $('#jobForm').scrollIntoView({block:'start'}); $('#jf-client').focus();
}
function openEditJob(id){
  var j = findJob(id); if (!j) return;
  editingJob = id;
  $('#jf-title').textContent = 'Edit job';
  $('#jf-client').value = j.client; $('#jf-address').value = j.address || ''; $('#jf-date').value = j.job_date; $('#jf-time').value = j.start_time || ''; $('#jf-notes').value = j.notes || '';
  renderWorkerPicks(j.assigned || []);
  var t = photoTotals(j), canReroom = j.status === 'scheduled' && !t.shots;
  $('#jf-rooms').textContent = 'Rooms with photos: ' + (j.rooms || []).map(function(r){ return r.title; }).join(', ') + '.';
  $('#jf-reroom-wrap').hidden = !canReroom; $('#jf-reroom').checked = false;
  $('#jf-msg').textContent = '';
  $('#jobForm').hidden = false; $('#newJobBtn').hidden = true;
  $('#jobForm').scrollIntoView({block:'start'});
}
function closeJobForm(){ $('#jobForm').hidden = true; $('#newJobBtn').hidden = false; editingJob = ''; }
function renderWorkerPicks(sel){
  var people = team.filter(function(p){ return p.active; });
  $('#jf-workers').innerHTML = people.length ? people.map(function(p){
    return '<label class="check"><input type="checkbox" value="' + esc(p.id) + '"' + (sel.indexOf(p.id) >= 0 ? ' checked' : '') + '><span>' + esc(p.full_name || p.email) + (p.role === 'admin' ? ' <small>(admin)</small>' : '') + '</span></label>';
  }).join('') : '<p class="note">Nobody on the team yet. Add people on the Team tab.</p>';
}
function saveJob(e){
  e.preventDefault();
  var msg = $('#jf-msg'); msg.style.color = 'var(--bad)';
  var client = $('#jf-client').value.trim(), date = $('#jf-date').value;
  var assigned = $$('#jf-workers input:checked').map(function(i){ return i.value; });
  if (!client){ msg.textContent = 'Type the client name.'; $('#jf-client').focus(); return; }
  if (!date){ msg.textContent = 'Pick the date.'; $('#jf-date').focus(); return; }
  if (!assigned.length){ msg.textContent = 'Pick at least one person for this job.'; return; }
  var row = {client:client, address:$('#jf-address').value.trim(), job_date:date, start_time:$('#jf-time').value || '', notes:$('#jf-notes').value.trim(), assigned:assigned};
  if (!editingJob){ row.q = Object.assign({}, Q); row.rooms = roomsFromQuote(); row.lead_id = Q.leadId || null; }
  else if ($('#jf-reroom').checked){ row.q = Object.assign({}, Q); row.rooms = roomsFromQuote(); }
  busy($('#jf-save'), true, 'Saving…');
  var p = editingJob ? q(SB.from('jobs').update(row).eq('id', editingJob)) : q(SB.from('jobs').insert(row));
  p.then(function(){
    busy($('#jf-save'), false); closeJobForm(); jobFilter = 'coming';
    return refreshAll();
  }, function(err){ busy($('#jf-save'), false); msg.textContent = 'Couldn\'t save the job. ' + errText(err); });
}
function deleteJob(id){
  var paths = (photosByJob[id] || []).map(function(p){ return p.path; });
  var rm = paths.length ? q(SB.storage.from('photos').remove(paths)).catch(function(){}) : Promise.resolve();
  rm.then(function(){ return q(SB.from('jobs').delete().eq('id', id)); }).then(function(){
    pendingJobDelete = ''; return refreshAll();
  }, function(e){ pendingJobDelete = ''; onWriteError(e); renderJobsAdmin(); });
}

/* =========================================================
   ONE JOB: steps + before/after photos
   ========================================================= */
var currentJobId = '', ticks = {}, STEP_KEY = '', busyShot = {}, shotMsg = {}, pendingShot = null, finishArmed = 0, jobPoll = 0;
function jobSummary(q){
  q = q || Q;
  var r = q.kind === 'office' ? calcOffice(q) : calcHouse(q), pills = [];
  if (q.client) pills.push(q.client);
  if (q.kind === 'office'){
    pills.push((OTYPE[q.otype] || OTYPE.office).label); pills.push(Number(q.sqft).toLocaleString('en-CA') + ' sq ft'); pills.push(r.fr.label); pills.push(plural(+q.wash || 0, 'washroom'));
  } else {
    pills.push((HTYPE[q.htype] || HTYPE.standard).label + ' clean'); pills.push(q.bed + ' bed / ' + q.full + ' bath');
    if (q.htype !== 'move') pills.push(r.fr.label);
  }
  pills.push('≈ ' + hrs(r.hours) + ' of work' + (r.visits ? ' per visit' : ''));
  return pills;
}
function jobQ(j){ return Object.assign({}, DEFAULT_Q, j.q || {}, {client:j.client}); }
function signJobPhotos(j){ return j ? signPaths((photosByJob[j.id] || []).map(function(p){ return p.path; })) : Promise.resolve(); }
function openJob(id){
  var j = findJob(id); if (!j) return;
  currentJobId = id; lsSet('bc-openjob', id); finishArmed = 0; shotMsg = {};
  showOnly('tab-job'); $('#tabbar').hidden = true;
  renderJobScreen(true);
  loadJobPhotos(id).then(function(){ return signJobPhotos(findJob(id)); }).then(function(){ if (currentJobId === id) renderJobScreen(false); });
  stopJobPoll(); jobPoll = setInterval(function(){ if (currentJobId && !document.hidden) refreshAll(); }, 30000);
}
function stopJobPoll(){ if (jobPoll){ clearInterval(jobPoll); jobPoll = 0; } }
function closeJob(){
  currentJobId = ''; lsSet('bc-openjob', ''); stopJobPoll();
  if (ROLE === 'admin'){ $('#tabbar').hidden = false; showTab('jobs'); }
  else { renderMyJobs(); showOnly('tab-myjobs'); }
}
function canShoot(j){ return j && j.status === 'in_progress' && (ROLE === 'admin' || (j.assigned || []).indexOf(USER.id) >= 0); }
function renderJobHead(){
  var j = findJob(currentJobId); if (!j) return;
  var st = jobState(j), who = (j.assigned || []).map(personName).join(', ');
  var t = photoTotals(j);
  var html = '<div class="jc-top"><div><h1 id="h-job">' + esc(j.client) + '</h1><div class="jc-when">' + esc(niceDate(j.job_date)) + (j.start_time ? ' · ' + esc(clock(j.start_time)) : '') + '</div></div><span class="state ' + st.cls + '">' + esc(st.text) + '</span></div>';
  if (j.address) html += '<div class="jc-line">' + esc(j.address) + ' · <a href="' + esc(mapsLink(j.address)) + '" target="_blank" rel="noopener">Open in Maps</a></div>';
  if (who) html += '<div class="jc-line muted">Team: ' + esc(who) + '</div>';
  if (j.notes) html += '<div class="job-notes"><div class="eyebrow">Notes for this job</div><p>' + esc(j.notes) + '</p></div>';
  if (j.status === 'scheduled'){
    html += '<p>When you get there, tap <b>Start job</b>. Then every room gets a <b>Before</b> photo and an <b>After</b> photo.</p>' +
      '<div class="actions"><button type="button" class="btn primary wide" id="startJobBtn">Start job</button></div>';
  } else if (j.status === 'in_progress'){
    html += '<ol class="ph-rules"><li>Before you touch a room, tap <b>Before</b> and take the photo.</li><li>When the room is done, tap <b>After</b>. Stand in the same spot.</li><li>You can\'t finish until every room has both photos.</li></ol>' +
      '<div class="progress" aria-hidden="true"><div style="width:' + (t.rooms ? Math.round(t.full / t.rooms * 100) : 100) + '%"></div></div>' +
      '<div class="actions"><button type="button" class="btn primary" id="finishJobBtn">Finish job</button></div>';
  } else {
    html += '<div class="alert good">Finished ' + esc(niceDate(j.finished_at ? isoOf(new Date(j.finished_at)) : '').replace(/^(Today|Tomorrow)$/, function(w){ return w.toLowerCase(); })) + ' at ' + esc(niceTime(j.finished_at)) + (j.finished_by ? ' by ' + esc(personName(j.finished_by)) : '') + '. ' + t.shots + ' photos.</div>';
  }
  html += '<p class="status-msg" id="jobMsg" role="status"></p>';
  var prev = $('#jobMsg') ? {t:$('#jobMsg').textContent, c:$('#jobMsg').style.color} : null;
  $('#jobHead').innerHTML = html;
  if (prev && prev.t){ $('#jobMsg').textContent = prev.t; $('#jobMsg').style.color = prev.c; }
  $('#photoCount').textContent = 'Photos: ' + t.full + ' / ' + t.rooms + ' rooms';
}
function renderJobScreen(scrollTop){
  var j = findJob(currentJobId); if (!j) return;
  var q = jobQ(j), secs = buildSteps(q);
  STEP_KEY = 'bc-ticks-job-' + j.id; ticks = lsGet(STEP_KEY, {});
  renderJobHead();
  $('#jobProgress').hidden = j.status === 'done'; $('#clothCard').hidden = j.status === 'done';
  var split = $('#split').checked, loadA = 0, loadB = 0, owners = {};
  secs.forEach(function(s){
    if (s.id === 'start' || s.id === 'finish'){ owners[s.id] = 'both'; return; }
    if (loadA <= loadB){ owners[s.id] = 'A'; loadA += s.tasks.length; } else { owners[s.id] = 'B'; loadB += s.tasks.length; }
  });
  var roomIds = {}; (j.rooms || []).forEach(function(r){ roomIds[r.id] = 1; });
  var clothLabel = {blue:'Blue cloth', green:'Green cloth', yellow:'Yellow cloth', red:'Red cloth'};
  var showBars = j.status !== 'scheduled';
  var list = j.status === 'done' ? secs.filter(function(s){ return roomIds[s.id]; }) : secs;
  $('#sections').innerHTML = list.map(function(s){
    var done = s.tasks.filter(function(_, i){ return ticks[s.id + ':' + i]; }).length;
    var who = split && j.status !== 'done' ? (owners[s.id] === 'both' ? '<span class="who">Both</span>' : '<span class="who' + (owners[s.id] === 'B' ? ' b' : '') + '">Person ' + owners[s.id] + '</span>') : '';
    var bar = roomIds[s.id] && showBars ? '<div class="phbar" data-phbar="' + s.id + '">' + photoBarHTML(j, s) + '</div><p class="phmsg" data-phmsg="' + s.id + '" role="status">' + esc(shotMsg[s.id] || '') + '</p>' : '';
    if (j.status === 'done') return '<div class="card section" data-sec="' + s.id + '"><div class="section-top"><h3>' + esc(s.title) + '</h3></div>' + bar + '</div>';
    return '<div class="card section" data-sec="' + s.id + '">' +
      '<div class="section-top"><h3>' + esc(s.title) + '</h3>' + who + '<span class="sec-count" data-count="' + s.id + '">' + done + '/' + s.tasks.length + '</span></div>' +
      (s.cloths.length ? '<div class="cloths">' + s.cloths.map(function(c){ return '<span class="cloth"><i class="sw ' + c + '"></i>' + clothLabel[c] + '</span>'; }).join('') + '</div>' : '') +
      (s.note ? '<p class="note' + (s.stop ? ' stop' : '') + '">' + esc(s.note) + '</p>' : '') + bar +
      '<ul class="tasks">' + s.tasks.map(function(t, i){
        var k = s.id + ':' + i;
        return '<li><label><input type="checkbox" data-tick="' + k + '"' + (ticks[k] ? ' checked' : '') + '><span>' + esc(t) + '</span></label></li>';
      }).join('') + '</ul></div>';
  }).join('');
  renderJobScreen.secs = secs;
  updateProgress(secs);
  if (scrollTop) window.scrollTo(0, 0);
}
function updateProgress(secs){
  secs = secs || renderJobScreen.secs || [];
  var total = 0, done = 0;
  secs.forEach(function(s){
    var d = 0;
    s.tasks.forEach(function(_, i){ total++; if (ticks[s.id + ':' + i]){ done++; d++; } });
    var c = $('[data-count="' + s.id + '"]'); if (c) c.textContent = d + '/' + s.tasks.length;
  });
  $('#job-bar').style.width = (total ? Math.round(done / total * 100) : 0) + '%';
  $('#job-count').textContent = done + ' of ' + total + ' steps';
}
function stepsText(){
  var j = findJob(currentJobId); if (!j) return '';
  var q = jobQ(j), secs = buildSteps(q), lines = ['Brothers Cleaning Solution · ' + j.client + ' · ' + niceDate(j.job_date), ''];
  secs.forEach(function(s){
    lines.push(s.title.toUpperCase() + (s.cloths.length ? ' [' + s.cloths.join(' + ') + ' cloth]' : ''));
    if (s.note) lines.push('! ' + s.note);
    s.tasks.forEach(function(t){ lines.push('[ ] ' + t); });
    lines.push('');
  });
  return lines.join('\n');
}
function photoBarHTML(j, s){
  var shoot = canShoot(j), b4 = photoOf(j.id, s.id, 'before');
  function btn(kind){
    var p = photoOf(j.id, s.id, kind), key = s.id + ':' + kind;
    if (busyShot[key]) return '<button type="button" class="ph busy" disabled><span class="ph-spin" aria-hidden="true"></span><span>Saving ' + KIND_LABEL[kind].toLowerCase() + '…</span></button>';
    if (p){
      var src = srcOf(p.path);
      return '<button type="button" class="ph done" data-view="' + esc(p.path) + '" data-sec="' + s.id + '" data-kind="' + kind + '" aria-label="' + KIND_LABEL[kind] + ' photo of ' + esc(s.title) + '. Tap to see it">' +
        (src ? '<img src="' + esc(src) + '" alt="">' : '<span class="ph-load">Loading…</span>') + '<span class="ph-tag">' + KIND_LABEL[kind] + ' ✓</span></button>';
    }
    if (j.status === 'done') return '<div class="ph"><span>No ' + KIND_LABEL[kind].toLowerCase() + ' photo</span></div>';
    var locked = kind === 'after' && !b4;
    return '<button type="button" class="ph' + (locked || !shoot ? '' : ' need') + '" data-shot="' + kind + '" data-sec="' + s.id + '"' + (locked || !shoot ? ' disabled' : '') + '>' + CAM_SVG +
      '<span>' + (locked ? 'After (take Before first)' : 'Take ' + KIND_LABEL[kind] + ' photo') + '</span></button>';
  }
  return btn('before') + btn('after');
}
function renderPhotoBars(){
  var j = findJob(currentJobId); if (!j) return;
  (j.rooms || []).forEach(function(r){
    var s = {id:r.id, title:r.title};
    var bar = $('[data-phbar="' + r.id + '"]'); if (bar) bar.innerHTML = photoBarHTML(j, s);
    var m = $('[data-phmsg="' + r.id + '"]'); if (m) m.textContent = shotMsg[r.id] || '';
    var card = $('[data-sec="' + r.id + '"]');
    if (card && photoOf(j.id, r.id, 'before') && photoOf(j.id, r.id, 'after')) card.classList.remove('missing');
  });
  var t = photoTotals(j); $('#photoCount').textContent = 'Photos: ' + t.full + ' / ' + t.rooms + ' rooms';
}
function jobMsg(text, color){ var m = $('#jobMsg'); if (!m) return; m.style.color = color || 'var(--bad)'; m.textContent = text || ''; }
function startJob(){
  var j = findJob(currentJobId); if (!j) return;
  busy($('#startJobBtn'), true, 'Starting…');
  q(SB.rpc('start_job', {j:j.id})).then(function(){ return reloadJob(j.id); }).then(function(){
    renderJobScreen(false);
  }, function(e){ busy($('#startJobBtn'), false); jobMsg('Couldn\'t start the job. ' + errText(e)); });
}
function finishJob(){
  var j = findJob(currentJobId); if (!j) return;
  $$('.section.missing').forEach(function(el){ el.classList.remove('missing'); });
  if (Object.keys(busyShot).length) return jobMsg('Wait for the photos to finish saving.');
  var left = 0; (renderJobScreen.secs || []).forEach(function(s){ s.tasks.forEach(function(_, i){ if (!ticks[s.id + ':' + i]) left++; }); });
  var miss = (j.rooms || []).filter(function(r){ return !photoOf(j.id, r.id, 'before') || !photoOf(j.id, r.id, 'after'); });
  if (!miss.length && left && Date.now() - finishArmed > 8000){
    finishArmed = Date.now();
    return jobMsg(left + (left === 1 ? ' step is' : ' steps are') + ' not ticked. If everything is really done, tap Finish job again.', 'var(--warn)');
  }
  finishArmed = 0;
  busy($('#finishJobBtn'), true, 'Checking…');
  q(SB.rpc('finish_job', {j:j.id})).then(function(res){
    if (res && res.ok){
      var t = photoTotals(j);
      return reloadJob(j.id).then(function(){
        renderJobScreen(true);
        jobMsg('Job finished. ' + t.shots + ' photos saved for ' + j.client + '.', 'var(--good)');
        updateBadges();
      });
    }
    busy($('#finishJobBtn'), false);
    if (res && res.reason === 'missing_photos'){
      var m = res.missing || [];
      jobMsg('You can\'t finish yet. Missing photos: ' + m.map(function(r){ return r.title + ' (' + r.missing.map(function(k){ return KIND_LABEL[k].toLowerCase(); }).join(' and ') + ')'; }).join(', ') + '.');
      m.forEach(function(r){ var el = $('[data-sec="' + r.id + '"]'); if (el) el.classList.add('missing'); });
      var first = m[0] && $('[data-sec="' + m[0].id + '"]'); if (first) first.scrollIntoView({block:'center'});
      return loadJobPhotos(j.id).then(function(){ return signJobPhotos(j); }).then(renderPhotoBars);
    }
    if (res && res.reason === 'already_done') return reloadJob(j.id).then(function(){ renderJobScreen(true); });
  }, function(e){ busy($('#finishJobBtn'), false); jobMsg('Couldn\'t finish. ' + errText(e)); });
}

/* the photo itself: shrink, stamp date/time, JPEG */
function prepPhoto(file, label){
  return new Promise(function(resolve, reject){
    var src = URL.createObjectURL(file), img = new Image();
    img.onload = function(){
      try {
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, max / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
        var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        var ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);
        var fs = Math.max(14, Math.round(Math.min(cw, ch) * 0.035));
        ctx.font = '600 ' + fs + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        var pad = Math.round(fs * 0.55), tw = ctx.measureText(label).width;
        while (tw + pad * 2 > cw && fs > 10){ fs--; ctx.font = '600 ' + fs + 'px system-ui, sans-serif'; pad = Math.round(fs * 0.55); tw = ctx.measureText(label).width; }
        var bh = fs + pad * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(0, ch - bh, Math.min(cw, tw + pad * 2), bh);
        ctx.fillStyle = '#FFFFFF'; ctx.textBaseline = 'middle'; ctx.fillText(label, pad, ch - bh / 2);
        URL.revokeObjectURL(src);
        cv.toBlob(function(b){ if (b && b.size) resolve(b); else reject({code:'encode'}); }, 'image/jpeg', 0.82);
      } catch(e){ URL.revokeObjectURL(src); reject({code:'encode'}); }
    };
    img.onerror = function(){ URL.revokeObjectURL(src); reject({code:'decode'}); };
    img.src = src;
  });
}
function shotErrText(e){
  if (e && (e.code === 'decode' || e.code === 'encode')) return 'That photo didn\'t open. Take it again with the camera.';
  var m = String((e && (e.message || e.error)) || '');
  if (/row-level security|Unauthorized|403/i.test(m)) return 'This job is finished or you\'re not on it, so photos can\'t be added.';
  if (/Payload too large|too large|413/i.test(m)) return 'That photo is too big. Take it again.';
  return 'Couldn\'t save the photo. ' + errText(e);
}
function takeShot(file){
  var shot = pendingShot; pendingShot = null;
  if (!shot || !file) return;
  var j = findJob(shot.jobId); if (!canShoot(j)) return;
  var room = (j.rooms || []).filter(function(r){ return r.id === shot.sec; })[0];
  var key = shot.sec + ':' + shot.kind, old = photoOf(j.id, shot.sec, shot.kind);
  busyShot[key] = true; delete shotMsg[shot.sec]; renderPhotoBars();
  var label = 'Brothers Cleaning · ' + (room ? room.title : shot.sec) + ' · ' + KIND_LABEL[shot.kind].toUpperCase() + ' · ' + stamp();
  var path = j.id + '/' + shot.sec + '-' + shot.kind + '-' + Date.now() + '.jpg';
  prepPhoto(file, label).then(function(blob){ return blob.arrayBuffer(); }).then(function(buf){
    return q(SB.storage.from('photos').upload(path, buf, {contentType:'image/jpeg', upsert:false}));
  }).then(function(){
    return q(SB.from('photos').upsert({job_id:j.id, room_id:shot.sec, kind:shot.kind, path:path, taken_by:USER.id, taken_at:new Date().toISOString()}, {onConflict:'job_id,room_id,kind'}))
      .catch(function(e){ SB.storage.from('photos').remove([path]); throw e; });
  }).then(function(){
    if (old && old.path !== path) SB.storage.from('photos').remove([old.path]).then(function(){}, function(){});
    return loadJobPhotos(j.id).then(function(){ return signJobPhotos(j); });
  }).catch(function(e){
    shotMsg[shot.sec] = shotErrText(e);
  }).then(function(){
    delete busyShot[key]; renderPhotoBars(); renderJobHead();
  });
}
function openCamera(shot){ pendingShot = shot; var ci = $('#camInput'); ci.value = ''; ci.click(); }

/* lightbox */
var lbShot = null;
function openLightbox(path, caption, shot){
  lbShot = shot || null;
  $('#lbImg').src = srcOf(path);
  $('#lbCap').textContent = caption || '';
  $('#lbRetake').hidden = !shot;
  $('#lightbox').hidden = false;
  $('#lbClose').focus();
}
function closeLightbox(){ $('#lightbox').hidden = true; $('#lbImg').removeAttribute('src'); lbShot = null; }

/* =========================================================
   TEAM (admin)
   ========================================================= */
var lastInvite = null;
function renderTeam(){
  if (ROLE !== 'admin' || !$('#teamList')) return;
  $('#teamCount').textContent = team.length;
  $('#teamList').innerHTML = team.map(function(p){
    var me = p.id === USER.id;
    return '<div class="person' + (p.active ? '' : ' off') + '"><div class="person-main"><b>' + esc(p.full_name || p.email.split('@')[0]) + (me ? ' (you)' : '') + '</b><span>' + esc(p.email) + '</span></div>' +
      '<div class="person-tags"><span class="tag">' + (p.role === 'admin' ? 'Admin' : 'Worker') + '</span>' + (p.active ? '' : '<span class="tag bad">Turned off</span>') + '</div>' +
      (me ? '' : '<div class="actions"><button type="button" class="btn small ghost" data-toggle="' + esc(p.id) + '">' + (p.active ? 'Turn off' : 'Turn back on') + '</button>' +
        '<button type="button" class="btn small ghost" data-role="' + esc(p.id) + '">' + (p.role === 'admin' ? 'Make worker' : 'Make admin') + '</button></div>') + '</div>';
  }).join('') || '<p class="note">Just you so far.</p>';
  $('#inviteCard').hidden = !invites.length;
  $('#inviteList').innerHTML = invites.map(function(v){
    return '<div class="person"><div class="person-main"><b>' + esc(v.full_name || v.email) + '</b><span>' + esc(v.email) + ' · ' + (v.role === 'admin' ? 'Admin' : 'Worker') + '</span></div>' +
      '<div class="actions"><button type="button" class="btn small ghost danger" data-uninvite="' + esc(v.email) + '">Remove</button></div></div>';
  }).join('');
}
function siteLink(){ return location.origin + location.pathname; }
function inviteText(v){
  return 'Hi ' + (v.full_name || '') + ', this is the Brothers Cleaning app for our jobs and photos.\n\n1. Open ' + siteLink() + '\n2. Tap "Create account"\n3. Sign up with this email: ' + v.email + '\n4. Make a password you\'ll remember\n\nOn your phone, use "Add to Home Screen" so it opens like an app.';
}
function doInvite(e){
  e.preventDefault();
  var msg = $('#iv-msg'); msg.style.color = 'var(--bad)';
  var name = $('#iv-name').value.trim(), email = $('#iv-email').value.trim().toLowerCase();
  var role = ($('input[name="iv-role"]:checked') || {}).value || 'worker';
  if (!name){ msg.textContent = 'Type their name.'; $('#iv-name').focus(); return; }
  if (!validEmail(email)){ msg.textContent = 'Type a real email address.'; $('#iv-email').focus(); return; }
  if (team.some(function(p){ return p.email === email; })){ msg.textContent = 'That person already has an account.'; return; }
  busy($('#iv-go'), true, 'Adding…');
  q(SB.from('invites').upsert({email:email, full_name:name, role:role, used_at:null})).then(function(){
    busy($('#iv-go'), false);
    lastInvite = {email:email, full_name:name, role:role};
    msg.style.color = 'var(--good)';
    msg.textContent = name + ' is added. Send them the message below so they can make their account.';
    $('#iv-text').value = inviteText(lastInvite); $('#iv-text').hidden = false; $('#iv-copyRow').hidden = false;
    $('#iv-name').value = ''; $('#iv-email').value = '';
    return loadInvites().then(renderTeam);
  }, function(err){ busy($('#iv-go'), false); msg.textContent = 'Couldn\'t add them. ' + errText(err); });
}
function updatePerson(id, patch){
  return q(SB.from('profiles').update(patch).eq('id', id)).then(function(){ return loadTeam(); }).then(function(){ renderTeam(); renderJobsAdmin(); }, function(e){ onWriteError(e); });
}

/* =========================================================
   FOLLOW-UP PLAN
   Each lead walks a fixed plan of steps. Dates count business
   days only (no weekends, no Ontario stat holidays).
   ========================================================= */
var HOLIDAYS = {'2026-10-12':1,'2026-12-25':1,'2026-12-28':1,'2027-01-01':1,'2027-02-15':1,'2027-03-26':1,
  '2027-05-24':1,'2027-07-01':1,'2027-09-06':1,'2027-10-11':1,'2027-12-27':1,'2027-12-28':1};
function isoOf(d){ var x = new Date(d.getTime()); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); }
function parseISO(iso){ var p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function isBizDay(d){ var w = d.getDay(); return w !== 0 && w !== 6 && !HOLIDAYS[isoOf(d)]; }
function addBizDays(iso, n){
  var d = parseISO(iso || todayISO());
  while (!isBizDay(d)) d.setDate(d.getDate() + 1);
  var left = n || 0;
  while (left > 0){ d.setDate(d.getDate() + 1); if (isBizDay(d)) left--; }
  return isoOf(d);
}

var STEP = {
  intro:  {kind:'email', tpl:'intro',  label:'Send intro email',             chip:'Email',      gap:0},
  call1:  {kind:'call',                label:'Call to follow up',            chip:'Call',       gap:3},
  follow: {kind:'email', tpl:'follow', label:'Send follow-up email',         chip:'Email 2',    gap:2},
  visit:  {kind:'visit',               label:'Walk in with a flyer',         chip:'Visit',      gap:5},
  final:  {kind:'email', tpl:'final',  label:'Send last email',              chip:'Last email', gap:5},
  visitA: {kind:'visit',               label:'Walk in with a flyer',         chip:'Visit',      gap:0},
  callA:  {kind:'call',                label:'Call to follow up',            chip:'Call',       gap:3},
  visitB: {kind:'visit',               label:'Drop by again',                chip:'Visit 2',    gap:7},
  callP:  {kind:'call',                label:'Call about their vendor list', chip:'Call',       gap:0},
  callP2: {kind:'call',                label:'Call again',                   chip:'Call 2',     gap:10},
  nurture:{kind:'call',                label:'Check in again',               chip:'Check-in',   gap:60}
};
var PLANS = {
  email:   ['intro', 'call1', 'follow', 'visit', 'final', 'nurture'],
  pmEmail: ['intro', 'call1', 'follow', 'final', 'nurture'],
  visit:   ['visitA', 'callA', 'visitB', 'nurture'],
  pmCall:  ['callP', 'callP2', 'nurture']
};
var TPL_NAME = {intro:'intro email', follow:'follow-up email', final:'last email'};
var ACTIVE = {'new':1, contacted:1};

function canEmail(l){ return !!(l.email && !l.doNotEmail); }
function planFor(l){
  if (l.plan && PLANS[l.plan]) return l.plan;
  if (l.type === 'pm') return canEmail(l) ? 'pmEmail' : 'pmCall';
  return canEmail(l) ? 'email' : 'visit';
}
function stepIdx(l){
  var seq = PLANS[planFor(l)];
  var i = typeof l.step === 'number' ? l.step : (l.emailedAt ? 1 : 0);
  return Math.max(0, Math.min(i, seq.length - 1));
}
function touchesOf(l){ return Array.isArray(l.touches) ? l.touches : (l.emailedAt ? [{d:l.emailedAt, t:'email', k:'intro'}] : []); }
function sentTpl(l, tpl){ return touchesOf(l).some(function(x){ return x.t === 'email' && x.k === tpl; }); }
function stepOf(l){
  var key = PLANS[planFor(l)][stepIdx(l)], def = STEP[key];
  if (def.kind === 'email' && (!canEmail(l) || sentTpl(l, def.tpl))) def = {kind:'call', label:'Call to follow up', chip:def.chip, gap:def.gap};
  return {key:key, def:def};
}
function nextFields(l, newStep, baseISO){
  var seq = PLANS[planFor(l)], i = Math.max(0, Math.min(newStep, seq.length - 1)), def = STEP[seq[i]];
  var label = def.label;
  if (def.kind === 'email' && (!canEmail(l) || sentTpl(l, def.tpl))) label = 'Call to follow up';
  return {step:i, next:label, nextDate:addBizDays(baseISO || todayISO(), def.gap)};
}
function logUpdate(l, touch, patch){
  var tl = touchesOf(l).concat([Object.assign({d: todayISO()}, touch)]);
  if (tl.length > 60) tl = tl.slice(-60);
  return updateLead(l.id, Object.assign({touches: tl, plan: planFor(l)}, patch));
}
function findLead(id){ return leads.filter(function(x){ return x.id === id; })[0]; }

/* =========================================================
   EMAILS
   ========================================================= */
function firstName(s){ return String(s || '').trim().split(/\s+/)[0] || ''; }
function cleanName(s){ return String(s || '').replace(/\s*\([^)]*\)/g, '').replace(/,\s*(Orl[ée]ans|RE\/MAX.*)$/i, '').trim(); }
function introSubjectFor(nm, l){ return l.type === 'pm' ? 'Cleaning contractor for your Ottawa properties' : 'After-hours cleaning for ' + nm; }
function emailFor(l, tpl){
  tpl = tpl || 'intro';
  var phone = ME.phone, addr = ME.address || '119 Winterhaven Drive, Orléans, ON K1W 0H3';
  var from = ME.email || 'bc_solution@myyahoo.com', me = ME.name || 'Moe';
  var hi = l.contact ? 'Hi ' + firstName(l.contact) + ',' : 'Hello,';
  var nm = cleanName(l.name), pm = l.type === 'pm';
  var reachLine = phone ? 'You can reply here, or call or text me at ' + phone + '.' : 'Just reply to this email and I\'ll set it up.';
  var subject, body;
  if (tpl === 'follow'){
    var sent = touchesOf(l).filter(function(x){ return x.t === 'email' && x.k === 'intro' && x.s; })[0];
    subject = 'Re: ' + (sent ? sent.s : introSubjectFor(nm, l));
    body = pm ? [hi, '',
      'Just following up on my note last week about getting on your list of cleaning contractors.', '',
      'If one of your east-end buildings needs a cleaner, I can do a free walkthrough and send a written quote within 24 hours. Is there a better person for me to talk to about vendors?']
    : [hi, '',
      'Just following up on my email last week about after-hours cleaning for ' + nm + '.', '',
      'If you\'re happy with your current cleaner, no problem at all. If you\'d like a second price, I can come by for 15 minutes before or after your hours and send a written quote the next day.', '',
      'Is there a better person for me to talk to about cleaning? ' + reachLine];
  } else if (tpl === 'final'){
    subject = 'Should I close your file?';
    body = [hi, '',
      'I\'ve reached out a couple of times about ' + (pm ? 'cleaning work for your properties' : 'cleaning for ' + nm) + ' and haven\'t heard back, so I\'ll take it the timing isn\'t right. This is my last email.', '',
      'If anything changes, just reply here and we can do a free walkthrough that same week.'];
  } else if (pm){
    subject = introSubjectFor(nm, l);
    body = [hi, '',
      'My name is ' + me + '. My brother and I run Brothers Cleaning Solution, a cleaning company based in Orléans. We clean offices, clinics and commercial units after hours, evenings or weekends.', '',
      'Could you tell me how a new cleaning company gets on your list of contractors, and what you need from a vendor? If one of your east-end buildings needs a cleaner now, I can do a free walkthrough and send a written quote within 24 hours.'];
  } else {
    var clinic = l.type === 'medical' || l.type === 'daycare';
    var who = clinic ? 'your patients and staff are' : (l.type === 'retail' ? 'your customers are' : 'your team is');
    subject = introSubjectFor(nm, l);
    body = [hi, '',
      'My name is ' + me + '. My brother and I run Brothers Cleaning Solution, a local cleaning company here in Orléans.', '',
      'We clean ' + (clinic ? 'clinics' : 'offices') + ' after hours, evenings or weekends, so ' + who + ' never disturbed. I\'d like to offer ' + nm + ' a free 15-minute walkthrough and a written quote within 24 hours.', '',
      '- The same two people every visit',
      '- Weekly, every 2 weeks or monthly',
      '- No long contract: 30 days notice to stop', '',
      'Would a quick walkthrough one day next week work? ' + reachLine];
  }
  body = body.concat(['', 'Thanks,', me, 'Brothers Cleaning Solution', phone ? phone + ' · ' + from : from, addr, '',
    'If you\'d rather not hear from us, reply "unsubscribe" and we won\'t email you again.']);
  return {to: l.email, subject: subject, body: body.join('\n')};
}
/* Yahoo drops line breaks from a linked message and mangles ' and & in subjects,
   so the link fills address + subject only and the message goes in by paste. */
function yahooLink(to, subject){
  var s = String(subject).replace(/'/g, '’').replace(/\s&\s/g, ' and ');
  return 'https://compose.mail.yahoo.com/?to=' + encodeURIComponent(to) + '&subject=' + encodeURIComponent(s);
}
function hostOf(u){ try { return new URL(u).hostname.replace(/^www\./, ''); } catch(e){ return 'source'; } }

/* =========================================================
   LEADS UI
   ========================================================= */
var leadFilter = '', editingId = null, pendingDelete = null;
var panel = null;            /* {id, kind:'mail'|'log', type, tpl} */
var drafts = {};             /* typed text kept across live refreshes */

var OUT_LABEL = {
  call:  {noanswer:'No answer / left a message', later:'Talked: try again later', walk:'Walkthrough booked', won:'They said yes', notint:'Not interested', stop:'Asked us to stop emailing'},
  visit: {noanswer:'Left a flyer / manager not in', later:'Talked: try again later', walk:'Walkthrough booked', won:'They said yes', notint:'Not interested', stop:'Asked us to stop emailing'},
  reply: {later:'Replied: try again later', walk:'Walkthrough booked', won:'They said yes', notint:'Not interested', stop:'Asked us to stop emailing'}
};
function outcomesFor(l, type){
  var o;
  if (l.status === 'walkthrough') o = ['walk', 'later', 'notint'];
  else if (l.status === 'quoted') o = ['won', 'later', 'notint'];
  else if (l.status === 'lost') o = ['later', 'walk'];
  else o = ['noanswer', 'later', 'walk', 'notint'];
  if (l.email && !l.doNotEmail && l.status !== 'won') o.push('stop');
  return o.filter(function(k){ return OUT_LABEL[type][k]; });
}
function outcomeClass(k){ return (k === 'walk' || k === 'won') ? ' good' : ((k === 'notint' || k === 'stop') ? ' bad' : ''); }

function applyOutcome(l, type, out, date, note){
  var touch = {t:type, o:out}; if (note) touch.n = note;
  var patch = {};
  if (out === 'noanswer'){
    Object.assign(patch, nextFields(l, stepIdx(l) + 1));
    if (l.status === 'new') patch.status = 'contacted';
  } else if (out === 'later'){
    patch.next = l.status === 'quoted' ? 'Follow up on the quote' : 'Follow up: they asked to try later';
    patch.nextDate = date;
    if (l.status === 'new' || l.status === 'lost') patch.status = 'contacted';
  } else if (out === 'walk'){
    patch.status = 'walkthrough'; patch.next = 'Do the walkthrough'; patch.nextDate = date; touch.w = date;
  } else if (out === 'won'){
    patch.status = 'won'; patch.next = 'Book the first clean'; patch.nextDate = todayISO();
  } else if (out === 'notint'){
    patch.status = 'lost'; patch.next = ''; patch.nextDate = '';
  } else if (out === 'stop'){
    patch.status = 'lost'; patch.doNotEmail = true; patch.next = ''; patch.nextDate = '';
  }
  return logUpdate(l, touch, patch);
}

function leadDueState(l){
  if (!l.nextDate || l.status === 'won' || l.status === 'lost') return '';
  var t = todayISO();
  return l.nextDate < t ? 'overdue' : (l.nextDate === t ? 'today' : '');
}
function isDue(l){ return !!leadDueState(l); }
function introReady(l){ return ACTIVE[l.status] && canEmail(l) && !sentTpl(l, 'intro') && stepOf(l).def.tpl === 'intro'; }
function fmtDate(iso){
  if (!iso) return '';
  var d = parseISO(iso);
  return d.toLocaleDateString('en-CA', {weekday:'short', month:'short', day:'numeric'});
}
function touchText(x){
  var lab = x.o && OUT_LABEL[x.t] ? OUT_LABEL[x.t][x.o] : '';
  var s;
  if (x.t === 'email') s = 'Sent the ' + (TPL_NAME[x.k] || 'email');
  else if (x.t === 'call') s = 'Called: ' + lab;
  else if (x.t === 'visit') s = 'Visited: ' + lab;
  else if (x.t === 'reply') s = 'They replied: ' + lab;
  else s = x.n || 'Note';
  if (x.w) s += ' for ' + fmtDate(x.w);
  if (x.n && x.t !== 'note') s += ' (“' + x.n + '”)';
  return s;
}

function planChips(l){
  if (!ACTIVE[l.status]) return '';
  var seq = PLANS[planFor(l)], cur = stepIdx(l);
  return '<ol class="plan" aria-label="Follow-up plan, step ' + (cur + 1) + ' of ' + seq.length + '">' + seq.map(function(k, i){
    var cls = i < cur ? 'done' : (i === cur ? 'now' : '');
    return '<li class="' + cls + '">' + (i < cur ? '✓ ' : '') + esc(STEP[k].chip) + '</li>';
  }).join('') + '</ol>';
}
function primaryBtn(l){
  var id = esc(l.id), open = panel && panel.id === l.id, dis = readOnly ? ' disabled' : '';
  if (ACTIVE[l.status]){
    var s = stepOf(l);
    if (s.def.kind === 'email'){
      var isOpen = open && panel.kind === 'mail';
      return '<button type="button" class="btn small' + (isOpen ? '' : ' primary') + '" data-act="mail" data-tpl="' + s.def.tpl + '" data-id="' + id + '"' + dis + '>' + (isOpen ? 'Close email' : 'Write ' + TPL_NAME[s.def.tpl]) + '</button>';
    }
    var k = s.def.kind, isLog = open && panel.kind === 'log';
    return '<button type="button" class="btn small' + (isLog ? '' : ' primary') + '" data-act="log" data-type="' + k + '" data-id="' + id + '"' + dis + '>' + (isLog ? 'Close' : (k === 'call' ? 'Log call' : 'Log visit')) + '</button>';
  }
  if (l.status === 'walkthrough') return '<button type="button" class="btn small primary" data-act="quote" data-id="' + id + '"' + dis + '>Walkthrough done: make the quote</button>';
  if (l.status === 'quoted') return '<button type="button" class="btn small primary" data-act="log" data-type="call" data-id="' + id + '"' + dis + '>' + (open && panel.kind === 'log' ? 'Close' : 'Log follow-up') + '</button>';
  return '';
}

function mailPanel(l, tpl){
  var m = emailFor(l, tpl), id = esc(l.id), key = l.id + ':' + tpl;
  var body = drafts[key] != null ? drafts[key] : m.body;
  return '<div class="mail">' +
    '<div class="mail-row"><span class="eyebrow">To</span><span>' + esc(m.to) + '</span><button type="button" class="btn small" data-copyf="to" data-id="' + id + '">Copy</button></div>' +
    '<div class="mail-row"><span class="eyebrow">Subject</span><span>' + esc(m.subject) + '</span><button type="button" class="btn small" data-copyf="subject" data-id="' + id + '">Copy</button></div>' +
    '<textarea class="copybox" data-mailbody="' + id + '" aria-label="Email message">' + esc(body) + '</textarea>' +
    '<p class="hint">Tap the blue button: it copies the message and opens Yahoo with the address and subject filled in. Paste the message into the email (Ctrl+V, or press and hold, then Paste), press Send, then come back and tap “I sent it”.</p>' +
    '<div class="actions">' +
      '<a class="btn primary" data-yahoo="' + id + '" href="' + esc(yahooLink(m.to, m.subject)) + '" target="_blank" rel="noopener">Copy message &amp; open Yahoo</a>' +
      '<button type="button" class="btn" data-copyf="body" data-id="' + id + '">Copy message</button>' +
      '<button type="button" class="btn dark" data-sent="' + id + '" data-tpl="' + tpl + '"' + (readOnly ? ' disabled' : '') + '>I sent it</button>' +
    '</div>' +
    '<div class="status-msg" data-mailmsg="' + id + '" role="status"></div>' +
    '</div>';
}
function logPanel(l, type){
  var id = esc(l.id);
  var types = [['call', 'Call'], ['visit', 'Visit'], ['reply', 'They replied']];
  if (!sentTpl(l, 'intro') && !touchesOf(l).some(function(x){ return x.t === 'email'; })) types = types.slice(0, 2);
  var outs = outcomesFor(l, type);
  var def = l.status === 'walkthrough' ? (l.nextDate || addBizDays(todayISO(), 1)) : addBizDays(todayISO(), 10);
  var dateVal = drafts[l.id + ':date'] || def;
  return '<div class="logp">' +
    '<div class="seg3" role="group" aria-label="What did you do">' + types.map(function(t){
      return '<button type="button" data-logtype="' + t[0] + '" data-id="' + id + '" aria-pressed="' + (t[0] === type) + '">' + t[1] + '</button>';
    }).join('') + '</div>' +
    '<div class="row2">' +
      '<label class="field"><span>Date for a call-back or walkthrough</span><input type="date" data-logdate="' + id + '" value="' + esc(dateVal) + '" min="' + todayISO() + '"></label>' +
      '<label class="field"><span>Note (optional)</span><input type="text" data-lognote="' + id + '" value="' + esc(drafts[l.id + ':note'] || '') + '" placeholder="e.g. Spoke to Lisa, contract ends in March"></label>' +
    '</div>' +
    '<div class="eyebrow">What happened? Tap one to save it</div>' +
    '<div class="outs">' + outs.map(function(k){
      return '<button type="button" class="btn' + outcomeClass(k) + '" data-out="' + k + '" data-id="' + id + '" data-type="' + type + '"' + (readOnly ? ' disabled' : '') + '>' + esc(OUT_LABEL[type][k]) + '</button>';
    }).join('') + '</div>' +
    '<div class="status-msg" data-logmsg="' + id + '" role="status"></div>' +
    '</div>';
}

function renderLeads(){
  renderQuoteFor();
  var counts = {}; STATUSES.forEach(function(s){ counts[s[0]] = 0; });
  var won = 0, due = 0, ready = 0;
  leads.forEach(function(l){
    counts[l.status] = (counts[l.status] || 0) + 1;
    if (l.status === 'won') won += +l.value || 0;
    if (isDue(l)) due++;
    if (introReady(l)) ready++;
  });
  $('#pipe').innerHTML = STATUSES.map(function(s){
    return '<button type="button" data-filter="' + s[0] + '" aria-pressed="' + (leadFilter === s[0]) + '"><b>' + counts[s[0]] + '</b><span>' + s[1] + '</span></button>';
  }).join('');
  $('#wonTotal').textContent = money(won);
  var badge = $('#dueBadge'); badge.hidden = !due; badge.textContent = due;
  $('#dueCount').textContent = due;
  $('#toEmailCount').textContent = ready;
  $('#dueBtn').setAttribute('aria-pressed', leadFilter === 'due');
  $('#dueBtn').textContent = leadFilter === 'due' ? 'Show all leads' : 'Show them';
  $('#toEmailBtn').setAttribute('aria-pressed', leadFilter === 'toemail');
  $('#toEmailBtn').textContent = leadFilter === 'toemail' ? 'Show all leads' : 'Show them';
  $('#detailsWarn').hidden = !!ME.address;
  var rank = {'new':1, contacted:1, walkthrough:1, quoted:1, won:2, lost:3};
  var list = leads.filter(function(l){
    if (leadFilter === 'toemail') return introReady(l);
    if (leadFilter === 'due') return isDue(l);
    return !leadFilter || l.status === leadFilter;
  }).slice().sort(function(a, b){
    var ra = rank[a.status] || 1, rb = rank[b.status] || 1; if (ra !== rb) return ra - rb;
    var da = a.nextDate || '9999', dbb = b.nextDate || '9999'; if (da !== dbb) return da < dbb ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  $('#addLeadBtn').disabled = readOnly;
  if (!leads.length){
    $('#leadList').innerHTML = '<div class="empty"><b>No leads yet.</b><span>Every office you walk into, every Bark or HomeStars request, every quote you send: add it here. Use “Save to leads” on the Quote tab to add a quoted job in one tap.</span></div>';
    return;
  }
  if (!list.length){
    var msg = leadFilter === 'toemail' ? '<b>No intro emails left to send.</b><span>Every lead with an email has had its intro email. Tap “Show all leads”.</span>'
      : leadFilter === 'due' ? '<b>Nothing due right now.</b><span>You\'re caught up. Tap “Show all leads” to see what\'s coming.</span>'
      : '<b>Nothing in “' + esc(STATUS_LABEL[leadFilter]) + '”.</b><span>Tap the number again to see every lead.</span>';
    $('#leadList').innerHTML = '<div class="empty">' + msg + '</div>';
    return;
  }
  $('#leadList').innerHTML = list.map(leadCard).join('');
}

function leadCard(l){
  var id = esc(l.id), st = leadDueState(l);
  var meta = [esc(TYPE_LABEL[l.type] || 'Lead')]; if (l.area) meta.push(esc(l.area)); if (+l.value) meta.push(money(+l.value) + '/mo');
  var notes = String(l.notes || ''), nl = notes.indexOf('\n');
  var addr = nl > -1 ? notes.slice(0, nl) : notes, rest = nl > -1 ? notes.slice(nl + 1) : '';
  var lines = '';
  if (l.contact || l.reach) lines += '<p class="contact">' + esc([l.contact, l.reach].filter(Boolean).join(' · ')) + '</p>';
  if (l.email){
    lines += '<p class="mailline">' + esc(l.email) +
      (sentTpl(l, 'intro') ? ' <span class="tag" style="background:var(--accent-soft);color:var(--accent)">Emailed ' + esc(fmtDate((touchesOf(l).filter(function(x){ return x.t === 'email'; })[0] || {}).d || l.emailedAt)) + '</span>' : '') +
      (l.doNotEmail ? ' <span class="tag bad">Do not email</span>' : '') + '</p>';
    if (l.emailSource) lines += '<p class="src">Email listed on <a href="' + esc(l.emailSource) + '" target="_blank" rel="noopener">' + esc(hostOf(l.emailSource)) + '</a></p>';
  } else if (l.status !== 'won' && l.status !== 'lost'){
    lines += '<p><span class="tag warn">No email: call or walk in</span></p>';
  }
  if (addr) lines += '<p class="addr">' + esc(addr) + '</p>';
  var next = (l.next || l.nextDate) ? '<p class="lead-next ' + st + '">' + (st === 'overdue' ? 'Overdue: ' : (st === 'today' ? 'Today: ' : 'Next: ')) + esc(l.next || 'Follow up') + (l.nextDate ? ' · ' + esc(fmtDate(l.nextDate)) : '') + '</p>' : '';
  var tl = touchesOf(l);
  var hist = (tl.length || rest) ? '<details class="hist"><summary>History' + (tl.length ? ' (' + tl.length + ')' : '') + ' and notes</summary>' +
    (tl.length ? '<ol>' + tl.slice().reverse().map(function(x){ return '<li><b>' + esc(fmtDate(x.d)) + '</b> · ' + esc(touchText(x)) + '</li>'; }).join('') + '</ol>' : '') +
    (rest ? '<p class="note" style="white-space:pre-line;margin-top:8px">' + esc(rest) + '</p>' : '') + '</details>' : '';
  var sel = '<select data-status="' + id + '" aria-label="Stage"' + (readOnly ? ' disabled' : '') + '>' + STATUSES.map(function(s){ return '<option value="' + s[0] + '"' + (l.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select>';
  var open = panel && panel.id === l.id;
  var showLogBtn = l.status !== 'won' && !(ACTIVE[l.status] && stepOf(l).def.kind !== 'email') && l.status !== 'quoted';
  var logBtn = showLogBtn ? '<button type="button" class="btn small" data-act="log" data-type="' + (sentTpl(l, 'intro') ? 'reply' : 'call') + '" data-id="' + id + '"' + (readOnly ? ' disabled' : '') + '>' + (open && panel.kind === 'log' ? 'Close' : 'Log an update') + '</button>' : '';
  var delLabel = pendingDelete === l.id ? 'Tap again to delete' : 'Delete';
  var pnl = '';
  if (open && panel.kind === 'mail') pnl = mailPanel(l, panel.tpl);
  if (open && panel.kind === 'log') pnl = logPanel(l, panel.type);
  return '<article class="card lead" data-lead="' + id + '">' +
    '<div class="lead-top"><h3>' + esc(l.name || 'Unnamed') + '</h3><span class="st st-' + esc(l.status) + '">' + esc(STATUS_LABEL[l.status] || l.status) + '</span></div>' +
    '<div class="lead-meta">' + meta.join(' · ') + '</div>' + lines + planChips(l) + next +
    '<div class="lead-row">' + primaryBtn(l) + logBtn + '</div>' +
    pnl +
    hist +
    '<div class="lead-row minor">' + sel +
      (l.reach ? '<button type="button" class="btn small ghost" data-copy="' + id + '">Copy phone</button>' : '') +
      '<button type="button" class="btn small ghost" data-edit="' + id + '"' + (readOnly ? ' disabled' : '') + '>Edit</button>' +
      '<button type="button" class="btn small ghost danger" data-del="' + id + '"' + (readOnly ? ' disabled' : '') + '>' + delLabel + '</button></div>' +
    '</article>';
}

function openLeadForm(lead){
  editingId = lead && lead.id ? lead.id : null;
  $('#leadFormTitle').textContent = editingId ? 'Edit lead' : 'New lead';
  lead = lead || {};
  $('#l-name').value = lead.name || ''; $('#l-type').value = lead.type || 'office'; $('#l-contact').value = lead.contact || '';
  $('#l-reach').value = lead.reach || ''; $('#l-email').value = lead.email || ''; $('#l-area').value = lead.area || ''; $('#l-status').value = lead.status || 'new';
  $('#l-next').value = lead.next || ''; $('#l-date').value = lead.nextDate || ''; $('#l-value').value = lead.value || '';
  $('#l-notes').value = lead.notes || ''; $('#leadMsg').textContent = '';
  $('#leadForm').hidden = false; $('#addLeadBtn').hidden = true;
  $('#l-name').focus();
}
function closeLeadForm(){ $('#leadForm').hidden = true; $('#addLeadBtn').hidden = false; editingId = null; }

/* Quote ↔ lead link: "Make the quote" from a lead fills the Quote tab,
   and saving updates that same lead instead of adding a duplicate. */
function linkedLead(){ return Q.leadId ? findLead(Q.leadId) : null; }
function renderQuoteFor(){
  var box = $('#quoteFor'), l = linkedLead(), sb = $('#saveLead');
  if (sb) sb.textContent = l ? 'Update this lead' : 'Save to leads';
  if (!l){ box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = 'Quoting for <b>' + esc(l.name) + '</b>. “Update this lead” saves the price to that lead. <button type="button" class="btn small ghost" id="unlinkLead">Not this lead</button>';
}
function quoteForLead(l){
  Q.client = cleanName(l.name); Q.area = l.area || ''; Q.leadId = l.id;
  if (l.type === 'house') Q.kind = 'house';
  else { Q.kind = 'office'; if (OTYPE[l.type]) Q.otype = l.type; }
  lsSet('bc-quote', Q); fillForm(); syncVisibility(); renderResult(); renderQuoteFor(); stepsDirty = true;
  showTab('quote');
}
function saveQuoteAsLead(){
  if (readOnly){ $('#quoteMsg').textContent = 'You can\'t change leads with view-only access.'; return; }
  var r = calc(), you = yourPrice(r.mid), monthly = r.visits > 0 ? r5(you * r.visits) : 0;
  var summary = (Q.kind === 'office'
      ? OTYPE[Q.otype].label + ', ' + Number(Q.sqft).toLocaleString('en-CA') + ' sq ft, ' + r.fr.label.toLowerCase() + '. Quoted ' + money(you) + (r.visits ? '/visit' : '') + (r.first ? ', first visit ' + money(yourPrice(r.first.mid)) : '') + '.'
      : HTYPE[Q.htype].label + ' clean, ' + Q.bed + ' bed / ' + Q.full + ' bath. Quoted ' + money(you) + (r.visits ? '/visit ' + r.fr.word : '') + (r.first ? ', first visit ' + money(yourPrice(r.first.mid)) : '') + '.');
  var followDate = addBizDays(todayISO(), 3);
  var l = linkedLead();
  if (l){
    logUpdate(l, {t:'note', n:'Quote: ' + summary}, {status:'quoted', value: monthly, next:'Follow up on the quote', nextDate: followDate})
      .then(function(){ var m = $('#quoteMsg'); if (m) m.textContent = 'Updated ' + l.name + ': quoted, follow-up on ' + fmtDate(followDate) + '.'; }, function(){});
    return;
  }
  var lead = {
    name: Q.client || (Q.kind === 'office' ? OTYPE[Q.otype].label + ' quote' : 'House quote'),
    type: Q.kind === 'office' ? Q.otype : 'house', contact:'', reach:'', email:'', area: Q.area, status:'quoted',
    next:'Follow up on the quote', nextDate: followDate, value: monthly, notes: '', touches: [{d: todayISO(), t:'note', n:'Quote: ' + summary}]
  };
  addLead(lead).then(function(){ var m = $('#quoteMsg'); if (m) m.textContent = 'Saved to Leads with a follow-up on ' + fmtDate(followDate) + '.'; }, function(){});
}

/* =========================================================
   SETUP UI
   ========================================================= */
var SETUP = [
  ['bank', 'Open a business bank account', 'Bring the certificate and the Registration Information pages. Keep business money separate from day one.'],
  ['insurance', 'Get commercial liability insurance', 'Offices and property managers ask for proof before they sign. $2 million coverage is the common ask. Get 2–3 quotes.'],
  ['wsib', 'Check WSIB', 'Ask WSIB whether your business has to register. Many offices ask for a WSIB clearance certificate before you start.'],
  ['cra', 'Get a CRA business number and decide on HST', 'HST isn\'t required until you pass $30,000 in sales. Registering early lets office clients and you claim HST back. Ask an accountant.'],
  ['phone', 'Business phone number and email', 'A separate number (second SIM or a calling app) so you always answer as the business.'],
  ['gbp', 'Google Business Profile', 'Free. Puts you on Google Maps for Orléans and Ottawa. Ask every happy client for a review.'],
  ['flyer', 'One-page flyer for walk-ins', 'Name, phone, what you clean, "free walkthrough, quote in 24 hours", after-hours cleaning.'],
  ['agreement', 'Simple one-page service agreement', 'What\'s included, how often, price, payment terms, 30 days notice to cancel. Both sign it.'],
  ['kit', 'Buy the starter supply kit', 'See the list below.'],
  ['books', 'Track every receipt and kilometre', 'Supplies, gas and your phone bill are business costs. A simple spreadsheet works.']
];
var KIT = [
  ['vac', 'Vacuum with a HEPA filter (backpack style is fastest for offices)'],
  ['mop', 'Flat mop with washable pads, plus a bucket'],
  ['cloths', 'Microfibre cloths in 4 colours: blue, green, yellow, red'],
  ['apc', 'All-purpose cleaner'],
  ['glass', 'Glass cleaner'],
  ['disinf', 'Disinfectant with a DIN number on the label'],
  ['bowl', 'Toilet bowl cleaner and a toilet brush'],
  ['degreaser', 'Degreaser for kitchens and ovens'],
  ['scrub', 'Scrub brushes and non-scratch scrub pads'],
  ['duster', 'Extendable duster'],
  ['gloves', 'Nitrile gloves'],
  ['bags', 'Garbage bags in a few sizes'],
  ['caddy', 'Caddy to carry it all'],
  ['sign', 'Wet floor sign'],
  ['bottles', 'Labelled spray bottles for diluted products'],
  ['covers', 'Shoe covers for house jobs']
];

function renderSetup(){
  $('#setupList').innerHTML = SETUP.map(function(s){
    return '<li><label><input type="checkbox" data-setup="' + s[0] + '"' + (setupDone[s[0]] ? ' checked' : '') + (readOnly ? ' disabled' : '') + '><div><b>' + esc(s[1]) + '</b><p>' + esc(s[2]) + '</p></div></label></li>';
  }).join('');
  var have = 0;
  $('#kitList').innerHTML = KIT.map(function(k){
    var key = 'kit_' + k[0]; if (setupDone[key]) have++;
    return '<label><input type="checkbox" data-setup="' + key + '"' + (setupDone[key] ? ' checked' : '') + (readOnly ? ' disabled' : '') + '><span>' + esc(k[1]) + '</span></label>';
  }).join('');
  $('#kitCount').textContent = have + ' / ' + KIT.length;
}


$$('.seg-btn').forEach(function(b){ b.addEventListener('click', function(){ Q.kind = b.dataset.kind; syncVisibility(); lsSet('bc-quote', Q); renderResult(); stepsDirty = true; }); });
var qCard = $('#tab-quote');
qCard.addEventListener('input', function(e){ if (e.target.closest('.card') && e.target.id !== 'quoteText') onQuoteChange(); });
qCard.addEventListener('change', function(e){ if (e.target.closest('.card') && e.target.id !== 'quoteText') onQuoteChange(); });
$$('.step').forEach(function(b){
  b.addEventListener('click', function(){
    var inp = $('#' + b.dataset.step), v = (parseInt(inp.value, 10) || 0) + (+b.dataset.d);
    var min = +inp.min || 0, max = +inp.max || 99; inp.value = Math.min(max, Math.max(min, v)); onQuoteChange();
  });
});
$('#stripGo').addEventListener('click', function(){ $('#result').scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'}); });
$$('.tab-btn').forEach(function(b){ b.addEventListener('click', function(){ showTab(b.dataset.tab); }); });

/* leads */
$('#addLeadBtn').addEventListener('click', function(){ openLeadForm(null); });
$('#leadCancel').addEventListener('click', closeLeadForm);
$('#leadForm').addEventListener('submit', function(e){
  e.preventDefault();
  if (readOnly) return;
  var obj = {
    name: $('#l-name').value.trim(), type: $('#l-type').value, contact: $('#l-contact').value.trim(), reach: $('#l-reach').value.trim(), email: $('#l-email').value.trim(),
    area: $('#l-area').value.trim(), status: $('#l-status').value, next: $('#l-next').value.trim(), nextDate: $('#l-date').value,
    value: Math.max(0, parseInt($('#l-value').value, 10) || 0), notes: $('#l-notes').value.trim()
  };
  if (!obj.name){ $('#leadMsg').style.color = 'var(--bad)'; $('#leadMsg').textContent = 'Add a business or person name.'; $('#l-name').focus(); return; }
  if (obj.email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(obj.email)){ $('#leadMsg').style.color = 'var(--bad)'; $('#leadMsg').textContent = 'That email doesn\'t look right. Check it or leave it empty.'; $('#l-email').focus(); return; }
  var old = editingId ? findLead(editingId) : null;
  /* A lead nobody has contacted yet picks its plan from whether it has an email. */
  if (obj.status === 'new' && (!old || !touchesOf(old).length)){
    var fresh = Object.assign({}, old || {}, obj, {plan: null, step: 0});
    var nf = nextFields(fresh, 0);
    obj.plan = null; obj.step = 0;
    if (!obj.next || (old && obj.next === old.next)) obj.next = nf.next;
    if (!obj.nextDate) obj.nextDate = nf.nextDate;
  }
  $('#leadSave').disabled = true;
  var p = editingId ? updateLead(editingId, obj) : addLead(obj);
  p.then(function(){ closeLeadForm(); }, function(){}).then(function(){ $('#leadSave').disabled = false; });
});
$('#dueBtn').addEventListener('click', function(){ leadFilter = leadFilter === 'due' ? '' : 'due'; panel = null; renderLeads(); });
$('#toEmailBtn').addEventListener('click', function(){ leadFilter = leadFilter === 'toemail' ? '' : 'toemail'; panel = null; renderLeads(); });
$('#pipe').addEventListener('click', function(e){
  var b = e.target.closest('button[data-filter]'); if (!b) return;
  leadFilter = leadFilter === b.dataset.filter ? '' : b.dataset.filter; panel = null; renderLeads();
});
$('#leadList').addEventListener('input', function(e){
  var t = e.target;
  if (t.dataset.mailbody && panel) drafts[t.dataset.mailbody + ':' + panel.tpl] = t.value;
  if (t.dataset.lognote) drafts[t.dataset.lognote + ':note'] = t.value;
  if (t.dataset.logdate) drafts[t.dataset.logdate + ':date'] = t.value;
});
$('#leadList').addEventListener('change', function(e){
  var t = e.target;
  if (t.dataset.logdate){ drafts[t.dataset.logdate + ':date'] = t.value; return; }
  var id = t.dataset.status; if (!id) return;
  var l = findLead(id); if (!l) return;
  var patch = {status: t.value};
  if (t.value === 'won' || t.value === 'lost'){ patch.next = ''; patch.nextDate = ''; }
  if ((t.value === 'new' || t.value === 'contacted') && !l.nextDate){ var nf = nextFields(l, stepIdx(l)); patch.next = nf.next; patch.nextDate = nf.nextDate; }
  logUpdate(l, {t:'note', n:'Stage changed to ' + STATUS_LABEL[t.value]}, patch).catch(function(){});
});

function copyFrom(btn, val, box, msgEl){
  var label = btn.textContent;
  var fail = function(){ if (box){ box.focus(); box.select(); } if (msgEl) msgEl.textContent = 'Copy didn\'t work here. The text is selected: copy it by hand.'; };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText){
      return navigator.clipboard.writeText(val).then(function(){ btn.textContent = 'Copied'; setTimeout(function(){ btn.textContent = label; }, 1800); return true; }, function(){ fail(); return false; });
    }
  } catch(err){}
  fail(); return Promise.resolve(false);
}

$('#leadList').addEventListener('click', function(e){
  /* The Yahoo link: copy the message first, then let the link open Yahoo. */
  var a = e.target.closest('a[data-yahoo]');
  if (a){
    var box = $('textarea[data-mailbody="' + a.dataset.yahoo + '"]'), msg = $('[data-mailmsg="' + a.dataset.yahoo + '"]');
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(box.value).then(function(){ if (msg) msg.textContent = 'Message copied. Paste it into the Yahoo email, send it, then tap “I sent it”.'; }, function(){ box.focus(); box.select(); if (msg) msg.textContent = 'Couldn\'t copy automatically. The message is selected: copy it, then paste it in Yahoo.'; }); } catch(err){}
    return;
  }
  var t = e.target.closest('button'); if (!t) return;
  var id = t.dataset.id, l = id ? findLead(id) : null;

  if (t.dataset.act === 'mail' && l){
    panel = (panel && panel.id === l.id && panel.kind === 'mail') ? null : {id:l.id, kind:'mail', tpl:t.dataset.tpl};
    renderLeads(); return;
  }
  if (t.dataset.act === 'log' && l){
    panel = (panel && panel.id === l.id && panel.kind === 'log') ? null : {id:l.id, kind:'log', type:t.dataset.type || 'call'};
    renderLeads(); return;
  }
  if (t.dataset.act === 'quote' && l){ quoteForLead(l); return; }
  if (t.dataset.logtype && panel){ panel.type = t.dataset.logtype; renderLeads(); return; }

  if (t.dataset.out && l){
    var out = t.dataset.out, type = t.dataset.type;
    var dateEl = $('input[data-logdate="' + l.id + '"]'), noteEl = $('input[data-lognote="' + l.id + '"]'), msgEl = $('[data-logmsg="' + l.id + '"]');
    var date = dateEl ? dateEl.value : '', note = noteEl ? noteEl.value.trim() : '';
    if ((out === 'later' || out === 'walk') && (!date || date < todayISO())){
      if (msgEl){ msgEl.style.color = 'var(--bad)'; msgEl.textContent = out === 'walk' ? 'Pick the walkthrough date first.' : 'Pick a date to follow up first.'; }
      if (dateEl) dateEl.focus();
      return;
    }
    $$('button[data-out]').forEach(function(b){ b.disabled = true; });
    applyOutcome(l, type, out, date, note).then(function(){
      delete drafts[l.id + ':note']; delete drafts[l.id + ':date']; panel = null; renderLeads();
    }, function(){ $$('button[data-out]').forEach(function(b){ b.disabled = false; }); });
    return;
  }

  if (t.dataset.edit && l){ openLeadForm(l); $('#leadForm').scrollIntoView({block:'start'}); return; }
  if (t.dataset.copy){
    var lc = findLead(t.dataset.copy); if (lc) copyFrom(t, lc.reach, null, null);
    return;
  }
  if (t.dataset.copyf && l){
    var tpl = panel && panel.id === l.id ? panel.tpl : 'intro';
    var m = emailFor(l, tpl), bx = $('textarea[data-mailbody="' + l.id + '"]'), mm = $('[data-mailmsg="' + l.id + '"]');
    var val = t.dataset.copyf === 'body' ? (bx ? bx.value : m.body) : m[t.dataset.copyf];
    copyFrom(t, val, t.dataset.copyf === 'body' ? bx : null, mm);
    return;
  }
  if (t.dataset.sent){
    var ls = findLead(t.dataset.sent), tp = t.dataset.tpl; if (!ls) return;
    if (sentTpl(ls, tp)){ panel = null; renderLeads(); return; }   /* never log the same email twice */
    t.disabled = true;
    var subj = emailFor(ls, tp).subject;
    var patch = nextFields(ls, stepIdx(ls) + 1);
    if (ls.status === 'new') patch.status = 'contacted';
    if (tp === 'intro') patch.emailedAt = todayISO();
    logUpdate(ls, {t:'email', k:tp, s:subj}, patch).then(function(){
      delete drafts[ls.id + ':' + tp]; panel = null; renderLeads();
    }, function(){ t.disabled = false; });
    return;
  }
  if (t.dataset.del){
    if (pendingDelete === t.dataset.del){ pendingDelete = null; deleteLead(t.dataset.del); }
    else { pendingDelete = t.dataset.del; renderLeads(); setTimeout(function(){ if (pendingDelete){ pendingDelete = null; renderLeads(); } }, 4000); }
  }
});
$('#quoteFor').addEventListener('click', function(e){
  if (e.target.id === 'unlinkLead'){ Q.leadId = ''; lsSet('bc-quote', Q); renderQuoteFor(); renderResult(); }
});


/* setup */
$('#tab-start').addEventListener('change', function(e){
  var k = e.target.dataset.setup;
  if (k){ setSetup(k, e.target.checked); return; }
  readMe(e);
});
$('#tab-start').addEventListener('input', readMe);

/* login */
$$('[data-auth]').forEach(function(b){ b.addEventListener('click', function(){ showAuth(b.dataset.auth); }); });
$('#signinForm').addEventListener('submit', doSignIn);
$('#signupForm').addEventListener('submit', doSignUp);
$('#forgotForm').addEventListener('submit', doForgot);
$('#newPassForm').addEventListener('submit', doNewPass);
$('#signOutBtn').addEventListener('click', signOut);
$('#blockedSignOut').addEventListener('click', signOut);

/* jobs (admin list + worker list) */
function jobListClick(e){
  var b = e.target.closest('button'); if (!b) return;
  if (b.dataset.openjob){ openJob(b.dataset.openjob); return; }
  if (b.dataset.editjob){ openEditJob(b.dataset.editjob); return; }
  if (b.dataset.deljob){
    if (pendingJobDelete === b.dataset.deljob){ b.disabled = true; deleteJob(b.dataset.deljob); return; }
    pendingJobDelete = b.dataset.deljob; renderJobsAdmin();
    setTimeout(function(){ if (pendingJobDelete){ pendingJobDelete = ''; renderJobsAdmin(); } }, 4000);
  }
}
$('#jobList').addEventListener('click', jobListClick);
$('#myJobsList').addEventListener('click', jobListClick);
$('#jobFilters').addEventListener('click', function(e){ var b = e.target.closest('button[data-jf]'); if (!b) return; jobFilter = b.dataset.jf; renderJobsAdmin(); });
$('#newJobBtn').addEventListener('click', function(){ openNewJob(); });
$('#jf-cancel').addEventListener('click', closeJobForm);
$('#jobForm').addEventListener('submit', saveJob);

/* one job */
$('#jobBack').addEventListener('click', closeJob);
$('#jobHead').addEventListener('click', function(e){
  var b = e.target.closest('button'); if (!b) return;
  if (b.id === 'startJobBtn') startJob();
  if (b.id === 'finishJobBtn') finishJob();
});
$('#sections').addEventListener('change', function(e){
  var k = e.target.dataset.tick; if (!k) return;
  if (e.target.checked) ticks[k] = 1; else delete ticks[k];
  lsSet(STEP_KEY, ticks); updateProgress();
});
$('#sections').addEventListener('click', function(e){
  var b = e.target.closest('button'); if (!b) return;
  var j = findJob(currentJobId); if (!j) return;
  var room = (j.rooms || []).filter(function(r){ return r.id === b.dataset.sec; })[0];
  if (b.dataset.view){ openLightbox(b.dataset.view, (room ? room.title : '') + ' · ' + KIND_LABEL[b.dataset.kind], canShoot(j) ? {jobId:j.id, sec:b.dataset.sec, kind:b.dataset.kind} : null); return; }
  if (b.dataset.shot && canShoot(j)) openCamera({jobId:j.id, sec:b.dataset.sec, kind:b.dataset.shot});
});
$('#camInput').addEventListener('change', function(e){ takeShot(e.target.files && e.target.files[0]); });
$('#split').addEventListener('change', function(){ renderJobScreen(false); });
$('#copySteps').addEventListener('click', function(){ copyText(stepsText(), $('#stepsText'), $('#stepsMsg'), 'Checklist copied.'); });
$('#lbClose').addEventListener('click', closeLightbox);
$('#lbRetake').addEventListener('click', function(){ var s = lbShot; closeLightbox(); if (s) openCamera(s); });
$('#lightbox').addEventListener('click', function(e){ if (e.target.id === 'lightbox') closeLightbox(); });
document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !$('#lightbox').hidden) closeLightbox(); });

/* team */
$('#inviteForm').addEventListener('submit', doInvite);
$('#iv-copy').addEventListener('click', function(){ copyText($('#iv-text').value, $('#iv-text'), $('#iv-msg'), 'Copied. Paste it in a text or email to them.'); });
$('#teamList').addEventListener('click', function(e){
  var b = e.target.closest('button'); if (!b) return;
  var p = team.filter(function(x){ return x.id === (b.dataset.toggle || b.dataset.role); })[0]; if (!p || p.id === USER.id) return;
  b.disabled = true;
  if (b.dataset.toggle) updatePerson(p.id, {active: !p.active});
  if (b.dataset.role) updatePerson(p.id, {role: p.role === 'admin' ? 'worker' : 'admin'});
});
$('#inviteList').addEventListener('click', function(e){
  var b = e.target.closest('button[data-uninvite]'); if (!b) return;
  b.disabled = true;
  q(SB.from('invites').delete().eq('email', b.dataset.uninvite)).then(function(){ return loadInvites(); }).then(renderTeam, onWriteError);
});

/* coming back to the app refreshes it */
document.addEventListener('visibilitychange', function(){ if (!document.hidden && USER && PROFILE) refreshAll(); });

/* =========================================================
   START
   ========================================================= */
fillForm(); syncVisibility(); renderResult();
$('#l-status').innerHTML = STATUSES.map(function(s){ return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('');
if (!configured()){ showOnly('configScreen'); }
else {
  SB = window.supabase.createClient(CFG.url, CFG.key, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}});
  SB.auth.onAuthStateChange(function(evt, session){
    /* never call other Supabase functions directly inside this callback */
    setTimeout(function(){
      if (evt === 'PASSWORD_RECOVERY'){ recovering = true; USER = session && session.user; showAuth('newpass'); return; }
      if (evt === 'SIGNED_OUT'){ endSession(); return; }
      if (recovering) return;
      if (session && session.user){ if (evt === 'INITIAL_SESSION' || evt === 'SIGNED_IN' || evt === 'USER_UPDATED') startSession(session.user); }
      else if (evt === 'INITIAL_SESSION'){ showAuth('signin'); }
    }, 0);
  });
}
if ('serviceWorker' in navigator && location.protocol === 'https:'){
  window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
}

})();

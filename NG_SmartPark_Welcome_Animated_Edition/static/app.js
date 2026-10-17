const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = value => new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value || 0));
const icons = {Car:'🚘',Bike:'🏍️',Auto:'🛺',Van:'🚐',Other:'🚗'};
let currentView = 'dashboard';
let currentTab = 'slots';
let latestState = {dashboard:null, slots:[], vehicles:[], history:[]};
let isAnimatingVehicle = false;
let simulationDemoRunning = false;
const vehicleGlyphs = {Car:'🚘',Bike:'🏍️',Auto:'🛺',Van:'🚐',Other:'🚗'};

function displayTime(raw) {
  if (!raw) return '—';
  const dt = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'});
}
function displayDateTime(raw) {
  if (!raw) return '—';
  const dt = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function api(url, options = {}) {
  const response = await fetch(url, {headers:{'Content-Type':'application/json'}, ...options});
  let payload;
  try { payload = await response.json(); } catch { payload = {error:'The server returned an unexpected response.'}; }
  if (!response.ok) throw new Error(payload.error || 'Something went wrong. Please try again.');
  return payload;
}
function toast(message, type='success') {
  const node = document.createElement('div');
  node.className = `toast ${type === 'error' ? 'error' : ''}`;
  node.innerHTML = `<span class="toast-icon">${type === 'error' ? '!' : '✓'}</span><span>${escapeHTML(message)}</span>`;
  $('#toast-region').appendChild(node);
  window.setTimeout(() => { node.style.opacity='0'; node.style.transform='translateX(15px)'; setTimeout(()=>node.remove(),250); }, 3600);
}
function openModal({title='All set!', message='', symbol='✓', eyebrow='PARKING UPDATE', details=[]}) {
  $('#modal-title').textContent = title;
  $('#modal-message').textContent = message;
  $('#modal-symbol').textContent = symbol;
  $('#modal-eyebrow').textContent = eyebrow;
  $('#modal-details').innerHTML = details.map(d=>`<div class="detail-box"><small>${escapeHTML(d.label)}</small><strong>${escapeHTML(d.value)}</strong></div>`).join('');
  $('#modal-backdrop').hidden = false;
  $('#modal-done').focus();
}
function closeModal() { $('#modal-backdrop').hidden = true; }
function renderStats(data) {
  $('#parked-count').textContent = data.vehicles_parked;
  $('#available-count').textContent = data.slots_available;
  $('#total-slots').textContent = data.total_slots;
  $('#fees-collected').textContent = money(data.fees_collected);
  $('#entries-today').textContent = data.entries_today ?? 0;
  $('#hourly-rate').textContent = money(data.hourly_rate).replace('.00','');
  const pct = data.total_slots ? (data.slots_available / data.total_slots) * 100 : 0;
  $('#availability-bar').style.width = `${pct}%`;
  $('.stat-green .mini-bar i').style.width = `${data.total_slots ? (data.vehicles_parked / data.total_slots) * 100 : 0}%`;
}
function renderSimulator(slots, force=false) {
  const grid = $('#sim-bays-grid');
  if (!grid || ((!force) && (isAnimatingVehicle || simulationDemoRunning))) return;
  const occupiedCount = slots.filter(s => s.status === 'OCCUPIED').length;
  const availableCount = Math.max(0, slots.length - occupiedCount);
  $('#sim-active-count').textContent = occupiedCount;
  $('#sim-free-count').textContent = availableCount;
  grid.innerHTML = slots.map((slot, i) => {
    const occupied = slot.status === 'OCCUPIED';
    const vehicleGlyph = vehicleGlyphs[slot.vehicle_type] || '🚗';
    return `<div class="sim-bay ${occupied ? 'is-occupied' : ''}" id="sim-bay-${slot.slot_no}" data-slot-no="${slot.slot_no}" data-status="${occupied ? 'OCCUPIED' : 'AVAILABLE'}" style="--slot-index:${i}" aria-label="Slot ${slot.slot_no}: ${occupied ? 'occupied by ' + escapeHTML(slot.vehicle) : 'available'}">
      <div class="sim-bay-top"><span>ZONE A-${String(slot.slot_no).padStart(2,'0')}</span><i class="sim-sensor-led"></i></div>
      <div class="sim-parked-car ${occupied ? 'has-car' : 'empty'}" data-car-slot="${slot.slot_no}">${occupied ? vehicleGlyph : 'P'}</div>
      <div class="sim-bay-bottom"><strong>${occupied ? '● OCCUPIED' : '● AVAILABLE'}</strong><small>${occupied ? escapeHTML(slot.vehicle) : 'Sensor ready'}</small></div>
    </div>`;
  }).join('');
  const eventTitle = $('#sim-event-title');
  const eventCopy = $('#sim-event-copy');
  if (!isAnimatingVehicle && !simulationDemoRunning && eventTitle && eventCopy) {
    eventTitle.textContent = occupiedCount ? `${occupiedCount} vehicle${occupiedCount === 1 ? '' : 's'} detected inside` : 'Sensor network online';
    eventCopy.textContent = `${availableCount} bay${availableCount === 1 ? '' : 's'} available · ${occupiedCount} occupied · Live local demo`;
  }
}
function centerInWorld(element, worldRect) {
  const r = element.getBoundingClientRect();
  return {x:r.left + r.width/2 - worldRect.left, y:r.top + r.height/2 - worldRect.top};
}
function sleep(ms) { return new Promise(resolve => window.setTimeout(resolve, ms)); }
async function animateVehicleMovement(direction, slotNo, vehicleType='Car', vehicleNumber='DEMO CAR') {
  const world = $('#sim-world');
  const bay = $(`#sim-bay-${slotNo}`);
  const targetCar = $(`[data-car-slot="${slotNo}"]`);
  const gate = direction === 'in' ? $('#sim-entry') : $('#sim-exit');
  if (!world || !bay || !targetCar || !gate) return;
  const worldRect = world.getBoundingClientRect();
  const bayPoint = centerInWorld(targetCar, worldRect);
  const gatePoint = centerInWorld(gate, worldRect);
  const from = direction === 'in' ? gatePoint : bayPoint;
  const to = direction === 'in' ? bayPoint : gatePoint;
  const numberShort = String(vehicleNumber || 'DEMO CAR').slice(0, 12);
  const sprite = document.createElement('div');
  sprite.className = `sim-moving-vehicle ${direction === 'out' ? 'leaving' : 'arriving'}`;
  sprite.innerHTML = `<span>${vehicleGlyphs[vehicleType] || '🚘'}</span><small>${escapeHTML(numberShort)}</small>`;
  sprite.style.left = `${from.x}px`;
  sprite.style.top = `${from.y}px`;
  $('#sim-motion-layer').appendChild(sprite);
  const entering = direction === 'in';
  $('#sim-event-title').textContent = entering ? `Vehicle ${numberShort} entering` : `Vehicle ${numberShort} leaving`;
  $('#sim-event-copy').textContent = entering ? `Driving toward assigned Slot ${String(slotNo).padStart(2,'0')}` : `Exiting from Slot ${String(slotNo).padStart(2,'0')} · Sensor resetting`;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  isAnimatingVehicle = true;
  try {
    if (!reduceMotion && typeof sprite.animate === 'function') {
      const dx = to.x - from.x, dy = to.y - from.y;
      const p1 = {x:from.x + dx*0.24, y:from.y + dy*0.12 - 13};
      const p2 = {x:from.x + dx*0.72, y:from.y + dy*0.78 - 4};
      const animation = sprite.animate([
        {left:`${from.x}px`,top:`${from.y}px`,opacity:0,transform:'translate(-50%,-50%) scale(.55) rotate(-12deg)',filter:'blur(1px)'},
        {left:`${from.x + dx*.08}px`,top:`${from.y + dy*.08}px`,opacity:1,transform:'translate(-50%,-50%) scale(.82) rotate(-7deg)',filter:'blur(0)',offset:.13},
        {left:`${p1.x}px`,top:`${p1.y}px`,opacity:1,transform:'translate(-50%,-50%) scale(.94) rotate(-3deg)',offset:.30},
        {left:`${p2.x}px`,top:`${p2.y}px`,opacity:1,transform:'translate(-50%,-50%) scale(1) rotate(3deg)',offset:.72},
        {left:`${to.x}px`,top:`${to.y}px`,opacity:direction==='in'?0.25:0,transform:'translate(-50%,-50%) scale(.72) rotate(0deg)',filter:'blur(.3px)'}
      ], {duration:1450, easing:'cubic-bezier(.22,.78,.22,1)', fill:'forwards'});
      await animation.finished.catch(()=>{});
    } else {
      await sleep(160);
    }
    if (entering) {
      const destination = $(`#sim-bay-${slotNo}`);
      if (destination) { destination.classList.add('sim-arrival-flash'); window.setTimeout(()=>destination.classList.remove('sim-arrival-flash'),950); }
    } else {
      const leavingBay = $(`#sim-bay-${slotNo}`);
      if (leavingBay) { leavingBay.classList.add('sim-exit-flash'); window.setTimeout(()=>leavingBay.classList.remove('sim-exit-flash'),950); }
    }
  } finally {
    sprite.remove();
    isAnimatingVehicle = false;
  }
}
async function playMovementDemo() {
  const button = $('#sim-demo-button');
  const slot = latestState.slots.find(s => s.status !== 'OCCUPIED');
  if (!slot) { toast('The parking lot is full. Free a slot before replaying the movement demo.', 'error'); return; }
  if (simulationDemoRunning || isAnimatingVehicle) return;
  simulationDemoRunning = true;
  button.disabled = true;
  const realSlots = latestState.slots.map(s => ({...s}));
  try {
    $('#sim-event-title').textContent = 'Showcase car approaching';
    $('#sim-event-copy').textContent = `A sample car will use Slot ${String(slot.slot_no).padStart(2,'0')} — demo only`;
    await animateVehicleMovement('in', slot.slot_no, 'Car', 'DEMO CAR');
    const demoSlots = realSlots.map(s => String(s.slot_no) === String(slot.slot_no) ? {...s, status:'OCCUPIED', vehicle:'DEMO CAR', vehicle_type:'Car'} : s);
    renderSimulator(demoSlots, true);
    $('#sim-event-title').textContent = `Demo car parked in Slot ${String(slot.slot_no).padStart(2,'0')}`;
    $('#sim-event-copy').textContent = 'Sensor changed green → red · Showing a temporary demo state';
    await sleep(800);
    await animateVehicleMovement('out', slot.slot_no, 'Car', 'DEMO CAR');
    $('#sim-event-title').textContent = 'Demo vehicle has exited';
    $('#sim-event-copy').textContent = 'Sensor changed red → green · No fake transaction was saved';
    await sleep(300);
  } catch (err) {
    toast('The sample animation could not finish. Please try again.', 'error');
  } finally {
    simulationDemoRunning = false;
    renderSimulator(latestState.slots, true);
    button.disabled = false;
  }
}

function renderSlots(slots) {
  $('#slot-grid').innerHTML = slots.map((slot,i)=>{
    const occupied = slot.status === 'OCCUPIED';
    return `<button class="slot-card ${occupied?'occupied':''}" type="button" style="--i:${i}" data-slot="${slot.slot_no}" aria-label="Slot ${slot.slot_no}, ${occupied?'occupied by '+slot.vehicle:'available'}">
      <span class="slot-number">${String(slot.slot_no).padStart(2,'0')}</span>
      <span class="slot-state-icon">${occupied ? (icons[slot.vehicle_type] || '🚗') : '🚘'}</span>
      <span class="slot-tag">${occupied?'OCCUPIED':'AVAILABLE'}</span>
      <span class="slot-vehicle">${occupied?escapeHTML(slot.vehicle):'Ready for you'}</span>
    </button>`;
  }).join('');
  $$('.slot-card').forEach(card=>card.addEventListener('click',()=>{
    const slot = latestState.slots.find(s=>String(s.slot_no)===card.dataset.slot);
    if (slot?.status === 'OCCUPIED') toast(`Slot ${slot.slot_no} is occupied by ${slot.vehicle}.`, 'error');
    else toast(`Slot ${slot.slot_no} is available for the next vehicle.`);
  }));
  renderSimulator(slots);
}
function renderCurrent(vehicles) {
  $('#current-count-chip').textContent = `${vehicles.length} vehicle${vehicles.length===1?'':'s'}`;
  $('#current-table').innerHTML = vehicles.length ? vehicles.map(v=>`<tr>
    <td class="table-vehicle">${escapeHTML(v.vehicle_number)}</td><td>${icons[v.vehicle_type]||'🚗'} ${escapeHTML(v.vehicle_type)}</td>
    <td><b>Slot ${v.slot_no}</b></td><td>${escapeHTML(displayDateTime(v.entry_time))}</td><td><span class="status-pill status-parked">PARKED</span></td>
  </tr>`).join('') : '<tr><td colspan="5" class="empty-cell">No vehicles parked right now. The parking lot is ready for arrivals.</td></tr>';
}
function renderHistory(history) {
  $('#history-table').innerHTML = history.length ? history.map(r=>`<tr>
    <td class="table-vehicle">${escapeHTML(r.vehicle_number)}</td><td>${icons[r.vehicle_type]||'🚗'} ${escapeHTML(r.vehicle_type)}</td>
    <td>Slot ${r.slot_no}</td><td>${escapeHTML(displayTime(r.entry_time))}</td><td>${escapeHTML(displayTime(r.exit_time))}</td>
    <td class="fee-cell">${r.status==='EXITED'?money(r.fee):'—'}</td><td><span class="status-pill ${r.status==='PARKED'?'status-parked':'status-exited'}">${escapeHTML(r.status)}</span></td>
  </tr>`).join('') : '<tr><td colspan="7" class="empty-cell">No records yet. Park a demo vehicle to begin.</td></tr>';
}
function renderActivity(items) {
  const list = $('#activity-list');
  if (!items.length) {
    list.innerHTML = '<div class="activity-empty"><span>🚗</span><p>Your parking activity will appear here.</p></div>';
    return;
  }
  list.innerHTML = items.map(item=>{
    const exited = item.status === 'EXITED';
    const subtitle = exited ? `Checked out · Fee ${money(item.fee)}` : `Parked · Slot ${item.slot_no}`;
    const timestamp = exited ? item.exit_time : item.entry_time;
    return `<div class="activity-row"><span class="activity-symbol ${exited?'checkout':''}">${exited?'↗':(icons[item.vehicle_type]||'🚗')}</span>
      <span class="activity-text"><strong>${escapeHTML(item.vehicle_number)}</strong><small>${escapeHTML(subtitle)}</small></span>
      <span class="activity-meta">${escapeHTML(displayTime(timestamp))}<small>${exited?'Checkout':'Arrival'}</small></span></div>`;
  }).join('');
}
async function refreshAll(showToast=false) {
  try {
    const [dashboard, slots, vehicles, history] = await Promise.all([
      api('/api/dashboard'), api('/api/slots'), api('/api/vehicles'), api('/api/history')
    ]);
    latestState = {dashboard, slots, vehicles, history};
    renderStats(dashboard); renderSlots(slots); renderCurrent(vehicles); renderHistory(history); renderActivity(dashboard.recent_activity || []);
    if (showToast) toast('Parking details refreshed.');
  } catch (err) {
    toast(`${err.message} Check that the Python server window is still running.`, 'error');
  }
}
$('#park-form').addEventListener('submit', async event=>{
  event.preventDefault();
  const input = $('#vehicle-number');
  const vehicleNumber = input.value.trim().toUpperCase();
  const vehicleType = $('#vehicle-type').value;
  if (!vehicleNumber) return input.focus();
  const button = event.submitter || $('.park-btn');
  button.disabled = true; button.style.opacity = '.7';
  try {
    const result = await api('/api/park', {method:'POST', body:JSON.stringify({vehicle_number:vehicleNumber, vehicle_type:vehicleType})});
    input.value = '';
    await animateVehicleMovement('in', result.slot_no, result.vehicle_type, result.vehicle_number);
    await refreshAll();
    openModal({title:'Vehicle parked!',message:`${result.vehicle_number} has been checked in successfully. The new parking slot is reserved.`,symbol:'✓',eyebrow:'ARRIVAL CONFIRMED',details:[{label:'Vehicle number',value:result.vehicle_number},{label:'Assigned slot',value:`Slot ${result.slot_no}`},{label:'Vehicle type',value:result.vehicle_type},{label:'Entry time',value:displayTime(result.entry_time)}]});
  } catch (err) { toast(err.message, 'error'); }
  finally { button.disabled=false; button.style.opacity=''; }
});
$('#checkout-form').addEventListener('submit', async event=>{
  event.preventDefault();
  const input = $('#checkout-number');
  const vehicleNumber = input.value.trim().toUpperCase();
  if (!vehicleNumber) return input.focus();
  const button = event.submitter || $('.btn-orange');
  button.disabled = true; button.style.opacity = '.7';
  try {
    const result = await api('/api/checkout', {method:'POST', body:JSON.stringify({vehicle_number:vehicleNumber})});
    input.value = '';
    await animateVehicleMovement('out', result.slot_no, result.vehicle_type, result.vehicle_number);
    await refreshAll();
    openModal({title:'Checkout complete!',message:`${result.vehicle_number} has left the parking lot. Slot ${result.slot_no} is available again.`,symbol:'₹',eyebrow:'PAYMENT SUMMARY',details:[{label:'Vehicle number',value:result.vehicle_number},{label:'Slot released',value:`Slot ${result.slot_no}`},{label:'Billed duration',value:`${result.duration_hours} hour(s)`},{label:'Parking fee',value:money(result.fee)}]});
  } catch (err) { toast(err.message, 'error'); }
  finally { button.disabled=false; button.style.opacity=''; }
});
$('#refresh-button').addEventListener('click',()=>refreshAll(true));
$('#sim-demo-button').addEventListener('click', playMovementDemo);
$('#modal-close').addEventListener('click',closeModal);
$('#modal-done').addEventListener('click',closeModal);
$('#modal-backdrop').addEventListener('click',event=>{if(event.target.id==='modal-backdrop')closeModal();});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();});
function selectTab(tab) {
  currentTab = tab;
  $$('.tab-button').forEach(btn=>{
    const active = btn.dataset.tab===tab;
    btn.classList.toggle('active',active); btn.setAttribute('aria-selected',String(active));
  });
  $$('.tab-pane').forEach(pane=>{
    const active = pane.id===`tab-${tab}`;
    pane.hidden = !active; pane.classList.toggle('active',active);
  });
}
$$('.tab-button').forEach(btn=>btn.addEventListener('click',()=>selectTab(btn.dataset.tab)));
function chooseView(view) {
  currentView = view;
  $$('.nav-link').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===view));
  if (view==='park') { $('#park-section').scrollIntoView({behavior:'smooth',block:'center'}); $('#vehicle-number').focus({preventScroll:true}); }
  else if (view==='slots') { selectTab('slots'); $('#parking-content').scrollIntoView({behavior:'smooth',block:'center'}); }
  else if (view==='history') { selectTab('history'); $('#parking-content').scrollIntoView({behavior:'smooth',block:'center'}); }
  else { selectTab('slots'); window.scrollTo({top:0,behavior:'smooth'}); }
}
$$('[data-view]').forEach(btn=>btn.addEventListener('click',()=>chooseView(btn.dataset.view)));
$$('[data-jump]').forEach(btn=>btn.addEventListener('click',()=>chooseView(btn.dataset.jump)));
function updateClock() {
  const now = new Date();
  $('#date-label').textContent = now.toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})+' · '+now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
}
updateClock(); setInterval(updateClock,30000); refreshAll();
setInterval(()=>refreshAll(false),15000);


// Showcase Mode: a presentation-friendly visual boost with extra neon glow.
const showcaseToggle = $('#showcase-toggle');
function setShowcaseMode(enabled, announce=false) {
  document.body.classList.toggle('showcase-mode', enabled);
  if (showcaseToggle) {
    showcaseToggle.setAttribute('aria-pressed', String(enabled));
    const label = showcaseToggle.querySelector('.toggle-copy');
    if (label) label.textContent = enabled ? 'SHOWCASE ON' : 'SHOWCASE MODE';
  }
  try { localStorage.setItem('ng-smartpark-showcase', enabled ? '1' : '0'); } catch (_) {}
  if (announce) toast(enabled ? 'Showcase Mode is on — the dashboard is glowing!' : 'Showcase Mode is off.');
}
if (showcaseToggle) {
  let savedShowcase = false;
  try { savedShowcase = localStorage.getItem('ng-smartpark-showcase') === '1'; } catch (_) {}
  setShowcaseMode(savedShowcase, false);
  showcaseToggle.addEventListener('click', () => setShowcaseMode(!document.body.classList.contains('showcase-mode'), true));
}

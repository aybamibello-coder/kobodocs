const FUNCTIONS_URL = 'https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1';
const token = new URLSearchParams(window.location.search).get('t');
const TYPE_LABELS = { wedding: 'Wedding', naming: 'Naming Ceremony', funeral: 'Funeral / Memorial', custom: 'Event' };

let selectedStatus = null;

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function renderError(message) {
  document.getElementById('rsvpCard').innerHTML = `
    <div class="rsvp-logo">KoboDocs</div>
    <div class="rsvp-error">${message}</div>
  `;
}

function renderForm(event) {
  const savedGuestId = localStorage.getItem('kobo_rsvp_guest_' + token);
  document.getElementById('rsvpCard').innerHTML = `
    <div class="rsvp-logo">KoboDocs</div>
    <div class="rsvp-type">${TYPE_LABELS[event.event_type] || 'Event'}</div>
    <div class="rsvp-title">${event.event_name}</div>
    ${event.event_date ? `<div class="rsvp-meta">${fmtDate(event.event_date)}</div>` : ''}
    ${event.invite_venue ? `<div class="rsvp-meta">${event.invite_venue}</div>` : ''}
    ${event.invite_message ? `<div class="rsvp-message">${event.invite_message}</div>` : ''}

    <div class="rsvp-form">
      <label for="guestName">Your name</label>
      <input type="text" id="guestName" placeholder="Full name">

      <label for="guestPhone">Phone number (optional)</label>
      <input type="text" id="guestPhone" placeholder="For updates about the event">

      <label>Will you be attending?</label>
      <div class="rsvp-choices">
        <button type="button" class="choice-btn" data-status="attending">Attending</button>
        <button type="button" class="choice-btn" data-status="not_attending">Can't make it</button>
      </div>

      <div class="rsvp-plusones" id="plusOnesWrap">
        <label for="plusOnes">Bringing anyone with you?</label>
        <select id="plusOnes">
          <option value="0">Just me</option>
          <option value="1">+1 guest</option>
          <option value="2">+2 guests</option>
          <option value="3">+3 guests</option>
          <option value="4">+4 guests</option>
        </select>
      </div>

      <button class="rsvp-submit" id="submitRsvpBtn" disabled>Confirm RSVP</button>
      <div id="formMsg" class="error"></div>
    </div>
  `;

  document.querySelectorAll('.choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedStatus = btn.dataset.status;
      document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected', 'attending', 'not_attending'));
      btn.classList.add('selected', selectedStatus);
      document.getElementById('plusOnesWrap').classList.toggle('show', selectedStatus === 'attending');
      document.getElementById('submitRsvpBtn').disabled = false;
    });
  });

  document.getElementById('submitRsvpBtn').addEventListener('click', async () => {
    const name = document.getElementById('guestName').value.trim();
    const msgEl = document.getElementById('formMsg');
    if (!name) { msgEl.textContent = 'Please enter your name.'; msgEl.style.display = 'block'; return; }
    if (!selectedStatus) { msgEl.textContent = 'Please let us know if you can attend.'; msgEl.style.display = 'block'; return; }

    const btn = document.getElementById('submitRsvpBtn');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      const res = await fetch(`${FUNCTIONS_URL}/submit-rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          guest_id: savedGuestId,
          name,
          phone: document.getElementById('guestPhone').value.trim(),
          rsvp_status: selectedStatus,
          plus_ones: selectedStatus === 'attending' ? parseInt(document.getElementById('plusOnes').value, 10) : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not submit RSVP');

      localStorage.setItem('kobo_rsvp_guest_' + token, data.guest_id);

      document.getElementById('rsvpCard').innerHTML = `
        <div class="rsvp-logo">KoboDocs</div>
        <div class="rsvp-success">
          <h2>${selectedStatus === 'attending' ? "You're on the list! 🎉" : 'Thanks for letting us know'}</h2>
          <p style="opacity:0.75; font-size:0.9rem;">${selectedStatus === 'attending' ? `We can't wait to celebrate with you at ${event.event_name}.` : "We'll miss you, but thank you for responding."}</p>
        </div>
      `;
    } catch (err) {
      msgEl.textContent = err.message;
      msgEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Confirm RSVP';
    }
  });
}

(async () => {
  if (!token) {
    renderError("This invitation link looks incomplete. Please check the link and try again.");
    return;
  }
  try {
    const res = await fetch(`${FUNCTIONS_URL}/get-rsvp-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok || !data.event) {
      renderError("We couldn't find this invitation. It may have been removed, or the link may be incorrect.");
      return;
    }
    renderForm(data.event);
  } catch {
    renderError("Something went wrong loading this invitation. Please try again in a moment.");
  }
})();

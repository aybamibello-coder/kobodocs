import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://vwmzulzluaxedkozxjfy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4HDVb8ZzRh1W-Z97m2uT1Q_4FwH6bTt';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const token = new URLSearchParams(window.location.search).get('t');
const card = document.getElementById('card');

function render(title, desc, showButton) {
  card.innerHTML = `
    <div class="fill-title">${title}</div>
    <div class="fill-desc">${desc}</div>
    ${showButton ? `<button class="fill-submit" id="confirmCancelBtn">Yes, cancel my booking</button>` : ''}
  `;
  if (showButton) {
    document.getElementById('confirmCancelBtn').addEventListener('click', doCancel);
  }
}

async function doCancel() {
  const btn = document.getElementById('confirmCancelBtn');
  btn.disabled = true;
  btn.textContent = 'Cancelling…';
  const { data, error } = await supabase.rpc('cancel_booking', { p_cancel_token: token });
  if (error || !data || !data.success) {
    render('Could not cancel', (data && data.error) || 'Something went wrong. Please contact the business directly.', false);
    return;
  }
  render('Booking cancelled', 'Your appointment has been cancelled.', false);
}

if (!token) {
  render('Link incomplete', 'This cancellation link is missing information. Please use the link from your confirmation email or message.', false);
} else {
  render('Cancel this booking?', "This can't be undone. If you'd rather reschedule, contact the business directly.", true);
}

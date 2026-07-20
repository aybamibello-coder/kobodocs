const naira = (n) => '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');

document.getElementById('entityType').addEventListener('change', () => {
  const isCompany = document.getElementById('entityType').value === 'company';
  document.getElementById('companyFields').style.display = isCompany ? 'block' : 'none';
  document.getElementById('stampDutyRow').style.display = isCompany ? 'flex' : 'none';
  calc();
});

function calc() {
  const isCompany = document.getElementById('entityType').value === 'company';
  const useAgent = document.getElementById('useAgent').checked;

  let cacFeeLow, cacFeeHigh, reservation, stampDuty = 0, agentLow, agentHigh;

  if (!isCompany) {
    cacFeeLow = 10000;
    cacFeeHigh = 20000;
    reservation = 500;
    agentLow = useAgent ? 5000 : 0;
    agentHigh = useAgent ? 20000 : 0;
  } else {
    const shareCapital = parseFloat(document.getElementById('shareCapital').value) || 100000;
    // CAC fee: roughly ₦30,000 base, scaling for larger share capital
    cacFeeLow = 30000;
    cacFeeHigh = shareCapital > 1000000 ? 30000 + Math.ceil((shareCapital - 1000000) / 1000000) * 10000 : 30000;
    reservation = 500;
    stampDuty = shareCapital * 0.0075;
    agentLow = useAgent ? 20000 : 0;
    agentHigh = useAgent ? 60000 : 0;
  }

  const totalLow = cacFeeLow + reservation + stampDuty + agentLow;
  const totalHigh = cacFeeHigh + reservation + stampDuty + agentHigh;

  document.getElementById('rRange').textContent = `${naira(totalLow)} – ${naira(totalHigh)}`;
  document.getElementById('rCacFee').textContent = cacFeeLow === cacFeeHigh ? naira(cacFeeLow) : `${naira(cacFeeLow)} – ${naira(cacFeeHigh)}`;
  document.getElementById('rReservation').textContent = naira(reservation);
  document.getElementById('rStampDuty').textContent = naira(stampDuty);
  document.getElementById('rAgentFee').textContent = useAgent ? `${naira(agentLow)} – ${naira(agentHigh)}` : 'Not using an agent';
}

document.querySelectorAll('.form-panel input, .form-panel select').forEach(el => {
  el.addEventListener('input', calc);
  el.addEventListener('change', calc);
});
calc();

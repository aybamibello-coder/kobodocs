const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

document.getElementById('dutyRate').addEventListener('change', () => {
  const isCustom = document.getElementById('dutyRate').value === 'custom';
  document.getElementById('customRateGroup').style.display = isCustom ? 'block' : 'none';
  calc();
});

function calc() {
  const fobUsd = parseFloat(document.getElementById('fobUsd').value) || 0;
  const freightUsd = parseFloat(document.getElementById('freightUsd').value) || 0;
  const exRate = parseFloat(document.getElementById('exRate').value) || 0;
  let insuranceUsd = parseFloat(document.getElementById('insuranceUsd').value);
  if (!insuranceUsd && insuranceUsd !== 0) insuranceUsd = 0.015 * (fobUsd + freightUsd);

  const dutySelect = document.getElementById('dutyRate').value;
  const dutyRatePct = dutySelect === 'custom'
    ? (parseFloat(document.getElementById('customDutyRate').value) || 0)
    : parseFloat(dutySelect);

  const fobNgn = fobUsd * exRate;
  const cifNgn = (fobUsd + freightUsd + insuranceUsd) * exRate;

  const duty = cifNgn * (dutyRatePct / 100);
  const surcharge = duty * 0.07;
  const etls = cifNgn * 0.005;
  const fcs = fobNgn * 0.04;
  const vat = 0.075 * (cifNgn + duty + surcharge + etls + fcs);

  const total = cifNgn + duty + surcharge + etls + fcs + vat;

  document.getElementById('rCif').textContent = naira(cifNgn);
  document.getElementById('rDuty').textContent = naira(duty);
  document.getElementById('rSurcharge').textContent = naira(surcharge);
  document.getElementById('rEtls').textContent = naira(etls);
  document.getElementById('rFcs').textContent = naira(fcs);
  document.getElementById('rVat').textContent = naira(vat);
  document.getElementById('rTotal').textContent = naira(total);
}

document.querySelectorAll('.form-panel input').forEach(el => el.addEventListener('input', calc));
document.getElementById('customDutyRate').addEventListener('input', calc);
calc();

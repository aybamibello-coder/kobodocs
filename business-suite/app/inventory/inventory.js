const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

(async function init() {
  const ctx = await window.BizSuiteGuard.requireAccess();
  if (!ctx) return;
  const { business, supabase, session } = ctx;

  const listWrap = document.getElementById('itemListWrap');
  const editingIdEl = document.getElementById('editingId');
  const formHeading = document.getElementById('formHeading');
  const cancelBtn = document.getElementById('cancelEditBtn');

  let currentItems = [];
  let stockModalMode = null; // 'restock' | 'adjustment'
  let stockModalItemId = null;

  function clearForm() {
    editingIdEl.value = '';
    ['itName', 'itSku', 'itCategory'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('itUnit').value = 'unit';
    document.getElementById('itCost').value = '';
    document.getElementById('itSell').value = '';
    document.getElementById('itReorder').value = 5;
    document.getElementById('itQty').value = 0;
    formHeading.textContent = 'Add an item';
    cancelBtn.style.display = 'none';
  }

  async function loadItems() {
    const { data: items } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('business_id', business.id)
      .order('name');

    currentItems = items || [];

    if (!currentItems.length) {
      listWrap.innerHTML = '<div class="empty-note">No items yet — add your first one above.</div>';
      return;
    }

    listWrap.innerHTML = `
      <table class="inv-table">
        <thead><tr><th>Item</th><th>On hand</th><th>Cost / Sell</th><th>Actions</th></tr></thead>
        <tbody>
          ${currentItems.map(it => {
            const low = Number(it.quantity_on_hand) <= Number(it.reorder_level || 0);
            return `
              <tr data-id="${it.id}">
                <td>
                  <strong>${it.name}</strong>${low ? '<span class="low-stock-tag">Low stock</span>' : ''}
                  <div style="font-size:0.78rem; opacity:0.55;">${it.sku || ''}${it.category ? ' · ' + it.category : ''}</div>
                </td>
                <td>${it.quantity_on_hand} ${it.unit}</td>
                <td>${naira(it.cost_price)} / ${naira(it.sell_price)}</td>
                <td>
                  <div class="row-actions">
                    <button data-edit="${it.id}">Edit</button>
                    <button data-restock="${it.id}">Restock</button>
                    <button data-adjust="${it.id}">Adjust</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    listWrap.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = currentItems.find(i => i.id === btn.dataset.edit);
        editingIdEl.value = item.id;
        document.getElementById('itName').value = item.name || '';
        document.getElementById('itSku').value = item.sku || '';
        document.getElementById('itUnit').value = item.unit || 'unit';
        document.getElementById('itCost').value = item.cost_price || '';
        document.getElementById('itSell').value = item.sell_price || '';
        document.getElementById('itReorder').value = item.reorder_level || 0;
        document.getElementById('itQty').value = item.quantity_on_hand || 0;
        document.getElementById('itCategory').value = item.category || '';
        formHeading.textContent = 'Edit item';
        cancelBtn.style.display = 'inline-block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    listWrap.querySelectorAll('[data-restock]').forEach(btn => {
      btn.addEventListener('click', () => openStockModal(btn.dataset.restock, 'restock'));
    });
    listWrap.querySelectorAll('[data-adjust]').forEach(btn => {
      btn.addEventListener('click', () => openStockModal(btn.dataset.adjust, 'adjustment'));
    });
  }

  cancelBtn.addEventListener('click', clearForm);

  document.getElementById('saveItemBtn').addEventListener('click', async () => {
    const name = document.getElementById('itName').value.trim();
    if (!name) { showMsg('Item name is required.', 'error'); return; }

    const editingId = editingIdEl.value;
    const payload = {
      business_id: business.id,
      name,
      sku: document.getElementById('itSku').value.trim() || null,
      unit: document.getElementById('itUnit').value.trim() || 'unit',
      cost_price: Number(document.getElementById('itCost').value) || 0,
      sell_price: Number(document.getElementById('itSell').value) || 0,
      reorder_level: Number(document.getElementById('itReorder').value) || 0,
      category: document.getElementById('itCategory').value.trim() || null
    };
    if (!editingId) {
      payload.quantity_on_hand = Number(document.getElementById('itQty').value) || 0;
    }

    const { error } = editingId
      ? await supabase.from('inventory_items').update(payload).eq('id', editingId)
      : await supabase.from('inventory_items').insert(payload);

    if (error) {
      showMsg('Could not save item: ' + error.message, 'error');
      return;
    }

    showMsg(editingId ? 'Item updated.' : 'Item added.', 'success');
    clearForm();
    loadItems();
  });

  // ---------- Stock movement modal ----------
  function openStockModal(itemId, mode) {
    stockModalItemId = itemId;
    stockModalMode = mode;
    document.getElementById('stockModalTitle').textContent = mode === 'restock' ? 'Restock item' : 'Adjust stock level';
    document.getElementById('stockQty').value = '';
    document.getElementById('stockReason').value = '';
    document.getElementById('stockModal').classList.add('open');
  }

  document.getElementById('cancelStockBtn').addEventListener('click', () => {
    document.getElementById('stockModal').classList.remove('open');
  });

  document.getElementById('confirmStockBtn').addEventListener('click', async () => {
    const qty = Number(document.getElementById('stockQty').value);
    const reason = document.getElementById('stockReason').value.trim() || null;
    if (!qty && qty !== 0) return;

    const item = currentItems.find(i => i.id === stockModalItemId);
    if (!item) return;

    let newQty;
    let movementQty;
    if (stockModalMode === 'restock') {
      newQty = Number(item.quantity_on_hand) + qty;
      movementQty = qty;
    } else {
      movementQty = qty - Number(item.quantity_on_hand);
      newQty = qty;
    }

    await supabase.from('inventory_items').update({ quantity_on_hand: newQty }).eq('id', item.id);
    await supabase.from('stock_movements').insert({
      item_id: item.id,
      business_id: business.id,
      movement_type: stockModalMode,
      quantity: movementQty,
      reason,
      created_by: session.user.id
    });

    document.getElementById('stockModal').classList.remove('open');
    loadItems();
  });

  loadItems();
})();

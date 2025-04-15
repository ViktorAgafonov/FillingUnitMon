// report.js — отчёт: группировка по тестомесам, события, акценты, рецепты

// Пороговые значения для выделения отклонений
const BAD_DIFF = 0.02; // 2%
const CRITICAL_DIFF = 0.05; // 5%

// Получить список рецептов (для отображения названия)
let recipes = [];
async function loadRecipes() {
  const res = await fetch('/api/recipes');
  recipes = await res.json();
}

function getRecipeName(weight) {
  if (!recipes.length) return '';
  const found = recipes.find(r => weight >= r.min && weight <= r.max);
  return found ? found.name : '';
}

// Получить и отобразить события (добавление/удаление тестомесов)
async function loadEvents() {
  const res = await fetch('/api/events');
  const events = await res.json();
  const block = document.getElementById('report-events-block');
  if (!events.length) {
    block.innerHTML = '<em>Нет событий за выбранный период.</em>';
    return;
  }
  block.innerHTML = '<b>События:</b><br>' + events.map(ev =>
    `<div class="report-event ${ev.type}">
      [${ev.date} ${ev.time}] ${ev.type === 'add' ? 'Добавлен' : 'Удалён'} тестомес: <b>${ev.name}</b> (адрес: ${ev.address})
    </div>`
  ).join('');
}

// Группировка и отображение отчёта по тестомесам
// Получение и отображение отчёта по тестомесам с обработкой ошибок и пустых данных
async function getReport() {
  try {
    await loadRecipes();
    await loadEvents();
    const date = document.getElementById('report-date').value;
    const shift = document.getElementById('report-shift').value;
    const res = await fetch('/api/archive');
    let data = await res.json();
    if (!Array.isArray(data)) data = [];
    if (date) data = data.filter(r => r.date === date);
    if (shift) data = data.filter(r => r.shift === shift);
    // Группировка по тестомесу
    const byKneader = {};
    data.forEach(r => {
      const kneader = r.kneader || '-';
      const address = r.address || '-';
      const key = `${kneader}#${address}`;
      if (!byKneader[key]) byKneader[key] = [];
      byKneader[key].push(r);
    });
    const container = document.getElementById('report-by-kneader');
    container.innerHTML = '';
    if (!data.length) {
      container.innerHTML = '<em>Нет данных за выбранный период.</em>';
      return;
    }
    Object.entries(byKneader).forEach(([key, rows]) => {
      const [kneader, address] = key.split('#');
      const group = document.createElement('div');
      group.className = 'kneader-report-group';
      group.innerHTML = `<div class="kneader-report-title">${kneader || '-'} <span style="color:#888;font-size:0.95em">(адрес: ${address || '-'})</span></div>`;
      // таблица
      const table = document.createElement('table');
      table.className = 'kneader-report-table';
      table.innerHTML = `
        <thead><tr>
          <th>Вес (кг)</th>
          <th>Рецепт</th>
          <th>Отклонение</th>
          <th>Дата</th>
          <th>Смена</th>
          <th>Время</th>
        </tr></thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector('tbody');
      rows.forEach(r => {
        // Если вес не определён — выводим '-'
        const weight = (typeof r.weight === 'number' && !isNaN(r.weight)) ? r.weight : '-';
        let recipe = getRecipeName(r.weight);
        if (!recipe) recipe = '-';
        let diff = '';
        let diffClass = '';
        let trClass = '';
        if (recipe && recipe !== '-') {
          const rec = recipes.find(x => x.name === recipe);
          if (rec) {
            const center = (rec.min + rec.max) / 2;
            const relDiff = (typeof r.weight === 'number' && center) ? Math.abs(r.weight - center) / center : 0;
            diff = (typeof r.weight === 'number' && center)
              ? ((r.weight - center) > 0 ? '+' : '') + (r.weight - center).toFixed(2) + ' кг (' + (relDiff*100).toFixed(1) + '%)'
              : '-';
            if (relDiff >= CRITICAL_DIFF) {
              diffClass = 'critical';
              trClass = 'critical-dose';
            } else if (relDiff >= BAD_DIFF) {
              diffClass = 'bad';
              trClass = 'bad-dose';
            } else {
              diffClass = 'good';
              trClass = 'good-dose';
            }
          }
        }
        tbody.innerHTML += `<tr class="${trClass}">
          <td>${weight}</td>
          <td>${recipe}</td>
          <td class="dose-diff ${diffClass}">${diff}</td>
          <td>${r.date || '-'}</td>
          <td>${r.shift || '-'}</td>
          <td>${r.timestamp ? r.timestamp.slice(11, 19) : '-'}</td>
        </tr>`;
      });
      group.appendChild(table);
      container.appendChild(group);
    });
  } catch (e) {
    const container = document.getElementById('report-by-kneader');
    container.innerHTML = '<span style="color:red">Ошибка загрузки отчёта: ' + (e.message || e) + '</span>';
  }
}


window.getReport = getReport;

// XLS экспорт (без изменений)
window.downloadXLS = async function() {
  const date = document.getElementById('report-date').value;
  const shift = document.getElementById('report-shift').value;
  const res = await fetch('/api/archive');
  let data = await res.json();
  if (date) data = data.filter(r => r.date === date);
  if (shift) data = data.filter(r => r.shift === shift);
  // Формируем XLS через API
  const resp = await fetch('/api/report-xls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data })
  });
  const blob = await resp.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'report.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

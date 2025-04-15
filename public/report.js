// report.js — отчёт: группировка по тестомесам, события, акценты, рецепты

// Пороговые значения для выделения отклонений
const BAD_DIFF = 0.02; // 2%
const CRITICAL_DIFF = 0.05; // 5%

// Функция для форматирования чисел
function formatStat(val, digits = 2) {
  if (val === undefined || isNaN(val)) return '-';
  return Number(val).toFixed(digits);
}

// Получить список рецептов (для отображения названия)
let recipes = [];
async function loadRecipes() {
  const res = await fetch('/api/recipes');
  recipes = await res.json();
}

function getRecipeName(weight) {
  if (!recipes.length) return '';
  const found = recipes.find(r => weight >= r.minWeight && weight <= r.maxWeight);
  return found ? found.name : '';
}

// Получить и отобразить события (добавление/удаление тестомесов)
async function loadEvents() {
  // Заглушка, так как API /api/events не реализован
  try {
    const block = document.getElementById('report-events-block');
    if (block) {
      block.innerHTML = '<em>События недоступны.</em>';
    }
  } catch (e) {
    console.error('Ошибка при загрузке событий:', e);
  }
}

// Группировка и отображение отчёта по тестомесам
// Получение и отображение отчёта по тестомесам с обработкой ошибок и пустых данных
async function getReport() {
  try {
    // Загружаем рецепты и события
    console.log('[Отчёт] Загрузка рецептов...');
    await loadRecipes();
    console.log('[Отчёт] Загрузка событий...');
    await loadEvents();
    
    // Получаем фильтры
    const date = document.getElementById('report-date').value;
    const shift = document.getElementById('report-shift').value;
    console.log(`[Отчёт] Фильтры: дата=${date}, смена=${shift}`);
    
    // Загружаем архив
    console.log('[Отчёт] Запрос архива...');
    const res = await fetch('/api/archive');
    const responseText = await res.text(); // Сначала получаем как текст
    
    // Проверяем, что ответ - валидный JSON
    console.log(`[Отчёт] Получен ответ длиной ${responseText.length} символов`);
    console.log(`[Отчёт] Первые 100 символов ответа: ${responseText.substring(0, 100)}`);
    
    // Пробуем распарсить JSON
    let data;
    try {
      data = JSON.parse(responseText);
      console.log(`[Отчёт] JSON успешно распарсен, получено ${data.length} записей`);
    } catch (jsonError) {
      console.error(`[Отчёт] Ошибка парсинга JSON: ${jsonError.message}`);
      throw new Error(`Ошибка парсинга JSON: ${jsonError.message}. Ответ сервера: ${responseText.substring(0, 100)}...`);
    }
    if (!Array.isArray(data)) data = [];
    if (date) data = data.filter(r => r.date === date);
    if (shift) data = data.filter(r => r.shift === shift);
    
    // Группировка по тестомесу
    const byKneader = {};
    let totalWeight = 0;
    let totalDoses = 0;
    
    data.forEach(r => {
      const kneader = r.kneader || '-';
      const address = r.address || '-';
      const key = `${kneader}#${address}`;
      if (!byKneader[key]) byKneader[key] = [];
      byKneader[key].push(r);
      
      // Суммируем вес для общей статистики
      if (typeof r.weight === 'number' && !isNaN(r.weight)) {
        totalWeight += r.weight;
        totalDoses++;
      }
    });
    
    // Формируем сводную информацию
    const summaryContainer = document.getElementById('report-summary');
    if (data.length) {
      const avgWeight = totalDoses > 0 ? totalWeight / totalDoses : 0;
      const periodText = date ? (shift ? `за ${date}, смена: ${shift}` : `за ${date}`) : (shift ? `смена: ${shift}` : 'за весь период');
      
      summaryContainer.innerHTML = `
        <h2>Сводная информация ${periodText}</h2>
        <div class="summary-row">
          <span class="summary-label">Всего тестомесов:</span>
          <span class="summary-value">${Object.keys(byKneader).length}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Всего дозаций:</span>
          <span class="summary-value">${totalDoses}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Общий вес:</span>
          <span class="summary-value">${formatStat(totalWeight, 1)} кг</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Средний вес дозации:</span>
          <span class="summary-value">${formatStat(avgWeight, 2)} кг</span>
        </div>
      `;
    } else {
      summaryContainer.innerHTML = '<em>Нет данных за выбранный период.</em>';
    }
    
    // Отображаем данные по тестомесам
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
      
      // Вычисляем суммарный вес для тестомеса
      let kneaderTotalWeight = 0;
      rows.forEach(r => {
        if (typeof r.weight === 'number' && !isNaN(r.weight)) {
          kneaderTotalWeight += r.weight;
        }
      });
      
      // Заголовок с информацией о тестомесе
      group.innerHTML = `
        <div class="kneader-report-title">
          ${kneader || '-'} <span style="color:#eee;font-size:0.9em">(адрес: ${address || '-'})</span>
          <div style="font-size:0.8em;margin-top:5px;">Всего дозаций: ${rows.length}, Общий вес: ${formatStat(kneaderTotalWeight, 1)} кг</div>
        </div>
      `;
      
      // Таблица с данными
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
            const center = (rec.minWeight + rec.maxWeight) / 2;
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

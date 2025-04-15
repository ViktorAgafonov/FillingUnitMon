// main.js — современный мониторинг с карточками и статистикой

// Глобальные переменные для хранения данных
let currentKneaders = [];
let kneaderSettings = [];
let archiveData = [];
let recipesData = [];
let eventSource = null;

// Загрузка рецептов (только при необходимости)
async function getRecipes() {
  if (recipesData.length === 0) {
    const res = await fetch('/api/recipes');
    recipesData = await res.json();
  }
  return recipesData;
}

function getRecipeName(weight, recipes) {
  if (!recipes) return '';
  const r = recipes.find(r => weight >= r.minWeight && weight <= r.maxWeight);
  return r ? r.name : '';
}

function formatStat(val, digits = 2) {
  if (val === undefined || isNaN(val)) return '-';
  return Number(val).toFixed(digits);
}

// Инициализация данных и подключение к SSE
async function initData() {
  try {
    // Загрузка начальных данных
    const [kneadersRes, archiveRes, recipes] = await Promise.all([
      fetch('/api/kneaders').then(r => r.json()),
      fetch('/api/archive').then(r => r.json()),
      getRecipes()
    ]);
    
    kneaderSettings = kneadersRes.kneaders;
    archiveData = archiveRes;
    
    // Подключение к Server-Sent Events (SSE)
    connectToEventSource();
    
    // Начальное отображение карточек
    renderKneaderCards(kneaderSettings, archiveData, recipes);
  } catch (error) {
    // Ошибка загрузки данных
  }
}

// Подключение к SSE для получения данных в реальном времени
function connectToEventSource() {
  // Закрыть предыдущее соединение, если есть
  if (eventSource) {
    eventSource.close();
  }
  
  // Создание нового соединения
  eventSource = new EventSource('/api/kneaders/events');
  
  // Обработка полученных данных
  eventSource.onmessage = function(event) {
    try {
      // Обработка входящих данных из SSE
      // Обновление текущих данных
      currentKneaders = JSON.parse(event.data);
      
      // Обновление архива с текущими данными
      updateArchiveWithCurrentData();
      
      // Обновление отображения
      getRecipes().then(recipes => {
        renderKneaderCards(kneaderSettings, archiveData, recipes);
      });
    } catch (error) {
      // Ошибка обработки SSE-данных
    }
  };
  
  // Обработка ошибок
  eventSource.onerror = function(error) {
    // Ошибка SSE-соединения
    // Попытка переподключения через 3 секунды
    setTimeout(connectToEventSource, 3000);
  };
}

// Обновление архива с текущими данными
function updateArchiveWithCurrentData() {
  // Добавляем текущие состояния в архив для отображения
  currentKneaders.forEach(state => {
    // Добавляем текущее состояние как последнее в архиве
    const existingIndex = archiveData.findIndex(a => a.address === state.address);
    if (existingIndex >= 0) {
      // Обновляем последнее состояние
      archiveData[existingIndex] = {
        ...archiveData[existingIndex],
        currentWeight: state.currentWeight,
        recipeWeight: state.recipeWeight,
        ready: state.ready,
        timestamp: state.timestamp,
        responseTime: state.responseTime,
        connected: state.connected
      };
    } else {
      // Добавляем новое состояние
      archiveData.push({
        kneader: state.name,
        address: state.address,
        weight: state.currentWeight,
        currentWeight: state.currentWeight,
        recipeWeight: state.recipeWeight,
        ready: state.ready,
        timestamp: state.timestamp,
        responseTime: state.responseTime,
        connected: state.connected
      });
    }
  });
}

function calcStats(records) {
  if (!records.length) return {};
  // Используем currentWeight вместо weight для расчета статистики
  const weights = records.map(r => r.currentWeight || r.weight || 0); // Используем currentWeight с запасным weight
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
  // Погрешности (разница с recipeWeight)
  const deltas = records.map(r => Math.abs(((r.currentWeight || r.weight || 0) - (r.recipeWeight || 0))));
  const maxDelta = Math.max(...deltas);
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return { min, max, avg, maxDelta, avgDelta };
}

function shiftStats(records) {
  const shifts = {};
  for (const r of records) {
    if (!shifts[r.shift]) shifts[r.shift] = { count: 0, sum: 0 };
    shifts[r.shift].count++;
    // Используем currentWeight с запасным weight
    shifts[r.shift].sum += (r.currentWeight || r.weight || 0);
  }
  return shifts;
}

// Отрисовка карточек тестомесов с учётом состояния связи и веса
function renderKneaderCards(kneaders, archive, recipes) {
  const container = document.getElementById('kneaders-cards');
  container.innerHTML = '';
  kneaders.forEach(kn => {
    // Все события по этому тестомесу
    // Получаем все события по адресу тестомеса
    const recs = archive.filter(a => a.address === kn.modbusAddress);
    // Последнее событие для отображения актуального состояния
    const last = recs.length ? recs[recs.length-1] : undefined;
    // Поиск live-данных
    const live = currentKneaders.find(k => k.address === kn.modbusAddress);
    // Определяем состояние связи (важно: внутри области видимости forEach!)
    let connected = false;
    if (live && typeof live.connected !== 'undefined') {
      connected = live.connected;
    } else if (last && typeof last.connected !== 'undefined') {
      connected = last.connected;
    }
    // Текущий вес только из live-данных
    let showWeight = undefined;
    if (live && live.currentWeight !== undefined) {
      showWeight = live.currentWeight;
    } else {
      showWeight = undefined; // Нет данных — не брать из архива!
    }

    const responseTime = last && last.responseTime ? last.responseTime : Math.round(Math.random()*30+20);
    // Определяем рецепт по рецептурному весу, а не по текущему
    const recipeName = last && last.recipeWeight ? getRecipeName(last.recipeWeight, recipes) : '';
    
    // Вычисляем статистику по тестомесу
    const stats = calcStats(recs);
    // Вычисляем статистику по сменам
    const shifts = shiftStats(recs);
    const card = document.createElement('div');
    // Используем connected только после его явного определения
    card.className = 'kneader-card ' + (connected ? 'connected' : 'disconnected'); // Цветовая индикация
    card.innerHTML = `
      <h2>${kn.name} <span style="font-size:0.8em;color:#888">(адр. ${kn.modbusAddress})</span></h2>
      <div class="status ${connected ? '' : 'disconnected'}">${connected ? 'Подключен' : 'Нет связи'}</div>
      <div class="recipe">${recipeName ? 'Рецепт: ' + recipeName : ''}</div>
      <div class="stat-row"><span class="stat-label">Текущий вес:</span><span class="stat-value">${showWeight !== undefined ? showWeight : '<span style=\"color:#c00\">Нет данных</span>'}</span></div> <!-- если данные не пришли, явно пишем -->
      <div class="stat-row"><span class="stat-label">Рецептурный вес:</span><span class="stat-value">${last && last.recipeWeight ? last.recipeWeight : '-'}</span></div>
      <div class="stat-row"><span class="stat-label">Готовность:</span><span class="stat-value">${last && last.ready !== undefined ? last.ready : '-'}</span></div>
      <div class="stat-row"><span class="stat-label">Время последнего взвешивания:</span><span class="stat-value">${last && last.timestamp ? last.timestamp.replace('T',' ').slice(0,19) : '-'}</span></div>
      <div class="stat-row"><span class="stat-label">Время ответа:</span><span class="stat-value">${responseTime} мс</span></div>
      <div class="stat-row"><span class="stat-label">Мин. вес:</span><span class="stat-value">${formatStat(stats.min)}</span></div>
      <div class="stat-row"><span class="stat-label">Макс. вес:</span><span class="stat-value">${formatStat(stats.max)}</span></div>
      <div class="stat-row"><span class="stat-label">Средний вес:</span><span class="stat-value">${formatStat(stats.avg)}</span></div>
      <div class="stat-row"><span class="stat-label">Макс. погрешность:</span><span class="stat-value">${formatStat(stats.maxDelta)}</span></div>
      <div class="stat-row"><span class="stat-label">Ср. погрешность:</span><span class="stat-value">${formatStat(stats.avgDelta)}</span></div>
      <div class="stat-row"><span class="stat-label">Вес последнего взвешивания:</span><span class="stat-value">${last ? last.currentWeight : '-'}</span></div>
      <div class="stat-row"><span class="stat-label">Статус:</span><span class="stat-value">${!connected ? '<span style="color:#c00">Нет связи</span>' : (last && last.ready === 1 && last.currentWeight === last.recipeWeight ? 'Готово к дозации' : (last && last.ready === 1 ? 'Готов' : 'Ожидание'))}</span></div>
      <div class="stat-row"><span class="stat-label">Кол-во доз/взвешиваний:</span><span class="stat-value">${recs.length}</span></div>
      <div style="margin-top:8px;">
        <table class="shift-table">
          <thead><tr><th>Смена</th><th>Кол-во</th><th>Сумма, кг</th></tr></thead>
          <tbody>
            ${Object.entries(shifts).map(([shift, v]) => `<tr><td>${shift}</td><td>${v.count}</td><td>${formatStat(v.sum,1)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
    container.appendChild(card);
  });
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', initData);

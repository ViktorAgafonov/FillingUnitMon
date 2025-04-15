// settings.js — современный UI настроек тестомесов с карточками, подтверждениями и уведомлениями

let kneaders = [];
let modbusSettings = {};

// Загрузка настроек подключения и тестомесов
async function loadKneaders() {
  const res = await fetch('/api/kneaders');
  kneaders = (await res.json()).kneaders;
  renderKneaderCards();
}

function renderKneaderCards() {
  const container = document.getElementById('kneaders-settings-cards');
  container.innerHTML = '';
  kneaders.forEach((kn, i) => {
    const card = document.createElement('div');
    card.className = 'kneader-card settings-card';
    card.innerHTML = `
      <h2>Тестомес #${i+1}</h2>
      <div class="stat-row"><span class="stat-label">Имя:</span>
        <input type="text" value="${kn.name}" data-idx="${i}" class="kneader-name-input" />
      </div>
      <div class="stat-row"><span class="stat-label">Адрес Modbus:</span>
        <input type="number" min="1" max="247" value="${kn.modbusAddress}" data-idx="${i}" class="kneader-address-input" />
      </div>
      <div class="stat-row"><b>Текущий вес</b></div>
      <div class="stat-row"><span class="stat-label">Регистр:</span>
        <input type="number" min="0" value="${kn.registerCurrentWeight || 100}" data-idx="${i}" class="kneader-regcurw-input" />
      </div>
      <div class="stat-row"><span class="stat-label">Кол-во регистров:</span>
        <input type="number" min="1" max="4" value="${kn.registerCurrentWeightCount || 2}" data-idx="${i}" class="kneader-regcurwcount-input" />
      </div>
      <div class="stat-row"><span class="stat-label">Тип данных:</span>
        <select data-idx="${i}" class="kneader-dtypecurw-input">
          <option value="float32" ${kn.dataTypeCurrentWeight==="float32"?"selected":""}>float32</option>
          <option value="int32" ${kn.dataTypeCurrentWeight==="int32"?"selected":""}>int32</option>
          <option value="uint16" ${kn.dataTypeCurrentWeight==="uint16"?"selected":""}>uint16</option>
        </select>
      </div>
      <div class="stat-row"><span class="stat-label">Порядок байтов:</span>
        <select data-idx="${i}" class="kneader-byteordercurw-input">
          <option value="normal" ${kn.byteOrderCurrentWeight==="normal"?"selected":""}>normal</option>
          <option value="swapped" ${kn.byteOrderCurrentWeight==="swapped"?"selected":""}>swapped</option>
          <option value="reverse" ${kn.byteOrderCurrentWeight==="reverse"?"selected":""}>reverse</option>
        </select>
      </div>
      <div class="stat-row"><b>Рецептурный вес</b></div>
      <div class="stat-row"><span class="stat-label">Регистр:</span>
        <input type="number" min="0" value="${kn.registerRecipeWeight || 102}" data-idx="${i}" class="kneader-regrecw-input" />
      </div>
      <div class="stat-row"><span class="stat-label">Кол-во регистров:</span>
        <input type="number" min="1" max="4" value="${kn.registerRecipeWeightCount || 2}" data-idx="${i}" class="kneader-regrecwcount-input" />
      </div>
      <div class="stat-row"><span class="stat-label">Тип данных:</span>
        <select data-idx="${i}" class="kneader-dtyperecw-input">
          <option value="float32" ${kn.dataTypeRecipeWeight==="float32"?"selected":""}>float32</option>
          <option value="int32" ${kn.dataTypeRecipeWeight==="int32"?"selected":""}>int32</option>
          <option value="uint16" ${kn.dataTypeRecipeWeight==="uint16"?"selected":""}>uint16</option>
        </select>
      </div>
      <div class="stat-row"><span class="stat-label">Порядок байтов:</span>
        <select data-idx="${i}" class="kneader-byteorderrecw-input">
          <option value="normal" ${kn.byteOrderRecipeWeight==="normal"?"selected":""}>normal</option>
          <option value="swapped" ${kn.byteOrderRecipeWeight==="swapped"?"selected":""}>swapped</option>
          <option value="reverse" ${kn.byteOrderRecipeWeight==="reverse"?"selected":""}>reverse</option>
        </select>
      </div>
      <div class="stat-row"><b>Готовность</b></div>
      <div class="stat-row"><span class="stat-label">Регистр:</span>
        <input type="number" min="0" value="${kn.registerReady || 104}" data-idx="${i}" class="kneader-regready-input" />
      </div>
      <div class="stat-row"><span class="stat-label">Кол-во регистров:</span>
        <input type="number" min="1" max="4" value="${kn.registerReadyCount || 1}" data-idx="${i}" class="kneader-regreadycount-input" />
      </div>
      <div class="stat-row"><span class="stat-label">Тип данных:</span>
        <select data-idx="${i}" class="kneader-dtypeready-input">
          <option value="bool" ${kn.dataTypeReady==="bool"?"selected":""}>bool</option>
          <option value="uint16" ${kn.dataTypeReady==="uint16"?"selected":""}>uint16</option>
        </select>
      </div>
      <div class="stat-row"><span class="stat-label">Порядок байтов:</span>
        <select data-idx="${i}" class="kneader-byteorderready-input">
          <option value="normal" ${kn.byteOrderReady==="normal"?"selected":""}>normal</option>
          <option value="swapped" ${kn.byteOrderReady==="swapped"?"selected":""}>swapped</option>
          <option value="reverse" ${kn.byteOrderReady==="reverse"?"selected":""}>reverse</option>
        </select>
      </div>
      <div class="settings-actions">
        <button class="save-btn" onclick="saveKneader(${i})">Сохранить</button>
        <button class="remove-btn" onclick="confirmRemoveKneader(${i})">Удалить</button>
      </div>
    `;
    container.appendChild(card);
  });
}

// --- Сохранение всех полей расширенной структуры ---
window.saveKneader = async function(idx) {
  try {
    const name = document.querySelector(`.kneader-name-input[data-idx='${idx}']`).value.trim();
    const address = parseInt(document.querySelector(`.kneader-address-input[data-idx='${idx}']`).value, 10);
    // Текущий вес
    const registerCurrentWeight = parseInt(document.querySelector(`.kneader-regcurw-input[data-idx='${idx}']`).value, 10);
    const registerCurrentWeightCount = parseInt(document.querySelector(`.kneader-regcurwcount-input[data-idx='${idx}']`).value, 10);
    const dataTypeCurrentWeight = document.querySelector(`.kneader-dtypecurw-input[data-idx='${idx}']`).value;
    const byteOrderCurrentWeight = document.querySelector(`.kneader-byteordercurw-input[data-idx='${idx}']`).value;
    // Рецептурный вес
    const registerRecipeWeight = parseInt(document.querySelector(`.kneader-regrecw-input[data-idx='${idx}']`).value, 10);
    const registerRecipeWeightCount = parseInt(document.querySelector(`.kneader-regrecwcount-input[data-idx='${idx}']`).value, 10);
    const dataTypeRecipeWeight = document.querySelector(`.kneader-dtyperecw-input[data-idx='${idx}']`).value;
    const byteOrderRecipeWeight = document.querySelector(`.kneader-byteorderrecw-input[data-idx='${idx}']`).value;
    // Готовность
    const registerReady = parseInt(document.querySelector(`.kneader-regready-input[data-idx='${idx}']`).value, 10);
    const registerReadyCount = parseInt(document.querySelector(`.kneader-regreadycount-input[data-idx='${idx}']`).value, 10);
    const dataTypeReady = document.querySelector(`.kneader-dtypeready-input[data-idx='${idx}']`).value;
    const byteOrderReady = document.querySelector(`.kneader-byteorderready-input[data-idx='${idx}']`).value;
    kneaders[idx] = {
      name,
      modbusAddress: address,
      registerCurrentWeight,
      registerCurrentWeightCount,
      dataTypeCurrentWeight,
      byteOrderCurrentWeight,
      registerRecipeWeight,
      registerRecipeWeightCount,
      dataTypeRecipeWeight,
      byteOrderRecipeWeight,
      registerReady,
      registerReadyCount,
      dataTypeReady,
      byteOrderReady
    };
    await fetch('/api/kneaders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kneaders })
    });
    showMessage('Изменения сохранены.');
    await loadKneaders();
  } catch (e) {
    showMessage('Ошибка сохранения: ' + (e.message || e));
  }
};

// --- Добавление нового тестомеса с полной структурой ---
window.addKneader = function() {
  kneaders.push({
    name: '',
    modbusAddress: 1,
    registerCurrentWeight: 100,
    registerCurrentWeightCount: 2,
    dataTypeCurrentWeight: 'float32',
    byteOrderCurrentWeight: 'normal',
    registerRecipeWeight: 102,
    registerRecipeWeightCount: 2,
    dataTypeRecipeWeight: 'float32',
    byteOrderRecipeWeight: 'normal',
    registerReady: 104,
    registerReadyCount: 1,
    dataTypeReady: 'bool',
    byteOrderReady: 'normal'
  });
  saveAllKneaders('Тестомес добавлен.');
};



window.confirmRemoveKneader = function(idx) {
  if (confirm('Удалить этот тестомес?')) {
    kneaders.splice(idx, 1);
    saveAllKneaders('Тестомес удалён.');
  }
};

function showMessage(msg) {
  const el = document.getElementById('settings-message');
  el.textContent = msg;
  el.style.opacity = 1;
  setTimeout(() => { el.style.opacity = 0; }, 2000);
}

function saveAllKneaders(msg) {
  fetch('/api/kneaders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kneaders })
  }).then(() => {
    showMessage(msg);
    loadKneaders();
    // Автоматически обновить главную страницу, если она открыта
    if (window.opener) window.opener.location.reload();
  });
}

document.getElementById('add-kneader-btn').onclick = function() {
  const name = prompt('Введите имя тестомеса:');
  if (!name) return;
  let address = prompt('Введите адрес Modbus (1-247):');
  address = parseInt(address, 10);
  if (!address || address < 1 || address > 247) {
    alert('Некорректный адрес.');
    return;
  }
  kneaders.push({ name, modbusAddress: address });
  saveAllKneaders('Тестомес добавлен.');
};

window.addEventListener('DOMContentLoaded', loadKneaders);

// --- UI для настроек подключения к Modbus ---
function renderModbusSettings() {
  let html = `<h3>Подключение к Modbus</h3>
    <div class="stat-row">
      <span class="stat-label">Тип подключения:</span>
      <select id="modbus-type-select">
        <option value="com" ${modbusSettings.type==="com"?"selected":""}>COM (Serial)</option>
        <option value="tcp" ${modbusSettings.type==="tcp"?"selected":""}>TCP</option>
      </select>
    </div>
    <div id="modbus-com-fields" style="display:${modbusSettings.type==="com"?"block":"none"}">
      <div class="stat-row"><span class="stat-label">Порт:</span> <input id="modbus-com-port" value="${modbusSettings.com?.port||''}" /></div>
      <div class="stat-row"><span class="stat-label">Скорость:</span> <input id="modbus-com-baud" type="number" value="${modbusSettings.com?.baudRate||9600}" /></div>
      <div class="stat-row"><span class="stat-label">Биты данных:</span> <input id="modbus-com-databits" type="number" value="${modbusSettings.com?.dataBits||8}" /></div>
      <div class="stat-row"><span class="stat-label">Паритет:</span> <select id="modbus-com-parity"><option value="none">none</option><option value="even">even</option><option value="odd">odd</option></select></div>
      <div class="stat-row"><span class="stat-label">Стоп-биты:</span> <input id="modbus-com-stopbits" type="number" value="${modbusSettings.com?.stopBits||1}" /></div>
    </div>
    <div id="modbus-tcp-fields" style="display:${modbusSettings.type==="tcp"?"block":"none"}">
      <div class="stat-row"><span class="stat-label">IP-адрес:</span> <input id="modbus-tcp-host" value="${modbusSettings.tcp?.host||''}" /></div>
      <div class="stat-row"><span class="stat-label">Порт:</span> <input id="modbus-tcp-port" type="number" value="${modbusSettings.tcp?.port||502}" /></div>
    </div>
    <div class="settings-actions"><button id="modbus-save-btn">Сохранить подключение</button></div>`;
  let block = document.getElementById('modbus-settings-block');
  if (!block) {
    block = document.createElement('div');
    block.id = 'modbus-settings-block';
    document.querySelector('section').prepend(block);
  }
  block.innerHTML = html;
  // Установить значения select
  document.getElementById('modbus-com-parity').value = modbusSettings.com?.parity||'none';
  // События для смены типа
  document.getElementById('modbus-type-select').onchange = function() {
    const type = this.value;
    document.getElementById('modbus-com-fields').style.display = type==='com'?'block':'none';
    document.getElementById('modbus-tcp-fields').style.display = type==='tcp'?'block':'none';
  };
  document.getElementById('modbus-save-btn').onclick = saveModbusSettings;
}

function saveModbusSettings() {
  const type = document.getElementById('modbus-type-select').value;
  const com = {
    port: document.getElementById('modbus-com-port').value,
    baudRate: parseInt(document.getElementById('modbus-com-baud').value, 10),
    dataBits: parseInt(document.getElementById('modbus-com-databits').value, 10),
    parity: document.getElementById('modbus-com-parity').value,
    stopBits: parseInt(document.getElementById('modbus-com-stopbits').value, 10)
  };
  const tcp = {
    host: document.getElementById('modbus-tcp-host').value,
    port: parseInt(document.getElementById('modbus-tcp-port').value, 10)
  };
  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modbus: {
        type, com, tcp
      }
    })
  }).then(()=>{
    showMessage('Настройки подключения сохранены.');
    loadKneaders();
  });
}

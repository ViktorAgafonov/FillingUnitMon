// Модуль для опроса Modbus и фиксации событий по тестомесам
// Комментарии и пояснения на русском языке

const ModbusRTU = require('modbus-serial');
const fs = require('fs');
const path = require('path');

// Пути к файлам настроек
const kneadersPath = path.join(__dirname, '../config/kneaders.json');
const recipesPath = path.join(__dirname, '../data/recipes.json');
const settingsPath = path.join(__dirname, '../config/settings.json');

// Загрузка настроек modbus
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
// Загрузка списка тестомесов
let kneaders = JSON.parse(fs.readFileSync(kneadersPath, 'utf8')).kneaders;

const client = new ModbusRTU();
let connected = false;

// Подключение к modbus (COM или TCP)
async function connectModbus() {
  try {
    if (!connected) {
      console.log(`[Подключение Modbus] Попытка подключения: ${settings.modbus.type}`);
      if (settings.modbus.type === 'tcp') {
        console.log(`[Подключение Modbus] TCP к ${settings.modbus.tcp.host}:${settings.modbus.tcp.port}`);
        await client.connectTCP(settings.modbus.tcp.host, { port: settings.modbus.tcp.port });
      } else {
        console.log(`[Подключение Modbus] COM к ${settings.modbus.com.port}`);
        await client.connectRTUBuffered(settings.modbus.com.port, {
          baudRate: settings.modbus.com.baudRate,
          dataBits: settings.modbus.com.dataBits,
          parity: settings.modbus.com.parity,
          stopBits: settings.modbus.com.stopBits
        });
      }
      connected = true;
      console.log(`[Подключение Modbus] Успешно подключено`);
    }
  } catch (error) {
    connected = false;
    console.error(`[Ошибка Modbus] Не удалось подключиться: ${error.message}`);
    // Не перебрасываем ошибку, чтобы не прерывать работу сервера
  }
}

/**
 * Конвертация сырых данных Modbus в число по параметрам тестомеса
 * @param {Array} regs - массив регистров (чисел)
 * @param {string} type - тип данных (float32, int32, uint16)
 * @param {string} order - порядок байтов (normal, swapped, reverse)
 * @returns {number}
 */
function convertModbusValue(regs, type, order) {
  // Преобразуем массив регистров в массив байтов
  let bytes = [];
  for (let r of regs) {
    bytes.push((r >> 8) & 0xFF); // старший байт
    bytes.push(r & 0xFF);        // младший байт
  }
  // Применяем порядок байтов
  if (order === 'swapped' && bytes.length === 4) {
    // Меняем местами регистры: [R1,R2] -> [R2,R1]
    bytes = [bytes[2], bytes[3], bytes[0], bytes[1]];
  } else if (order === 'reverse') {
    bytes = bytes.reverse();
  }
  // Конвертация по типу
  const buf = Buffer.from(bytes);
  if (type === 'float32') {
    // Читаем 4 байта как float32
    return buf.readFloatBE(0);
  } else if (type === 'int32') {
    return buf.readInt32BE(0);
  } else if (type === 'uint16') {
    return regs[0]; // просто первый регистр
  }
  return NaN;
}


// Опрос одного тестомеса с учётом индивидуальных настроек
async function pollKneader(kn) {
  // Запоминаем время начала опроса
  const startTime = Date.now();
  
  try {
    await connectModbus();
    client.setID(kn.modbusAddress);
    // --- Текущий вес ---
    let currentWeight = null, recipeWeight = null, ready = null;
    let errCurrent = null, errRecipe = null, errReady = null;
    try {
      const dataCur = await client.readHoldingRegisters(kn.registerCurrentWeight, kn.registerCurrentWeightCount);
      currentWeight = convertModbusValue(
        dataCur.data,
        kn.dataTypeCurrentWeight || 'float32',
        kn.byteOrderCurrentWeight || 'normal'
      );
    } catch (e) {
      errCurrent = e.message;
    }
    // --- Рецептурный вес ---
    try {
      const dataRec = await client.readHoldingRegisters(kn.registerRecipeWeight, kn.registerRecipeWeightCount);
      recipeWeight = convertModbusValue(
        dataRec.data,
        kn.dataTypeRecipeWeight || 'float32',
        kn.byteOrderRecipeWeight || 'normal'
      );
    } catch (e) {
      errRecipe = e.message;
    }
    // --- Готовность ---
    try {
      const dataReady = await client.readHoldingRegisters(kn.registerReady, kn.registerReadyCount);
      if ((kn.dataTypeReady || 'bool') === 'bool') {
        ready = !!dataReady.data[0];
      } else {
        ready = convertModbusValue(
          dataReady.data,
          kn.dataTypeReady || 'uint16',
          kn.byteOrderReady || 'normal'
        );
      }
    } catch (e) {
      errReady = e.message;
    }
    
    // Вычисляем время опроса
    const responseTime = Date.now() - startTime;
    
    // Обновляем статистику по устройству
    if (!deviceStats[kn.modbusAddress]) {
      deviceStats[kn.modbusAddress] = { 
        count: 0, 
        totalResponseTime: 0,
        avgResponseTime: 0,
        successCount: 0,
        errorCount: 0
      };
    }
    
    const stats = deviceStats[kn.modbusAddress];
    stats.count++;
    stats.totalResponseTime += responseTime;
    stats.avgResponseTime = stats.totalResponseTime / stats.count;
    
    // Считаем успешные и неуспешные опросы
    if (errCurrent || errRecipe || errReady) {
      stats.errorCount++;
    } else {
      stats.successCount++;
    }
    
    return {
      name: kn.name,
      address: kn.modbusAddress,
      currentWeight,
      recipeWeight,
      ready,
      errCurrent,
      errRecipe,
      errReady,
      responseTime // Добавляем время ответа в результат
    };
  } catch (e) {
    // Даже при ошибке обновляем статистику
    const responseTime = Date.now() - startTime;
    
    if (!deviceStats[kn.modbusAddress]) {
      deviceStats[kn.modbusAddress] = { 
        count: 0, 
        totalResponseTime: 0,
        avgResponseTime: 0,
        successCount: 0,
        errorCount: 0
      };
    }
    
    const stats = deviceStats[kn.modbusAddress];
    stats.count++;
    stats.totalResponseTime += responseTime;
    stats.avgResponseTime = stats.totalResponseTime / stats.count;
    stats.errorCount++;
    
    return { 
      name: kn.name, 
      address: kn.modbusAddress, 
      error: e.message,
      responseTime 
    };
  }
}



// Архивирование события
// Универсальная функция для получения текущей даты/времени в UTC (ISO 8601)
function getUtcDateParts() {
  const now = new Date();
  const iso = now.toISOString(); // всегда UTC
  return {
    timestamp: iso,
    date: iso.slice(0, 10),
    time: iso.slice(11, 19),
    shift: (now.getUTCHours() + 3 < 20 && now.getUTCHours() + 3 >= 8) ? 'День' : 'Ночь' // +3 для Москвы
  };
}

// Функция для получения пути к файлу архива по дате
function getArchivePathByDate(date) {
  const dataDir = path.join(__dirname, '..', 'data');
  
  // Создаем папку data, если она не существует
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Формируем имя файла с датой
  return path.join(dataDir, `archive_${date}.json`);
}

// Функция для записи события в архив
function archiveEvent(kn, factWeight, recipeName = '') {
  const utc = getUtcDateParts();
  const dailyArchivePath = getArchivePathByDate(utc.date);
  
  // Загружаем существующий архив или создаем новый
  let archive = [];
  if (fs.existsSync(dailyArchivePath)) {
    try {
      const data = fs.readFileSync(dailyArchivePath, 'utf8');
      archive = JSON.parse(data);
    } catch (e) {
      console.error(`[Ошибка] При чтении файла архива ${dailyArchivePath}: ${e.message}`);
      // Создаем резервную копию поврежденного файла
      const backupPath = `${dailyArchivePath}.backup.${Date.now()}`;
      fs.copyFileSync(dailyArchivePath, backupPath);
    }
  }
  
  // Добавляем новое событие
  archive.push({
    kneader: kn.name,
    address: kn.modbusAddress,
    weight: factWeight,
    recipeWeight: kn.recipeWeight || factWeight,
    recipeName: recipeName,
    timestamp: utc.timestamp,
    shift: utc.shift,
    date: utc.date,
    hour: new Date(utc.timestamp).getHours() // Добавляем час для отчетов по часам
  });
  
  // Сохраняем файл
  fs.writeFileSync(dailyArchivePath, JSON.stringify(archive, null, 2));
  
  // Больше не сохраняем в общий архив, чтобы избежать дублирования
  // Все данные теперь хранятся только в файлах по датам (archive_YYYY-MM-DD.json)
  console.log(`[Архив] Событие сохранено в файл ${dailyArchivePath}`);
  
  // При необходимости можно добавить миграцию данных из общего архива в файлы по датам
}

// Функция для определения названия рецепта по весу
function getRecipeName(weight) {
  try {
    // Проверяем существование файла рецептов
    if (!fs.existsSync(recipesPath)) {
      return 'без рецепта';
    }
    
    const recipesData = fs.readFileSync(recipesPath, 'utf8');
    if (!recipesData || recipesData.trim() === '') {
      return 'без рецепта';
    }
    
    const recipes = JSON.parse(recipesData).recipes;
    if (!recipes || !Array.isArray(recipes) || recipes.length === 0) {
      return 'без рецепта';
    }
    
    for (const recipe of recipes) {
      if (weight >= recipe.minWeight && weight <= recipe.maxWeight) {
        return recipe.name;
      }
    }
    
    // Если подходящий рецепт не найден
    return 'без рецепта';
  } catch (e) {
    console.error(`[Ошибка] При определении рецепта: ${e.message}`);
    return 'без рецепта';
  }
}

// Храним последние состояния для фиксации только новых событий
const lastStates = {};

// Флаги для отслеживания процесса дозации
const dosingStates = {};

// Храним текущие данные всех тестомесов для API
const currentStates = {};

// Счетчик ошибок для ограничения вывода в консоль
let errorCounter = 0;
const MAX_ERRORS_TO_SHOW = 5; // Максимальное количество ошибок для показа

// Статистика по времени опроса каждого устройства
const deviceStats = {};

// Функция задержки для асинхронного кода
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Функция для вычисления оптимальной задержки между опросами устройства
function getOptimalDeviceDelay(unitId) {
  // Если нет статистики по устройству, используем базовую задержку
  if (!deviceStats[unitId] || !deviceStats[unitId].avgResponseTime) {
    return 50; // Базовая задержка между опросами устройств
  }
  
  // Вычисляем задержку на основе среднего времени ответа
  // Чем дольше отвечает устройство, тем больше задержка
  const avgTime = deviceStats[unitId].avgResponseTime;
  
  // Минимальная задержка - 20 мс, максимальная - 100 мс
  return Math.min(Math.max(avgTime / 10, 20), 100);
}
// Основной цикл опроса
async function pollAll() {
  try {
    // Перезагрузка настроек при каждом цикле
    try {
      kneaders = JSON.parse(fs.readFileSync(kneadersPath, 'utf8')).kneaders;
    } catch (configError) {
      console.error(`[Ошибка] Не удалось загрузить настройки тестомесов:`, configError.message);
    }
    
    // Если соединение потеряно, пробуем переподключиться
    if (!connected) {
      console.log(`[Опрос] Попытка переподключения...`);
      await connectModbus();
    }
    
    // Задержка перед началом опроса для стабилизации соединения
    await delay(20); // Уменьшенная задержка для более быстрого опроса
    
    // Сортируем устройства по приоритету (успешные опросы)
    const sortedKneaders = [...kneaders].sort((a, b) => {
      const statsA = deviceStats[a.modbusAddress];
      const statsB = deviceStats[b.modbusAddress];
      
      if (!statsA && !statsB) return 0;
      if (!statsA) return 1;
      if (!statsB) return -1;
      
      // Приоритет по соотношению успешных опросов
      const successRateA = statsA.successCount / (statsA.count || 1);
      const successRateB = statsB.successCount / (statsB.count || 1);
      
      return successRateB - successRateA;
    });
    
    // Опрашиваем устройства с оптимальными задержками
    for (const kn of sortedKneaders) {
      try {
        // Используем оптимальную задержку перед опросом
        const deviceDelay = getOptimalDeviceDelay(kn.modbusAddress);
        await delay(deviceDelay);
        
        const res = await pollKneader(kn);
        
        if (res.error) {
          if (errorCounter < MAX_ERRORS_TO_SHOW) {
            console.error(`[Ошибка] Тестомес ${kn.name}: ${res.error}`);
            errorCounter++;
          }
          continue;
        }
        
        if (res.errCurrent || res.errRecipe || res.errReady) {
          if (errorCounter < MAX_ERRORS_TO_SHOW) {
            console.error(`[Ошибка] Тестомес ${kn.name}: Ошибки чтения регистров`);
            if (res.errCurrent) console.error(`  - Текущий вес: ${res.errCurrent}`);
            if (res.errRecipe) console.error(`  - Рецептурный вес: ${res.errRecipe}`);
            if (res.errReady) console.error(`  - Готовность: ${res.errReady}`);
            errorCounter++;
          }
          
          // Даже при ошибке устанавливаем статус для карточки
          // Используем проверку на undefined вместо || для корректной обработки нулевых значений
          currentStates[kn.modbusAddress] = {
            name: kn.name,
            address: kn.modbusAddress,
            currentWeight: res.currentWeight !== undefined ? res.currentWeight : 0,
            recipeWeight: res.recipeWeight !== undefined ? res.recipeWeight : 0,
            ready: res.ready !== undefined ? res.ready : 0,
            timestamp: new Date().toISOString(),
            connected: false, // Отмечаем, что есть проблемы с соединением
            responseTime: 0,
            error: true
          };
        } else {
          // Сбрасываем счетчик ошибок при успешном опросе
          errorCounter = 0;
          
          // Сохраняем текущее состояние для API
          // Гарантируем, что значения не будут undefined
          // Защита от undefined и NaN
          const safeCurrentWeight = (typeof res.currentWeight === 'number' && !isNaN(res.currentWeight)) ? res.currentWeight : 0;
          const safeRecipeWeight = (typeof res.recipeWeight === 'number' && !isNaN(res.recipeWeight)) ? res.recipeWeight : 0;
          const safeReady = (typeof res.ready === 'number' && !isNaN(res.ready)) ? res.ready : 0;
          currentStates[kn.modbusAddress] = {
            name: kn.name,
            address: kn.modbusAddress,
            currentWeight: safeCurrentWeight,
            recipeWeight: safeRecipeWeight,
            ready: safeReady,
            timestamp: new Date().toISOString(),
            connected: true,
            responseTime: res.responseTime || 0 // Без pollDuration, если он не определён
          };
          
          // Проверяем событие дозации по новому алгоритму
          // 1. Если вес приблизился к рецептурному (в пределах 0.1%)
          // 2. Или если вес резко уменьшился после достижения близкого к рецептурному
          
          // Инициализируем состояние дозации, если его еще нет
          if (!dosingStates[kn.modbusAddress]) {
            dosingStates[kn.modbusAddress] = {
              reachedThreshold: false,
              maxWeight: 0,
              recipeWeight: res.recipeWeight
            };
          }
          
          const dosingState = dosingStates[kn.modbusAddress];
          const lastState = lastStates[kn.modbusAddress] || { currentWeight: 0, ready: 0 };
          
          // Обновляем рецептурный вес, если он изменился
          if (dosingState.recipeWeight !== res.recipeWeight) {
            dosingState.recipeWeight = res.recipeWeight;
            dosingState.reachedThreshold = false;
            dosingState.maxWeight = 0;
          }
          
          // Вычисляем порог для считания веса близким к рецептурному (0.1%)
          const thresholdDiff = res.recipeWeight * 0.001;
          
          // Обновляем максимальный достигнутый вес
          if (res.currentWeight > dosingState.maxWeight) {
            dosingState.maxWeight = res.currentWeight;
          }
          
          // Проверяем, достиг ли вес порогового значения
          if (Math.abs(res.currentWeight - res.recipeWeight) <= thresholdDiff) {
            dosingState.reachedThreshold = true;
          }
          
          // Проверяем условия для фиксации события дозации:
          // 1. Вес ранее достиг порогового значения
          // 2. Текущий вес резко уменьшился (меньше половины рецептурного)
          // 3. Это новое событие (не было зафиксировано ранее)
          if (dosingState.reachedThreshold && 
              res.currentWeight < (res.recipeWeight / 2) && 
              lastState.currentWeight > res.currentWeight && 
              dosingState.maxWeight >= (res.recipeWeight - thresholdDiff)) {
            
            // Получаем название рецепта
            const recipeName = getRecipeName(res.recipeWeight);
            
            console.log(`[Событие] Тестомес ${kn.name}: Зафиксирована дозация с весом ${dosingState.maxWeight} (рецепт: ${res.recipeWeight}, ${recipeName})`);
            
            // Защита от undefined
            const safeWeight = (typeof dosingState.maxWeight === 'number' && !isNaN(dosingState.maxWeight)) ? dosingState.maxWeight : 0;
            const safeRecipeWeight = (typeof res.recipeWeight === 'number' && !isNaN(res.recipeWeight)) ? res.recipeWeight : 0;
            // Записываем событие в архив
            archiveEvent({
              ...kn,
              recipeWeight: safeRecipeWeight
            }, safeWeight, recipeName);
            
            // Сбрасываем состояние дозации
            dosingState.reachedThreshold = false;
            dosingState.maxWeight = 0;
          }
          
          // Традиционный способ фиксации события (для обратной совместимости)
          if (res.currentWeight === res.recipeWeight &&
              res.ready === 1 &&
              (!lastState || lastState.currentWeight !== res.currentWeight || lastState.ready !== 1)) {
            
            const recipeName = getRecipeName(res.recipeWeight);
            console.log(`[Событие] Тестомес ${kn.name}: Зафиксировано событие с весом ${res.currentWeight} (рецепт: ${recipeName})`);
            archiveEvent(kn, res.currentWeight, recipeName);
          }
          
          // Сохраняем текущее состояние
          lastStates[kn.modbusAddress] = { currentWeight: res.currentWeight, ready: res.ready };
        }
      } catch (knError) {
        if (errorCounter < MAX_ERRORS_TO_SHOW) {
          console.error(`[Ошибка] При опросе тестомеса ${kn.name}: ${knError.message}`);
          errorCounter++;
        }
        
        // Если ошибка связана с потерей соединения
        if (knError.message.includes('Port is closed') || knError.message.includes('Connection timed out')) {
          connected = false;
          await delay(500); // Дополнительная задержка перед переподключением
          break; // Прерываем цикл, чтобы переподключиться в следующем цикле
        }
      }
    }
    
  } catch (error) {
    if (errorCounter < MAX_ERRORS_TO_SHOW) {
      console.error(`[Ошибка] В цикле опроса: ${error.message}`);
      errorCounter++;
    }
    connected = false; // Сбрасываем флаг соединения при ошибке
  }
}

// Базовый интервал опроса из настроек
const basePollingInterval = settings.modbus.poolingTime || 5000; // Используем poolingTime из настроек или 5000 мс по умолчанию

// Функция для адаптивного опроса с учетом времени выполнения
async function adaptivePolling() {
  let lastPollTime = Date.now();
  let currentInterval = basePollingInterval;
  
  let consecutiveSuccessfulPolls = 0; // Счетчик успешных опросов подряд
  let consecutiveErrorPolls = 0; // Счетчик ошибочных опросов подряд
  
  // Бесконечный цикл опроса с обработкой ошибок
  while (true) {
    try {
      // Запуск опроса с обработкой ошибок
      try {
        await pollAll();
        // Успешный опрос
        consecutiveSuccessfulPolls++;
        consecutiveErrorPolls = 0;
      } catch (pollError) {
        // Ошибка при опросе
        console.error(`[Ошибка опроса] ${pollError.message}`);
        consecutiveErrorPolls++;
        consecutiveSuccessfulPolls = 0;
      }
      
      // Вычисляем время, которое занял опрос
      const now = Date.now();
      const pollDuration = now - lastPollTime;
      
      // Вычисляем оптимальную задержку на основе статистики
      let nextDelay = basePollingInterval;
      
      // Если есть статистика по устройствам, используем ее
      if (Object.keys(deviceStats).length > 0) {
        // Вычисляем среднее время ответа по всем устройствам
        const avgResponseTimes = Object.values(deviceStats).map(s => s.avgResponseTime);
        const avgResponseTime = avgResponseTimes.reduce((a, b) => a + b, 0) / avgResponseTimes.length;
        
        // Вычисляем процент успешных опросов
        const totalPolls = Object.values(deviceStats).reduce((sum, s) => sum + s.count, 0);
        const successPolls = Object.values(deviceStats).reduce((sum, s) => sum + s.successCount, 0);
        const successRate = totalPolls > 0 ? successPolls / totalPolls : 0;
        
        // Адаптивная задержка на основе успешности опросов и времени ответа
        const maxInterval = basePollingInterval * 2;
        
        // Если высокий процент успешных опросов, уменьшаем задержку
        if (successRate > 0.9) {
          consecutiveSuccessfulPolls++;
          consecutiveErrorPolls = 0;
          
          // Чем больше успешных опросов подряд, тем меньше задержка
          const successFactor = Math.min(consecutiveSuccessfulPolls / 5, 1); // Максимум 5 успешных опросов для максимального эффекта
          nextDelay = Math.max(basePollingInterval * (1 - successFactor * 0.5), basePollingInterval * 0.5);
        } else {
          // Если есть ошибки, увеличиваем задержку
          consecutiveErrorPolls++;
          consecutiveSuccessfulPolls = 0;
          
          // Чем больше ошибок подряд, тем больше задержка
          const errorFactor = Math.min(consecutiveErrorPolls / 3, 1); // Максимум 3 ошибки подряд для максимального эффекта
          nextDelay = Math.min(basePollingInterval * (1 + errorFactor), maxInterval);
        }
        
        // Добавляем время опроса к задержке, но не более максимального интервала
        nextDelay = Math.min(nextDelay + pollDuration * 0.5, maxInterval);
      } else {
        // Если нет статистики, используем базовый алгоритм
        const maxInterval = basePollingInterval * 1.5;
        nextDelay = Math.min(basePollingInterval + pollDuration, maxInterval);
      }
      
      // Логируем информацию о времени опроса и следующей задержке
      if (pollDuration > basePollingInterval * 11) {
        console.log(`[Инфо] Время опроса: ${pollDuration} мс, следующий опрос через: ${nextDelay} мс`);
      }
      
      // Запоминаем время начала следующего опроса
      lastPollTime = now;
      
      // Ждем до следующего опроса
      await delay(nextDelay);
    } catch (error) {
      console.error(`[Ошибка] В адаптивном цикле опроса: ${error.message}`);
      consecutiveErrorPolls++;
      consecutiveSuccessfulPolls = 0;
      await delay(basePollingInterval); // При ошибке используем базовый интервал
    }
  }
}

// Функция для гарантированной записи данных в файл
function ensureDataSaved() {
  try {
    const dataDir = path.join(__dirname, '..', 'data');
    
    // Проверяем существование папки для данных
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Проверяем и восстанавливаем все файлы архива с датами
    const files = fs.readdirSync(dataDir);
    const archiveFiles = files.filter(file => file.startsWith('archive_') && file.endsWith('.json'));
    
    // Проверяем целостность каждого файла
    for (const file of archiveFiles) {
      const filePath = path.join(dataDir, file);
      try {
        const data = fs.readFileSync(filePath, 'utf8');
        JSON.parse(data); // Проверка, что это валидный JSON
      } catch (e) {
        // Файл архива поврежден, создаем резервную копию и новый файл
        // Создаем резервную копию поврежденного файла
        const backupPath = `${filePath}.backup.${Date.now()}`;
        fs.copyFileSync(filePath, backupPath);
        
        // Создаем новый файл
        fs.writeFileSync(filePath, '[]', 'utf8');
      }
    }
    
    // Проверяем существование файла архива для текущего дня
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10); // Формат YYYY-MM-DD
    const todayArchivePath = getArchivePathByDate(todayStr);
    
    if (!fs.existsSync(todayArchivePath)) {
      // Создаем новый файл архива для сегодняшнего дня
      fs.writeFileSync(todayArchivePath, '[]', 'utf8');
    }
    
    // Все данные теперь хранятся только в файлах по датам
    
    // Данные успешно сохранены
    return true;
  } catch (error) {
    // Ошибка при сохранении данных
    return false;
  }
}

// Функция для периодического сохранения данных (каждый час)
function setupPeriodicSaving() {
  // Проверяем и сохраняем данные каждый час
  setInterval(() => {
    const now = new Date();
    // Периодическое сохранение данных
    ensureDataSaved();
  }, 60 * 60 * 1000); // Каждый час
  
  // Также сохраняем данные при завершении работы приложения
  process.on('SIGINT', () => {
    // Получен сигнал завершения работы
    ensureDataSaved();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    // Получен сигнал завершения работы
    ensureDataSaved();
    process.exit(0);
  });
  
  // Для обработки необработанных исключений
  process.on('uncaughtException', (err) => {
    // Необработанное исключение
    ensureDataSaved();
    process.exit(1);
  });
}

// Запуск периодического сохранения данных
setupPeriodicSaving();

// Запуск адаптивного опроса
adaptivePolling();

// Экспортируем функцию опроса и текущие состояния тестомесов
module.exports = { pollAll, currentStates };

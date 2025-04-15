const express = require('express');
const fs = require('fs');
const path = require('path');

// Пути к файлам
const dataDir = path.join(__dirname, '../data');
const archivePath = path.join(dataDir, 'archive.json');
const kneadersPath = path.join(__dirname, '../config/kneaders.json');
const recipesPath = path.join(__dirname, '../config/recipes.json'); // Вернули путь к файлу рецептов в config

// Функция для получения пути к файлу архива по дате
function getArchivePathByDate(date) {
  return path.join(dataDir, `archive_${date}.json`);
}

// Функция для получения данных из файла архива
async function getArchiveData(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error(`[Ошибка] При чтении файла архива ${filePath}: ${e.message}`);
    return [];
  }
}

// Импортируем текущие состояния тестомесов из модуля опроса
const { currentStates } = require('../modbus/poller');

// Храним список активных SSE-клиентов
const sseClients = [];

// Отправка данных всем подключенным клиентам
function sendDataToAllClients() {
  const states = Object.values(currentStates);
  sseClients.forEach(client => {
    client.res.write(`data: ${JSON.stringify(states)}\n\n`);
  });
}

// Периодическая отправка данных клиентам (50 мс)
setInterval(sendDataToAllClients, 50);

// Функция для получения данных за определенный период
async function getDataForPeriod(startDate, endDate) {
  try {
    // Преобразуем строки в объекты Date
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Получаем все даты в диапазоне
    const dates = [];
    const currentDate = new Date(start);
    
    while (currentDate <= end) {
      dates.push(currentDate.toISOString().slice(0, 10));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Собираем данные из всех файлов за указанные даты
    let allData = [];
    
    for (const date of dates) {
      const filePath = getArchivePathByDate(date);
      const data = await getArchiveData(filePath);
      allData = allData.concat(data);
    }
    
    return allData;
  } catch (e) {
    console.error(`[Ошибка] При получении данных за период: ${e.message}`);
    return [];
  }
}

module.exports = function(app) {
  // Получить архив: агрегировать все архивные файлы (archive_YYYY-MM-DD.json)
  app.get('/api/archive', async (req, res) => {
    try {
      const files = fs.readdirSync(dataDir);
      const archiveFiles = files.filter(file => file.startsWith('archive_') && file.endsWith('.json'));
      let allData = [];
      for (const file of archiveFiles) {
        const filePath = path.join(dataDir, file);
        try {
          const data = fs.readFileSync(filePath, 'utf8');
          allData = allData.concat(JSON.parse(data));
        } catch (e) {
          console.error(`[Ошибка] Не удалось прочитать архив ${file}: ${e.message}`);
        }
      }
      // Для обратной совместимости: если нет новых архивов, возвращаем старый общий архив
      if (!allData.length && fs.existsSync(archivePath)) {
        const data = fs.readFileSync(archivePath, 'utf8');
        allData = JSON.parse(data);
      }
      res.json(allData);
    } catch (e) {
      res.status(500).json({ error: `Ошибка при получении архива: ${e.message}` });
    }
  });
  
  // Получить архив за конкретный день
  app.get('/api/reports/daily/:date', async (req, res) => {
    try {
      const date = req.params.date; // Формат YYYY-MM-DD
      const filePath = getArchivePathByDate(date);
      const data = await getArchiveData(filePath);
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: `Ошибка при получении отчета за день: ${e.message}` });
    }
  });
  
  // Получить архив за неделю
  app.get('/api/reports/weekly/:startDate/:endDate', async (req, res) => {
    try {
      const { startDate, endDate } = req.params;
      const data = await getDataForPeriod(startDate, endDate);
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: `Ошибка при получении отчета за неделю: ${e.message}` });
    }
  });
  
  // Получить архив за месяц
  app.get('/api/reports/monthly/:year/:month', async (req, res) => {
    try {
      const { year, month } = req.params;
      
      // Вычисляем первый и последний день месяца
      const firstDay = new Date(parseInt(year), parseInt(month) - 1, 1);
      const lastDay = new Date(parseInt(year), parseInt(month), 0);
      
      const startDate = firstDay.toISOString().slice(0, 10);
      const endDate = lastDay.toISOString().slice(0, 10);
      
      const data = await getDataForPeriod(startDate, endDate);
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: `Ошибка при получении отчета за месяц: ${e.message}` });
    }
  });
  
  // Получить список доступных дат с архивами
  app.get('/api/reports/available-dates', (req, res) => {
    try {
      const files = fs.readdirSync(dataDir);
      const archiveFiles = files.filter(file => file.startsWith('archive_') && file.endsWith('.json'));
      
      // Извлекаем даты из имен файлов
      const dates = archiveFiles.map(file => {
        const match = file.match(/archive_(.+)\.json/);
        return match ? match[1] : null;
      }).filter(date => date !== null);
      
      res.json(dates);
    } catch (e) {
      res.status(500).json({ error: `Ошибка при получении списка доступных дат: ${e.message}` });
    }
  });

  // Получить список тестомесов
  app.get('/api/kneaders', (req, res) => {
    fs.readFile(kneadersPath, 'utf8', (err, data) => {
      if (err) return res.status(500).json({ error: 'Ошибка чтения настроек' });
      res.json(JSON.parse(data));
    });
  });
  
  // Получить список рецептов
  app.get('/api/recipes', (req, res) => {
    try {
      // Проверяем существование файла рецептов
      if (!fs.existsSync(recipesPath)) {
        // Если файл не существует, создаем его с пустым массивом рецептов
        fs.writeFileSync(recipesPath, JSON.stringify({ recipes: [] }, null, 2), 'utf8');
        console.log(`[Инфо] Создан новый файл рецептов: ${recipesPath}`);
        return res.json({ recipes: [] });
      }
      
      fs.readFile(recipesPath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Ошибка чтения рецептов' });
        try {
          const recipes = JSON.parse(data);
          res.json(recipes);
        } catch (e) {
          // Если файл поврежден, создаем новый
          fs.writeFileSync(recipesPath, JSON.stringify({ recipes: [] }, null, 2), 'utf8');
          res.json({ recipes: [] });
        }
      });
    } catch (e) {
      res.status(500).json({ error: `Ошибка при получении рецептов: ${e.message}` });
    }
  });
  
  // Получить текущее состояние тестомесов (данные с Modbus)
  app.get('/api/kneaders/state', (req, res) => {
    // Преобразуем объект в массив для удобства использования на клиенте
    const states = Object.values(currentStates);
    res.json(states);
  });
  
  // Server-Sent Events (SSE) для получения данных в реальном времени
  app.get('/api/kneaders/events', (req, res) => {
    // Настройка заголовков для SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    
    // Отправка начальных данных
    const states = Object.values(currentStates);
    res.write(`data: ${JSON.stringify(states)}\n\n`);
    
    // Добавление клиента в список
    const clientId = Date.now();
    const newClient = { id: clientId, res };
    sseClients.push(newClient);
    
    // Обработка закрытия соединения
    req.on('close', () => {
      console.log(`[SSE] Клиент отключился`);
      const index = sseClients.findIndex(client => client.id === clientId);
      if (index !== -1) {
        sseClients.splice(index, 1);
      }
    });
  });

  // Получить список рецептов
  app.get('/api/recipes', (req, res) => {
    fs.readFile(recipesPath, 'utf8', (err, data) => {
      if (err) return res.status(500).json({ error: 'Ошибка чтения рецептов' });
      res.json(JSON.parse(data));
    });
  });

  // Сохранить рецепты
  app.post('/api/recipes', (req, res) => {
    const recipes = req.body;
    fs.writeFile(recipesPath, JSON.stringify(recipes, null, 2), err => {
      if (err) return res.status(500).json({ error: 'Ошибка записи рецептов' });
      res.json({ success: true });
    });
  });

  // Добавить запись в архив
  app.post('/api/archive', (req, res) => {
    const record = req.body;
    fs.readFile(archivePath, 'utf8', (err, data) => {
      if (err) return res.status(500).json({ error: 'Ошибка чтения архива' });
      let archive = JSON.parse(data);
      archive.push(record);
      fs.writeFile(archivePath, JSON.stringify(archive, null, 2), err => {
        if (err) return res.status(500).json({ error: 'Ошибка записи архива' });
        res.json({ success: true });
      });
    });
  });

  // Обновить список тестомесов
  app.post('/api/kneaders', (req, res) => {
    const { kneaders } = req.body;
    fs.writeFile(kneadersPath, JSON.stringify({ kneaders }, null, 2), err => {
      if (err) return res.status(500).json({ error: 'Ошибка записи настроек' });
      res.json({ success: true });
    });
  });

  // Экспорт отчёта в XLS
  app.post('/api/report-xls', async (req, res) => {
    const ExcelJS = require('exceljs');
    const data = req.body.data;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Отчёт');
    sheet.columns = [
      { header: 'Тестомес', key: 'kneader', width: 20 },
      { header: 'Адрес', key: 'address', width: 10 },
      { header: 'Вес (кг)', key: 'weight', width: 12 },
      { header: 'Дата', key: 'date', width: 14 },
      { header: 'Смена', key: 'shift', width: 10 },
      { header: 'Время', key: 'time', width: 10 }
    ];
    data.forEach(r => {
      sheet.addRow({
        kneader: r.kneader,
        address: r.address,
        weight: r.weight,
        date: r.date,
        shift: r.shift,
        time: r.timestamp ? r.timestamp.slice(11, 19) : ''
      });
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  });
};

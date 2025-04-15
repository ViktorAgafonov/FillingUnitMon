const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// Импорт маршрутов
require('./routes/api')(app);
require('./routes/web')(app);

// Запуск опроса Modbus с обработкой ошибок
try {
  require('./modbus/poller');
} catch (error) {
  console.error('Ошибка при запуске модуля опроса:', error);
}

app.listen(PORT, () => {
  // Сервер запущен без логирования
});

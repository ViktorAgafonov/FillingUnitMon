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

// Запуск опроса Modbus
require('./modbus/poller');

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});

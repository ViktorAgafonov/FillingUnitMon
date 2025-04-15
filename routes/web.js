const express = require('express');
const path = require('path');

module.exports = function(app) {
  app.get('/', (req, res) => {
    res.render('index');
  });
  app.get('/settings', (req, res) => {
    res.render('settings');
  });
  app.get('/report', (req, res) => {
    res.render('report');
  });
};

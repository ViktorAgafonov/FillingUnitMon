// recipes.js — UI для управления рецептами на странице настроек
// Комментарии и пояснения на русском языке

let recipes = [];

// Загрузка и отображение рецептов
async function loadRecipes() {
  const res = await fetch('/api/recipes');
  recipes = await res.json();
  renderRecipes();
}

function renderRecipes() {
  const block = document.getElementById('recipes-settings-block');
  block.innerHTML = '';
  recipes.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'recipe-card settings-card';
    div.innerHTML = `
      <div class="stat-row"><span class="stat-label">Название:</span>
        <input type="text" value="${r.name}" data-idx="${i}" class="recipe-name-input" />
      </div>
      <div class="stat-row"><span class="stat-label">Мин. вес (кг):</span>
        <input type="number" value="${r.minWeight}" data-idx="${i}" class="recipe-min-input" />
      </div>
      <div class="stat-row"><span class="stat-label">Макс. вес (кг):</span>
        <input type="number" value="${r.maxWeight}" data-idx="${i}" class="recipe-max-input" />
      </div>
      <div class="settings-actions">
        <button class="save-btn" onclick="saveRecipe(${i})">Сохранить</button>
        <button class="remove-btn" onclick="removeRecipe(${i})">Удалить</button>
      </div>
    `;
    block.appendChild(div);
  });
}

window.saveRecipe = function(idx) {
  const name = document.querySelector(`.recipe-name-input[data-idx='${idx}']`).value.trim();
  const minWeight = parseFloat(document.querySelector(`.recipe-min-input[data-idx='${idx}']`).value);
  const maxWeight = parseFloat(document.querySelector(`.recipe-max-input[data-idx='${idx}']`).value);
  recipes[idx].name = name;
  recipes[idx].minWeight = minWeight;
  recipes[idx].maxWeight = maxWeight;
  saveAllRecipes('Изменения рецепта сохранены.');
};

window.removeRecipe = function(idx) {
  recipes.splice(idx, 1);
  saveAllRecipes('Рецепт удалён.');
};

window.addRecipe = function() {
  recipes.push({ name: '', minWeight: 0, maxWeight: 0 });
  renderRecipes();
};

function saveAllRecipes(msg) {
  fetch('/api/recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recipes)
  }).then(() => {
    showRecipesMessage(msg);
    loadRecipes();
  });
}

function showRecipesMessage(msg) {
  const el = document.getElementById('recipes-message');
  el.textContent = msg;
  el.style.opacity = 1;
  setTimeout(() => { el.style.opacity = 0; }, 2000);
}

window.addEventListener('DOMContentLoaded', () => {
  loadRecipes();
  document.getElementById('add-recipe-btn').onclick = window.addRecipe;
});

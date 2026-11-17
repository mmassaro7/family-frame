// Data store. Starts with placeholders; js/live.js replaces events, photos, weather and groceries
// with the real thing from the /api routes and Open-Meteo.
window.DATA = (function () {
  var C = window.CONFIG;

  function rgb(hex) {
    var h = hex.replace('#', '');
    return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }).join(' ');
  }
  var people = C.people.map(function (p) {
    return { id: p.id, name: p.name, color: p.color, rgb: rgb(p.color), ink: p.ink || '#FFFFFF' };
  });
  var family = { id: 'family', name: 'Family', color: '#111111', rgb: '17 17 17', ink: '#FFFFFF' };
  var ALL = people.map(function (p) { return p.id; });

  var events = [];

  // ---------------------------------------------------------------- shopping
  var stores = C.stores;
  var cats = ['Produce', 'Bakery', 'Meat & Fish', 'Dairy & Eggs', 'Pantry', 'Frozen', 'Snacks', 'Household'];
  var catOrder = { all: cats };
  stores.forEach(function (s) { catOrder[s.id] = cats; });
  var gid = 0;
  var groceries = [];

  var catalog = [
    ['Apples', 'Produce'], ['Avocados', 'Produce'], ['Bananas', 'Produce'], ['Baby spinach', 'Produce'], ['Blueberries', 'Produce'],
    ['Broccoli', 'Produce'], ['Carrots', 'Produce'], ['Cucumber', 'Produce'], ['Garlic', 'Produce'], ['Grapes', 'Produce'],
    ['Lemons', 'Produce'], ['Limes', 'Produce'], ['Onions', 'Produce'], ['Potatoes', 'Produce'], ['Strawberries', 'Produce'],
    ['Tomatoes', 'Produce'], ['Bread', 'Bakery'], ['Bagels', 'Bakery'], ['Croissants', 'Bakery'], ['Sourdough loaf', 'Bakery'],
    ['Tortillas', 'Bakery'], ['Hamburger buns', 'Bakery'], ['Bacon', 'Meat & Fish'], ['Chicken breasts', 'Meat & Fish'],
    ['Chicken thighs', 'Meat & Fish'], ['Ground beef', 'Meat & Fish'], ['Salmon fillets', 'Meat & Fish'], ['Shrimp', 'Meat & Fish'],
    ['Butter', 'Dairy & Eggs'], ['Cheddar', 'Dairy & Eggs'], ['Cream cheese', 'Dairy & Eggs'], ['Eggs', 'Dairy & Eggs'],
    ['Greek yogurt', 'Dairy & Eggs'], ['Milk 2%', 'Dairy & Eggs'], ['Oat milk', 'Dairy & Eggs'], ['Parmesan', 'Dairy & Eggs'],
    ['Black beans', 'Pantry'], ['Cereal', 'Pantry'], ['Coffee beans', 'Pantry'], ['Flour', 'Pantry'], ['Honey', 'Pantry'],
    ['Maple syrup', 'Pantry'], ['Olive oil', 'Pantry'], ['Pasta sauce', 'Pantry'], ['Peanut butter', 'Pantry'], ['Rice', 'Pantry'],
    ['Rigatoni', 'Pantry'], ['Spaghetti', 'Pantry'], ['Sugar', 'Pantry'], ['Tea', 'Pantry'], ['Frozen peas', 'Frozen'],
    ['Frozen berries', 'Frozen'], ['Ice cream', 'Frozen'], ['Pizza', 'Frozen'], ['Waffles', 'Frozen'], ['Chips', 'Snacks'],
    ['Crackers', 'Snacks'], ['Dark chocolate', 'Snacks'], ['Goldfish crackers', 'Snacks'], ['Granola bars', 'Snacks'],
    ['Popcorn', 'Snacks'], ['Dish soap', 'Household'], ['Dishwasher pods', 'Household'], ['Garbage bags', 'Household'],
    ['Laundry detergent', 'Household'], ['Paper towels', 'Household'], ['Toilet paper', 'Household'], ['Toothpaste', 'Household']
  ];
  var usuals = C.usuals;

  // ---------------------------------------------------------------- weather (index = hours since midnight today, 48 long)
  // Placeholder until Open-Meteo answers.
  function fill(v, n) { var a = []; for (var i = 0; i < n; i++) a.push(v); return a; }
  var weather = { live: false, wet: 'Rain', hi: 60, lo: 45, t: fill(55, 48), c: fill('cloud', 48), p: fill(0, 48), days: [], now: null };

  // ---------------------------------------------------------------- photos
  // Sample photos shown until a Google Drive folder is connected (see SETUP.md).
  var sample = ['sample-lake', 'sample-forest', 'sample-street', 'sample-coast', 'sample-hills', 'sample-garden'];
  var samplePhotos = sample.map(function (s, i) {
    return { id: s, seed: s, o: i % 3 === 2 ? 'p' : 'l', date: (2020 + i) + '-06-1' + i, place: 'Sample photo — connect your Drive folder', tag: s };
  });

  return {
    people: people, family: family, ALL: ALL,
    events: events,
    todos: [],
    stores: stores, catOrder: catOrder, groceries: groceries, catalog: catalog, usuals: usuals,
    weather: weather, photos: [], samplePhotos: samplePhotos,
    _gid: function () { return 'g' + Date.now().toString(36) + (++gid); },
    _eid: function () { return 'e' + Date.now().toString(36); }
  };
})();

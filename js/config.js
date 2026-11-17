// ─────────────────────────────────────────────────────────────────────────────
//  YOUR FAMILY — edit this file.  (Calendar URLs, photo folder and API keys are
//  secrets and live in Vercel environment variables, NOT here. See SETUP.md.)
// ─────────────────────────────────────────────────────────────────────────────
window.CONFIG = {
  // Used for the weather. Find yours at https://www.latlong.net
  location: { lat: 40.71, lon: -74.01, units: 'fahrenheit' }, // New York, NY: put your own; 'fahrenheit' | 'celsius'

  // Everyone who gets a color-coded lane on the calendar.
  //  id    – short lowercase id. The CALENDARS env var in Vercel refers to these.
  //  color – the person's color;  ink – text color on top of it ('#FFFFFF' or '#111111')
  people: [
    { id: 'alex',    name: 'Alex',    color: '#FFB000', ink: '#111111' },  // yellow
    { id: 'jordan',   name: 'Jordan',   color: '#E02424', ink: '#FFFFFF' },  // red
    { id: 'riley',   name: 'Riley',   color: '#FF69B4', ink: '#111111' },  // pink
    { id: 'casey', name: 'Casey', color: '#2D5BFF', ink: '#FFFFFF' }   // blue
  ],

  // Stores for the shopping list. The first one is the default for new items.
  stores: [
    { id: 'kroger', name: 'Kroger' },
    { id: 'sams',   name: "Sam's Club" }
  ],

  // One-tap "Usuals" tiles on the shopping screen.
  usuals: ['Milk', 'Eggs', 'Bananas', 'Bread', 'Apples', 'Coffee', 'Yogurt', 'Cheddar', 'Butter', 'Spinach', 'Chicken', 'Paper towels'],

  // Slideshow timing (milliseconds)
  slideInterval: { photos: 15000, home: 12000, ambient: 14000 },

  // Seconds of no touching before the frame returns to Today, then goes to full-screen photos.
  idle: { home: 60, ambient: 120 },

  // Morning tour: between these times (24-hour clock), instead of the photo clock the idle frame shows
  // Today, each calendar view, Shopping, To Do, Weather and Photos for this many seconds each, on a loop.
  tour: { start: '5:00', end: '7:00', seconds: 60 }
};

// Alexa skill "List Keeper": adds things to the frame's To Do list or shopping list by voice.
//
//   "Alexa, ask List Keeper we need batteries"           (or: pick up batteries / we are out of batteries)
//   "Alexa, ask List Keeper to add task fix the gate"    (or: new task / add chore / we have to fix the gate)
//   Once the skill is open you can also say "add batteries to the shopping list".
//
// No libraries needed. Paste this whole file over lambda/index.js in your Alexa-hosted skill,
// then fill in the two lines marked EDIT below. See docs/ALEXA.md.
'use strict';
const http = require('http');
const https = require('https');

// ---- EDIT these two lines ---------------------------------------------------------------
const SITE = process.env.SITE_URL || 'https://YOUR-SITE.netlify.app';   // your frame's web address
const ADD_KEY = process.env.ADD_KEY || 'PASTE-YOUR-ADD-KEY-HERE';           // the ADD_KEY from Netlify
// -----------------------------------------------------------------------------------------

const say = (text, end = true, reprompt) => {
  const r = { version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: end } };
  if (reprompt) r.response.reprompt = { outputSpeech: { type: 'PlainText', text: reprompt } };
  return r;
};

// Ask the frame's web address to add one item; resolves to { status, body }.
function callFrame(path, item) {
  const url = new URL(SITE.replace(/\/+$/, '') + path);
  url.searchParams.set('key', ADD_KEY);
  url.searchParams.set('add', item);
  url.searchParams.set('source', 'alexa');
  const lib = url.protocol === 'http:' ? http : https;
  return new Promise((resolve) => {
    const req = lib.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { let body = {}; try { body = JSON.parse(data); } catch (e) { /* not JSON */ } resolve({ status: res.statusCode, body }); });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: {} }); });
    req.on('error', () => resolve({ status: 0, body: {} }));
  });
}

function clean(value, dropArticle) {
  let s = String(value || '').replace(/[.?!,]+$/g, '').trim();
  if (dropArticle) s = s.replace(/^(the|a|an|some|more)\s+/i, '');
  return s;
}

const LISTS = {
  AddTodoIntent: { path: '/api/todo', name: 'to do list', dropArticle: false },
  AddShoppingIntent: { path: '/api/shopping', name: 'shopping list', dropArticle: true },
};

async function addItem(intent) {
  const list = LISTS[intent.name];
  const item = clean(intent.slots && intent.slots.item && intent.slots.item.value, list.dropArticle);
  if (!item) return say(`I didn't catch what to add to the ${list.name}. Try again.`, false, 'What should I add?');
  const r = await callFrame(list.path, item);
  if (r.status === 200 && r.body && r.body.message) return say(r.body.message + '.');
  if (r.status === 401 || r.status === 403) return say("I couldn't sign in to your frame. Check the key in the skill.");
  if (r.status === 501) return say("The frame's list isn't set up yet.");
  return say("The frame didn't answer. Please try again in a minute.");
}

exports.handler = async (event) => {
  const req = (event && event.request) || {};
  if (req.type === 'LaunchRequest') {
    return say('List Keeper. You can say, we need batteries, or, add task fix the gate.', false,
      'Try, we need milk.');
  }
  if (req.type === 'IntentRequest') {
    const intent = req.intent || {};
    if (LISTS[intent.name]) return addItem(intent);
    switch (intent.name) {
      case 'AMAZON.HelpIntent':
        return say('You can say, we need batteries, or, add task fix the gate. You can also say, add milk to the shopping list. What would you like to add?', false,
          'What would you like to add?');
      case 'AMAZON.StopIntent':
      case 'AMAZON.CancelIntent':
      case 'AMAZON.NavigateHomeIntent':
        return say('Okay.');
      default:
        return say('Sorry, I can only add things to the to do list or the shopping list. Try, we need milk, or, add task fix the gate.', false,
          'What would you like to add?');
    }
  }
  return { version: '1.0', response: { shouldEndSession: true } };   // SessionEndedRequest etc.
};

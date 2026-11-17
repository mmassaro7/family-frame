// Run with: node scripts/test-alexa.mjs
// Starts the local mock server, then plays Alexa requests into alexa/lambda/index.js exactly as Alexa would.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
const loadHandler = () => { delete nodeRequire.cache[nodeRequire.resolve('../alexa/lambda/index.js')]; return nodeRequire('../alexa/lambda/index.js').handler; };
import fs from 'node:fs';

const PORT = 5198;
const server = spawn(process.execPath, ['scripts/dev-server.mjs', '--mock'], { env: { ...process.env, PORT: String(PORT), FRAME_KEY: 'secret', ADD_KEY: 'addonly' }, stdio: 'ignore' });
try {
  for (let i = 0; ; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/todo?key=secret`); break; } catch { if (i > 50) throw new Error('server did not start'); await new Promise((r) => setTimeout(r, 100)); } }
  process.env.SITE_URL = `http://127.0.0.1:${PORT}`; process.env.ADD_KEY = 'addonly';
  const handler = loadHandler();
  const intent = (name, item) => ({ request: { type: 'IntentRequest', intent: { name, slots: { item: { name: 'item', value: item } } } } });
  const speech = (r) => r.response.outputSpeech && r.response.outputSpeech.text;
  const frame = async (p) => (await (await fetch(`http://127.0.0.1:${PORT}${p}${p.includes('?') ? '&' : '?'}key=secret`)).json());

  let r = await handler({ request: { type: 'LaunchRequest' } });
  assert.match(speech(r), /List Keeper/); assert.match(speech(r), /we need batteries/); assert.equal(r.response.shouldEndSession, false);

  r = await handler(intent('AddTodoIntent', 'fix the gate'));
  assert.equal(speech(r), 'Added "Fix the gate" to the to-do list.'); assert.equal(r.response.shouldEndSession, true);
  assert.deepEqual((await frame('/api/todo')).items.map((i) => [i.text, i.source]), [['Fix the gate', 'alexa']]);

  r = await handler(intent('AddShoppingIntent', 'the batteries'));            // "the" is dropped for groceries
  assert.equal(speech(r), 'Added Batteries to the shopping list.');
  r = await handler(intent('AddShoppingIntent', 'batteries'));
  assert.equal(speech(r), 'Batteries was already on the shopping list. Now two.');
  const shop = await frame('/api/shopping');
  assert.deepEqual(shop.items.map((i) => [i.name, i.qty]), [['Batteries', 2]]);

  r = await handler(intent('AddTodoIntent', 'put the trash out'));             // articles are kept for to-dos
  assert.equal(speech(r), 'Added "Put the trash out" to the to-do list.');

  r = await handler(intent('AddTodoIntent', undefined));                         // Alexa didn't hear the item
  assert.match(speech(r), /didn't catch/); assert.equal(r.response.shouldEndSession, false);

  for (const n of ['AMAZON.HelpIntent', 'AMAZON.FallbackIntent']) assert.equal((await handler(intent(n))).response.shouldEndSession, false);
  for (const n of ['AMAZON.StopIntent', 'AMAZON.CancelIntent']) assert.equal(speech(await handler(intent(n))), 'Okay.');
  assert.equal((await handler({ request: { type: 'SessionEndedRequest' } })).response.shouldEndSession, true);

  // wrong key -> a spoken hint, not a crash
  process.env.ADD_KEY = 'nope';
  const bad = loadHandler();
  assert.match(speech(await bad(intent('AddShoppingIntent', 'milk'))), /couldn't sign in/);
  // frame unreachable -> a spoken hint
  process.env.SITE_URL = 'http://127.0.0.1:1';
  const down = loadHandler();
  assert.match(speech(await down(intent('AddShoppingIntent', 'milk'))), /didn't answer/);

  // the model file: every sample uses the {item} slot once, none is duplicated, both intents exist
  const model = JSON.parse(fs.readFileSync('alexa/interaction-model.json', 'utf8')).interactionModel.languageModel;
  const all = model.intents.flatMap((i) => i.samples || []);
  assert.equal(new Set(all).size, all.length);
  for (const n of ['AddTodoIntent', 'AddShoppingIntent']) {
    const it = model.intents.find((i) => i.name === n);
    assert.ok(it.samples.every((s) => (s.match(/\{item\}/g) || []).length === 1 && !/[^a-z{} ]/.test(s)), n);
  }
  assert.match(model.invocationName, /^[a-z ]+$/);
  console.log('alexa skill tests passed');
} finally { server.kill(); }

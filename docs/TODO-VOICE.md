# To Do list: adding items from anywhere (and by voice, later)

The frame's **To Do** tab is a shared list stored in the same Upstash database as shopping.
Everything that changes it goes through one small web address, `/api/todo`, so a phone page, Siri,
and (later) Alexa all use the same door.

## Phones: scan the QR code and enter the PIN

The To Do tab shows a QR code. A phone scans it, opens `/add.html`, and is asked for the **family PIN** the
first time. After that the phone remembers it (until you tap "Lock this phone" at the bottom of that page).
The QR code holds only the page's address, never a key, so nobody learns anything by photographing the wall.

To turn this on, add a variable `TODO_PIN` in Netlify (and Vercel, if you keep it) with 4 to 8 digits, then redeploy.
* After 5 wrong guesses a phone is locked out for 15 minutes (and there's a limit for everyone together).
* A phone that has entered the PIN can use the to-do list only. It can't see the calendar, photos or shopping list.
* **To sign every phone out**, change `TODO_PIN` and redeploy. Phones are asked for the new PIN the next time.

## Two keys (for links, Siri and voice assistants)

| Key | Variable | What it can do |
| --- | --- | --- |
| Family key | `FRAME_KEY` (already set) | Everything on the frame, including the whole to-do list |
| Add-only key | `ADD_KEY` (optional; the older name `TODO_ADD_KEY` also works) | **Only add items** to the to-do or shopping list. It can't read or change anything else |

Give the **add-only key** to anything outside the house (a voice assistant, an automation service). If it
ever leaks, the worst anyone can do is add junk to the list, and you can change the variable and redeploy.

To create one: in Netlify (and Vercel, if you keep it) add a variable `ADD_KEY` with any long random
text (letters and numbers), then redeploy.

## How to add an item

* **Phone page:** scan the QR code on the To Do tab, or open `https://YOUR-SITE/add.html` and enter the PIN. Save it to your home screen.
  (A link with `?key=FRAME_KEY` on the end skips the PIN. Keep that one private.)
* **A link that adds an item** (works with anything that can open a web address):
  `https://YOUR-SITE/api/todo?key=ADD_KEY&add=Hang%20the%20shelf&who=jordan`
  - `add` = the task (required), `who` = `alex`, `jordan`, `riley`, `casey` or leave it off for anyone,
    `source` = optional label such as `alexa`.
  - The answer is JSON with a `message` you can have spoken back, e.g. `Added "Hang the shelf" to the to-do list`.
  - Adding the same task twice does nothing (`"duplicate": true`), so a voice assistant repeating itself is harmless.
* **The same thing as a POST:** `POST /api/todo?key=ADD_KEY` with `{"action":"add","text":"Hang the shelf","who":"jordan"}`.
* **Shopping list:** `https://YOUR-SITE/api/shopping?key=ADD_KEY&add=batteries` (optional `&store=sams`). Adding something already on the list raises its quantity by one.

## iPhone: "Hey Siri, add to the frame"

1. Shortcuts app → new shortcut → **Ask for Input** (Text, prompt "What needs doing?").
2. **Get Contents of URL** → URL `https://YOUR-SITE/api/todo`, add `?key=ADD_KEY` on the end,
   Method **POST**, Request Body **JSON**: `action` = `add`, `text` = *Provided Input*, `source` = `siri`.
3. Name the shortcut "Add to the frame" and say that to Siri.

## Alexa

Built and ready: see **docs/ALEXA.md** for the click-by-click setup. Say "Alexa, ask List Keeper to
add task fix the gate" or "...we need batteries". The skill's files are in the
`alexa/` folder, and it uses only the add-only key.

(Other routes, if you ever want them: a relay such as Voice Monkey, or a Hubitat rule, can add a *fixed* task
from an Alexa routine. They can't take free speech, which is why the skill is the better fit.)

## What happens to finished items

Checked-off items stay in a "Done" list on the frame (tap one to put it back) and are removed automatically
after 3 days.

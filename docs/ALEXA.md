# Add to the frame by voice with Alexa

Say it to any Echo on your Amazon account:

* "Alexa, ask **List Keeper** we need *batteries*"  (also: "pick up batteries", "we are out of batteries")
* "Alexa, ask **List Keeper** to add task *fix the gate*"  (also: "new task…", "add chore…", "we have to fix the gate")

Alexa answers "Added Batteries to the shopping list" and the item appears on the frame within about 20 seconds.
You can say "ask" or "open" instead of "tell". Shopping items go to Kroger by default.

**Why not "add batteries to the shopping list" in one go?** Alexa has its own shopping and to-do lists, and it grabs
that exact wording before it looks for your skill. So the one-line commands use different words. Once the skill is
open ("Alexa, open List Keeper"), the longer phrases such as "add batteries to the shopping list" or "put fix the
gate on the to do list" work too, and you can keep adding items until you say "stop".

The skill is private: it's built in your own Amazon developer account and works on Echo devices signed in to the same
Amazon account. It doesn't need to be published or reviewed by Amazon.

## 0. Make the add-only key (in Netlify)

1. Netlify → your site → Project configuration → **Environment variables** → add a variable named `ADD_KEY`.
2. Value: a long random mix of letters and numbers (30 or more). **Don't reuse your frame key.**
3. Redeploy the site (Deploys → Trigger deploy → Deploy site). If you also keep the Vercel copy, add it there too.

This key can only *add* items. It can't read your lists, change them, or open your calendar or photos.

## 1. Create the skill

1. Go to <https://developer.amazon.com/alexa/console/ask> and sign in with **the same Amazon account your Echo uses**.
   If asked, finish the free developer registration.
2. Click **Create Skill**.
3. Skill name: `List Keeper`. Primary locale: **English (US)**. Click Next.
4. Type of experience: **Other**. Model: **Custom**. Hosting service: **Alexa-hosted (Node.js)**. Click Next.
5. Template: **Start from Scratch**. Click Next, then **Create skill**. It takes a minute or two.

## 2. Paste in the phrases

1. Open the **Build** tab → **Interaction Model** → **JSON Editor**.
2. Select everything in the editor, delete it, and paste the contents of `alexa/interaction-model.json` from the project.
3. Click **Save Model**, then **Build Model**. Wait for "Full Build Successful".

The skill is called `list keeper` (set in that file). To change it, use **Build → Invocations → Skill Invocation Name**,
save, and build again. Avoid names that sound like Alexa's own features, such as "family calendar".

## 3. Paste in the code

1. Open the **Code** tab and click `lambda/index.js`.
2. Select everything, delete it, and paste the contents of `alexa/lambda/index.js` from the project.
3. Near the top, edit the two marked lines:
   * `SITE` is your frame's address, for example `https://YOUR-SITE.netlify.app`. Put your own.
   * `ADD_KEY`: replace `PASTE-YOUR-ADD-KEY-HERE` with the key from step 0 (keep the quote marks).
4. Click **Save**, then **Deploy**. Wait for the deploy to finish.

(Leave the other files alone. The template's `package.json` is fine.)

## 4. Try it

1. Open the **Test** tab and switch the dropdown at the top from "Off" to **Development**.
2. In the box, type `ask list keeper we need batteries` and press Enter.
   You should see "Added Batteries to the shopping list." Check the frame's Shopping tab.
3. Try the to-do one: `ask list keeper to add task fix the gate`.
4. Then say the same thing to your Echo.

## If something goes wrong

| What Alexa says / does | Likely cause |
| --- | --- |
| "I couldn't sign in to your frame" | The key in step 3 doesn't match `ADD_KEY` in Netlify, or Netlify hasn't been redeployed since you added it |
| "The frame didn't answer" | The site is down, or `SITE` has a typo. Open the address in a browser to check |
| "The frame's list isn't set up yet" | Upstash isn't connected on that site (the shopping and to-do lists both need it) |
| Alexa adds to its own shopping or to-do list | You used "add … to the shopping list" or "put … on the to do list" in one go. Use "we need …" / "add task …" instead, or open the skill first |
| Alexa starts shopping on Amazon ("Finding batteries for you…") | You said "buy …", which Alexa keeps for Amazon. Use "we need …" or "pick up …" |
| Alexa asks "When should I remind you…?" | You said "remember to …", which Alexa keeps for reminders. Use "add task …" instead |
| The item name comes out wrong | Alexa misheard. Say it again a little slower, or edit it on the frame |
| "Sorry, I can only add things..." | The phrasing wasn't recognised. Try "we need …", "pick up …" or "add task …" |

## Notes

* **Changing the key:** change `ADD_KEY` in Netlify, redeploy, and paste the new key into the skill (step 3).
* **Assigning a person by voice** isn't included. Tap the person on the frame afterwards, or ask me to add a follow-up question.
* **Reading the list aloud** ("what's on my shopping list?") isn't included. It would need a read key, which I'd rather not hand to Alexa without you asking.

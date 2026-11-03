# Save to Reel Feed: an iPhone Shortcut for the share menu

Written 02/11/2026. Not tested yet: it cannot be tried from the Mac, and it only works once the page is live at
`https://anonmy8594.github.io/reel-feed/`.

What it does: in TikTok, Instagram, YouTube or Snapchat you tap Share, pick "Save to Reel Feed", and the link opens
Reel Feed with `#add=<the link>`. The page cleans the link (tracking codes off, short links looked up), saves it, and
says "Added to your feed".

## Build it (about 3 minutes)

1. Open the **Shortcuts** app. Tap **+** (top right) to start a new shortcut.
2. Tap the name at the top ("New Shortcut"), choose **Rename**, type `Save to Reel Feed`.
3. Tap the **ⓘ** button at the bottom of the screen, switch on **Show in Share Sheet**, then tap **Done**.
4. A block appears at the top: "Receive **Images and 18 more** from Share Sheet". Tap **Images and 18 more**, tap
   **Clear**, then tick only **URLs** and **Text**. Tap **Done**.
   In the same block, set "If there's no input" to **Stop and Respond** (so it does nothing if opened by mistake).
5. Tap **Search for actions** (bottom), type `URL Encode`, tap it. It reads "Encode **Shortcut Input**". Leave it so.
6. Search for `Text`, tap the **Text** action. In its box type:

   ```
   https://anonmy8594.github.io/reel-feed/#add=
   ```

   Then, right after the `=` with no space, tap **URL Encoded Text** in the bar above the keyboard to insert it.
7. Search for `Open URLs`, tap it. It reads "Open **Text**". Leave it so.
8. Tap **Done** (top right).

## Use it

In TikTok: **Share**, then **More** (the "..." at the end of the row) to reach the iPhone share menu, then
**Save to Reel Feed**. In Instagram, YouTube and Snapchat it is the same idea: Share, then More or "Share to", then
the shortcut. The first time, iPhone may ask whether the shortcut may open `anonmy8594.github.io`: tap **Always Allow**.

## The catch: two separate copies of your list

A page saved to the Home Screen may keep its own storage, apart from Safari's. "Open URLs" opens the link in Safari,
so the video may be saved into **Safari's** copy of Reel Feed, not the one behind your Home Screen icon.

How you will tell, the first time:
1. Run the shortcut on a video. Safari opens and shows "Added to your feed".
2. Now open Reel Feed from the **Home Screen icon**.
3. If that video is there, the shortcut works as hoped. If it is missing, the two copies are separate.

If they are separate, two ways forward:
- **Clipboard Add (works either way):** in TikTok tap Share, **Copy link**, open Reel Feed from the Home Screen, tap
  **Add**. iPhone shows a small **Paste** bubble; tap it. Two taps more than the shortcut, but it always saves into
  the Home Screen copy.
- **Shortcut that copies instead of opening:** change step 5 to 7 above to a single **Copy to Clipboard** action
  (input: Shortcut Input) followed by **Show Notification** "Copied. Open Reel Feed and tap Add." Then open the Home
  Screen icon and tap Add.

There is no import yet, so links saved into Safari's copy stay there. **Export list** (bottom of Browse) saves a file
of whichever copy you are in, ready for the iPhone app later.

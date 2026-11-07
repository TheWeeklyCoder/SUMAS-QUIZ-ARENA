# Put SUMAS on GitHub Pages (from an Android phone)

You only ever upload ONE file (a zip). GitHub unpacks it and publishes the site by itself.
The site will live at `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

## One-time setup (about 15 minutes)

1. **Make the repository.** In Chrome open github.com and sign in. Tap the menu (three lines) > Desktop site if buttons look cramped. Tap **+** > **New repository**. Name it, for example, `sumas`. Choose **Public** (free Pages needs a public repo; nothing secret is in the code, see the note below). Tick "Add a README". Tap **Create repository**.
2. **Add the publishing recipe.** In the repo tap **Add file** > **Create new file**. In the name box type exactly `.github/workflows/deploy.yml` (typing the slashes creates the folders). Open `docs/github/deploy.yml` from the zip in SPCK, select all, copy, and paste it into the big box. Tap **Commit changes** > **Commit changes**.
3. **Turn on Pages.** Repo > **Settings** > **Pages**. Under "Build and deployment" set **Source** to **GitHub Actions**.
4. **Upload the site.** Rename the zip you got from me to exactly `upload.zip`. In the repo tap **Add file** > **Upload files**, choose `upload.zip`, tap **Commit changes**.
5. **Wait about a minute.** Repo > **Actions** tab. A run called "Publish site" turns green. Then Settings > Pages shows your address. Open it.

## Tell Firebase about the new address (do this before you try to log in)
1. Firebase console > Authentication > Settings > **Authorised domains** > Add domain: `YOUR-USERNAME.github.io` (just the domain, no `/repo`).
2. Google Cloud console > APIs & Services > Credentials > your Browser key > Application restrictions > Websites > add `https://YOUR-USERNAME.github.io/*`. Save. (This is what stops other websites using your key.)
3. Make sure `js/firebase-config.js` in the zip is your real config, and republish `firestore.rules` if you haven't (see `docs/RULES_CHANGES.md`).

## Every update after that
1. I give you a new zip. Rename it `upload.zip`.
2. Repo > `upload.zip` > the pencil/three-dots menu > **Delete file** is NOT needed. Just use **Add file** > **Upload files** and upload the new `upload.zip`; GitHub asks to replace it. Commit.
3. Wait for the green tick under Actions. Open the site, **close and reopen the app once** so the phone picks up the new version.
4. Each new zip already has a higher `VERSION` in `sw.js`. If you edit files by hand, bump that number yourself, otherwise phones may keep showing the old version.

## If something goes wrong
- **Actions run is red:** open it and read the last red line. "index.html not found" means the zip was not the SUMAS zip.
- **Page is blank or shows "Almost ready":** `js/firebase-config.js` is still the placeholder.
- **Google sign-in says "unauthorised domain":** step 1 of the Firebase part above.
- **Old version keeps showing:** close the installed app fully and reopen; or Chrome > Settings > Site settings > your site > Clear & reset.

## Note on what is public
A public repo means anyone can read the code, including `firebase-config.js` and `firestore.rules`. That is normal for web apps: the Firebase config is not a secret. Your protection is the security rules and the domain-restricted API key. Never put an admin password, a payment secret key or a backup file in this repo.

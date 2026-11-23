# Northstar — encrypted accounts

A personal wealth tracker with a private vault shared across your devices. The source and public app start with **zero holdings and zero history**. Personal balances, backups and account keys are not included in this repository.

## Cloudflare Pages setup

1. Create a **Pages** project connected to this GitHub repository, branch `main`.
2. Choose framework **None**, leave the build command empty, set output directory to **`web`**, and keep the project root at the repository root. The root `functions` directory provides the sync API. A direct upload of only `web` does not include that API.
3. Create a **D1** database called `northstar-vaults`. Open its SQL console and run [`schema.sql`](schema.sql).
4. Under the Pages project's **Settings → Bindings**, add a **D1 database** binding named **`DB`**, selecting that database. Configure production; use a separate database if you also enable previews.
5. Redeploy after adding the binding. Open the HTTPS Pages URL. The app reports that sync is not configured until the binding and database table are ready.
6. Select **Create a new account key**. Save the generated key in your password manager, tick the confirmation and create your vault.
7. On another device, open **the same website**, enter the same key and select **Unlock account**. Your most recently synced portfolio loads. No Google login is needed inside Northstar.

Use Pages **Custom domains** to attach a subdomain. Different domains have separate browser storage, but the key opens the same cloud vault if both domains point to the same deployment and database.

## How privacy works

Your account key is a random 256-bit secret. It is your account access: anyone holding it can open the vault. It cannot be reset or recovered. Only enter it on a Northstar deployment you trust.

The browser derives an AES-256-GCM encryption key using HKDF and uses a fresh IV for each save. A separately derived bearer token authenticates requests. The server stores an opaque account ID, a hash of that authentication token, ciphertext and a revision counter. It does not receive the account key, encryption key or plaintext holdings. The bearer token is sent over HTTPS; it permits access to ciphertext but does not decrypt it.

Keys remain in memory and are never saved in a cookie, URL or localStorage. A failed sync may leave an encrypted recovery copy in browser storage. Cloudflare still receives ordinary request metadata such as IP addresses. There are no external scripts or analytics. Hosting operators can change deployed JavaScript, so this design assumes a trusted deployment; it has not had an independent security audit.

A public source repository does not expose portfolio balances. Do not commit private backups or place credentials into source files.

## Sync, conflicts and backups

Wait for **Synced · encrypted** before closing the tab. An already-open device does not poll: lock and reopen it to load changes made elsewhere. Changes save automatically after edits. **Retry sync** retries saving the current tab.

Each update includes the last known revision. If two devices edit the same revision, the second save is rejected to prevent silently overwriting the first. Export an encrypted backup of your unsynced edits, then lock and reopen to review the current cloud data and reapply edits. Retry does not resolve a revision conflict.

Failed saves keep a ciphertext recovery copy. On the next unlock it is restored only if the remote revision has not changed. If it conflicts, the app offers a recovery download and stops. Save that encrypted file, open the cloud vault in another browser and inspect it before importing a backup. Only clear site data to remove a conflicting recovery copy after saving that file safely.

Settings → Export backup produces encrypted JSON protected by your account key. Import accepts that format and older plaintext Northstar backups; plaintext imports stay on-device until encrypted for saving. Imported backups intentionally replace the current portfolio after confirmation. Keep your key and backups safe against database loss.

The app locks on reload or after five minutes without interaction. If edits have not synced, locking asks for confirmation. The static shell is cacheable, but unlocking requires an internet connection.

## Validation

Run `npm test` with Node 20 or later. No dependencies are needed. Tests cover cross-device key derivation, encryption/decryption, large backups, incorrect keys, tampering, API authorization, revision conflicts and empty-state asset/liability calculations. Deployment and the actual Cloudflare D1 binding still need validation after hosting.

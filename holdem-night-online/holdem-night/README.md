# Hold'em Night (online version)

Texas Hold'em with an automated dealer, party codes, invite links, chat and bots.
Anyone with the link can play. No accounts and no sharing settings.

## What is in this folder
- `server.js`          the game server (runs the dealer, keeps cards secret, handles chat)
- `public/index.html`  the game page your friend sees
- `engine.js`, `client.html`, `build.py`  source files (you can ignore these)
- `package.json`       tells the host what to install

## Put it online (free), step by step with Render

1. Make a free account at github.com. Click "New repository", name it `holdem-night`, make it Public, create it.
2. On the new repository page click "uploading an existing file". Drag in EVERYTHING from this folder
   (including the `public` folder), then click "Commit changes".
3. Make a free account at render.com (use "Sign in with GitHub").
4. Click New + > Web Service > pick your `holdem-night` repository.
5. Fill in:
   - Runtime / Language: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance type: Free
6. Click "Create Web Service" and wait a couple of minutes. Render gives you a link like
   `https://holdem-night.onrender.com`.
7. Open that link, type your name, press "Create a party", then press "Copy invite link" and send it to your friend.

Notes
- On the free plan Render puts the site to sleep after about 15 minutes with nobody on it. The first visit afterwards
  takes up to a minute to wake up. Open the link yourself a minute before game night.
- A party code only works while the server is running. If the server restarts, make a new party.

## Try it on your own computer first (optional)
Install Node.js (nodejs.org), open a terminal in this folder, then run:

    npm install
    npm start

Open http://localhost:3000 in two browser tabs to play against yourself.

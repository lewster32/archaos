<h1 align="center">
  <img src="https://www.archaos.co.uk/2021/images/web/logo.png" alt="Archaos">
</h1>

<h2 align="center">A modern remake of <a href="https://en.wikipedia.org/wiki/Chaos:_The_Battle_of_Wizards">Chaos: The Battle of Wizards</a> built using <a href="http://phaser.io/">Phaser 3, <a href="https://vuejs.org/">Vue 3</a> and <a href="https://vitejs.dev/">Vite</a>.</h2>

This is a project that has been many, many years in the making. The oldest piece of work I can find exploring the possibility of an update to this game is from 2003 - a [document](https://www.rotates.org/old/chaos/) outlining a number of additions to the base game, along with some (very outdated) waffle about technical approaches. There's also a wealth of (again, very outdated) [posts on my blog](https://www.rotates.org/category/projects/archaos-projects/) documenting progress through the many iterations - most rather a bit too ambitious at the time - that led vaguely to this point.

Nearly 25 years on, what we have now is a completely new, and far less grandiose version of the game written largely from scratch using modern web tech. Most of the graphics, sounds and many of the routines such as the pathfinding, wizard customisation etc. were already lying around, and were relatively easy to dust off and make use of. Some surprises (which probably shouldn't have been in hindsight) included how easy it was to convert some of the old ActionScript 3 code to TypeScript (aside from some extra built-in objects and some Java-esque boilerplate, they're pretty much interchangeable).

## Features

- Isometric perspective
- Pixel art based on the original graphics
- Crunchy beeper sounds faithfully brought over from the 48K Spectrum
- Quality of life features:
    - Modernised mouse-driven UI
    - Descriptions and inline help on most things
    - Safeguards, such as warning you if you try to cast a spell with no valid targets in range
- Up to 8 players (local only)
- Computer-controlled opponents (they're a bit dim right now, but getting better)
- All of the original spells and units
- Standalone client (via Tauri - not yet released, but can be built from source)

<p align="center"><img src="https://archaos.co.uk/images/spells/classicspells.png" alt="Classic spell icons"></p>

### Not yet features

- Online multiplayer
- All planned new units/spells/scenarios (check the document mentioned earlier for where I may end up going with this stuff)

## Play now! 🔥

You can play the latest build in your browser here: https://www.archaos.co.uk/2021/

You can also build a standalone version of the game with `npm run tauri:build`

## Installing and building

### Requirements:

- NodeJS (I'm using 24 at time of writing)
- A desktop browser (mobile is _sorta_ supported, but not quite there yet)

You should be able to clone this repo to a local directory, and then just run `npm install` from the directory to install dependencies. Starting up a live development server is as simple as running `npm start` and to build, `npm run build` should do the job.

_Note: the `deploy`, `manifest` and `release` scripts will not work as they reference a super-secret deployment script not included._

## Dedications

- [Andy Herbert](https://github.com/andyherbert) - shared a lot of excellent technical knowledge of the original game's mechanics
- [@DarkHalfUK](https://twitter.com/DarkHalfUK) - gave great feedback and playtesting of earlier iterations of the game
- [Richard Davey](https://twitter.com/photonstorm) - maker of the very snazzy Phaser framework, which I've been a fan of (and even a minor contributor to) for many years
- [Julian Gollop](https://twitter.com/julian_gollop) - where it all began - the author of the original (as well as some largely forgotten minor titles like X-Com: UFO Defense) and who personally gave blessing to my remake - even clearing me to sell it if I so wished!

<pre>
🧙🏽‍♂️    ☘️☘️ ☘️  ☘️   
🐍  ☘️☘️☘️ ☘️  ☘️ 
      🔥🔥☘️🔥
    🔥🔥🔥 🔥  🐉
       🔥          🧙
</pre>

![Archaos](https://www.archaos.co.uk/2021/images/web/logo.png)

*A modern remake of [Chaos: The Battle of Wizards](https://en.wikipedia.org/wiki/Chaos:_The_Battle_of_Wizards) built using [Phaser 3](http://phaser.io/), [Vue 3](https://vuejs.org/) and [Vite](https://vitejs.dev/).*

This is a project that has been many, many years in the making. The oldest piece of work I can find exploring the possibility of an update to this game is from 2003 - a [document](https://www.rotates.org/old/chaos/) outlining a number of additions to the base game, along with some (very outdated) waffle about technical approaches. There's also a wealth of (again, very outdated) [posts on my blog](https://www.rotates.org/category/projects/archaos-projects/) documenting progress through the many iterations - most rather a bit too ambitious at the time - that led vaguely to this point.

Nearly 20 years on, what we have now is a completely new, and far less grandiose version of the game written largely from scratch using modern web tech. Most of the graphics, sounds and many of the routines such as the pathfinding, wizard customisation etc. were already lying around, and were relatively easy to dust off and make use of. Some surprises (which probably shouldn't have been in hindsight) included how easy it was to convert some of the old ActionScript 3 code to TypeScript (aside from some extra built-in objects and some Java-esque boilerplate, they're pretty much interchangeable).

This iteration has taken just over a month from start to beta, and I'm pretty happy with where it is right now. There are of course bugs, inconsistencies, and annoyances, as well as some big missing features (computer opponents and multiplayer being the ones I feel most will point out) but I hope to address these in time.

## Installing and building

*NB: I've not tried this outside of my Windows 10 environment yet*

Requirements:
- NodeJS (I'm using 14.15.1 at time of writing)

You should be able to clone this repo to a local directory, and then just run `npm i` from the directory to install dependencies. Starting up a live development server is as simple as running `npm start` and to build, `npm run build` should do the job.

## Dedications

- [@calamity_andy](https://twitter.com/calamity_andy) - shared a lot of excellent technical knowledge of the original game's mechanics
- [@DarkHalfUK](https://twitter.com/DarkHalfUK) - gave great feedback and playtesting of earlier iterations of the game
- [Richard Davey](https://twitter.com/photonstorm) - maker of the very snazzy Phaser framework, which I've been a fan of (and even a minor contributor to) for many years
- [Julian Gollop](https://twitter.com/julian_gollop) - where it all began - the author of the original (as well as some largely forgotten minor titles like X-Com: UFO Defense) and who personally gave blessing to my remake - even clearing me to sell it if I so wished!

import "phaser";
import { GameScene } from "./game-scene";

const GameConfig: Phaser.Types.Core.GameConfig = {
    title: "Archaos",
    version: "0.0.1",
    width: 400,
    height: 220,
    type: Phaser.AUTO,
    parent: "app",
    scene: [GameScene],
    input: {
        keyboard: true,
    },
    physics: {
        default: "arcade",
        arcade: {
            gravity: { y: 0 },
            debug: false,
        },
    },
    render: {
        pixelArt: true,
        antialias: true,
        transparent: true,
    },
    scale: {
        mode: Phaser.Scale.NONE,
        fullscreenTarget: "app",
        zoom: 2,
    },
};

export class Game extends Phaser.Game {
    constructor(config: Phaser.Types.Core.GameConfig) {
        super(config);
    }
}

window.addEventListener("load", () => {
    (window as any)._game = new Game(GameConfig);
});

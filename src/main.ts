import "phaser";
import { GameScene } from "./game-scene";
import { EventType } from "./gameobjects/enums/eventtype";
import { UnitStatus } from "./gameobjects/enums/unitstatus";
import { Piece } from "./gameobjects/piece";

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

window.addEventListener(EventType.PieceInfo, (event: any) => {
    const info = document.getElementById("piece-info");
    if (!event.detail) {
        info!.innerHTML = ``;
        return;
    }
    const piece: Piece = event.detail;
    if (piece.hasStatus(UnitStatus.Wizard)) {
        info!.innerHTML = `<h2><span class="unit-id">${piece.id}</span> ${piece.owner?.name}</h2>`;
    }
    else {
        info!.innerHTML = `<h2><span class="unit-id">${piece.id}</span> ${piece.owner?.name}'s ${piece.name}</h2>`;
    }

    console.log(piece);
    
});
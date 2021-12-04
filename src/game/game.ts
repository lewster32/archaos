import Phaser from 'phaser';
import { GameScene } from '../game-scene';

function launch(containerId: string) {
    return new Phaser.Game({
        title: "Archaos",
        version: "0.0.1",
        width: 400,
        height: 220,
        type: Phaser.AUTO,
        parent: containerId,
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
            fullscreenTarget: containerId,
            zoom: 2,
        },
    })
}

export default launch;
export { launch }

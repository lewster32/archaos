import { GameScene } from "../game-scene";
import { Game, Scale, AUTO } from "phaser";
import { FilterColorReplaceRenderNode } from "../gameobjects/filters/filtercolorreplacerendernode";

export const launch = (containerId: string) => {
    return new Game({
        title: "Archaos",
        version: "0.6.0",
        width: 400,
        height: 220,
        type: AUTO,
        parent: containerId,
        scene: [GameScene],
        input: {
            keyboard: true,
        },
        physics: {
            default: "arcade",
            arcade: {
                gravity: { y: 0, x: 0 },
                debug: false,
            },
        },
        render: {
            pixelArt: true,
            antialias: true,
            transparent: true,
            renderNodes: {
                // @ts-ignore
                [FilterColorReplaceRenderNode.KEY]: FilterColorReplaceRenderNode,
            },
        },
        scale: {
            mode: Scale.NONE,
            fullscreenTarget: containerId,
            zoom: 2,
        },
    });
};

import "phaser";

export class MenuScene extends Phaser.Scene {
    private startKey!: Phaser.Input.Keyboard.Key;

    constructor() {
        super({
            key: "MenuScene",
        });
    }

    preload(): void {
        this.startKey = this.input.keyboard.addKey(
            Phaser.Input.Keyboard.KeyCodes.S
        );
        this.startKey.isDown = false;
    }

    create(): void {
        this.add.text(0, 0, "Press S to restart scene", {
            fontSize: "60px",
            fontFamily: "Helvetica",
        });
    }

    update(): void {
        if (this.startKey.isDown) {
            this.scene.start(this);
        }
    }
}

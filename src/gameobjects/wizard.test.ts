import { describe, it, expect } from 'vitest';
import { Wizard } from './wizard';
// Import the same JSON data used by Wizard to verify clamping behaviour
import { wizcodes } from '../../assets/spritesheets/wizards.json';
import { Board } from './board';
import { WizardConfig } from './configs/piececonfig';
import { Player } from './player';

function makeMockBoard() {
    return {
        getIsoPosition: (x: number, y: number) => ({ x, y }),
        scene: {
            add: {
                sprite: () => ({ setOrigin: () => ({}) }),
                image: () => ({
                    setOrigin: () => ({}),
                    setTint: () => ({}),
                    setBlendMode: () => ({}),
                }),
            },
            tweens: {
                add: () => ({}),
            }
        },
        getLayer: () => ({
            add: () => ({})
        }),
    } as unknown as Board;
}

function makeMockPlayer() {
    return {
        castingPiece: null,
        colour: 0xffffff,
    } as unknown as Player;
}

class MockWizard extends Wizard {
    constructor(board: Board, id: number, config: WizardConfig) {
        super(board, id, config);
    }

    createSprite() {
        return null as unknown as Phaser.GameObjects.Sprite;
    }

    createShadow() {
        return null as unknown as Phaser.GameObjects.Image;
    }

    createShaders() {
        return {};
    }
}

describe('Wizard.parseWizCode', () => {

    describe('construction', () => {
        it('should be constructible with a valid WizCode', () => {
            const wiz = new MockWizard(makeMockBoard(), 0, { wizCode: '010203040f', x: 0, y: 0, owner: makeMockPlayer() });
            expect(wiz).toBeInstanceOf(Object);
            expect(wiz.wizCode).toBe('010203040f');
        });

        it("should set the owner's casting piece to the wizard piece", () => {
            const owner = makeMockPlayer();
            const wiz = new MockWizard(makeMockBoard(), 0, { wizCode: '010203040f', x: 0, y: 0, owner });
            expect(owner.castingPiece).toBe(wiz);
        });

        it('should throw if the owner is missing', () => {
            expect(() => new MockWizard(makeMockBoard(), 0, { wizCode: '010203040f', x: 0, y: 0 })).toThrow('Wizard must have an owner');
        });
    });

    describe('validation errors', () => {
        it('throws when given an empty string', () => {
            expect(() => Wizard.parseWizCode('')).toThrow('WizCode cannot be empty');
        });

        it('throws when given a null value', () => {
            expect(() => Wizard.parseWizCode(null as unknown as string)).toThrow('WizCode cannot be empty');
        });

        it('throws when given undefined', () => {
            expect(() => Wizard.parseWizCode(undefined as unknown as string)).toThrow('WizCode cannot be empty');
        });

        it('throws when given only whitespace', () => {
            expect(() => Wizard.parseWizCode('   ')).toThrow('WizCode cannot be empty');
        });

        it('throws when given non-hex characters', () => {
            expect(() => Wizard.parseWizCode('gggggggggg')).toThrow('Invalid WizCode');
        });

        it('throws when the string is too short (fewer than 10 hex chars)', () => {
            expect(() => Wizard.parseWizCode('abcdef')).toThrow('Invalid WizCode');
        });
    });

    describe('valid parsing', () => {
        it('throws when given a WizCode that is too long', () => {
            expect(() => Wizard.parseWizCode('0f1a2b3c4d00')).toThrow();
        });

        it('throws when given a WizCode that is too short', () => {
            expect(() => Wizard.parseWizCode('0f1a2b3c')).toThrow();
        });

        it('parses a valid lowercase WizCode', () => {
            const result = Wizard.parseWizCode('010203040f');
            expect(result.code).toBe('010203040f');
            expect(result.wiz).toBe(1);  // 0x01
            expect(result.pri).toBe(2);  // 0x02
            expect(result.sec).toBe(3);  // 0x03
            expect(result.skin).toBe(4); // 0x04
            expect(result.hat).toBe(15); // 0x0f
        });

        it('normalises uppercase input to lowercase', () => {
            const result = Wizard.parseWizCode('0F1A2B3C4D');
            expect(result.code).toBe('0f1a2b3c4d');
        });

        it('trims surrounding whitespace before parsing', () => {
            const result = Wizard.parseWizCode('  010203040f  ');
            expect(result.code).toBe('010203040f');
            expect(result.wiz).toBe(1);
        });

        it('parses an all-zero WizCode', () => {
            const result = Wizard.parseWizCode('0000000000');
            expect(result.code).toBe('0000000000');
            expect(result.wiz).toBe(0);
            expect(result.pri).toBe(0);
            expect(result.sec).toBe(0);
            expect(result.skin).toBe(0);
            expect(result.hat).toBe(0);
        });

        it('returns the correct `code` field matching the normalised input', () => {
            const result = Wizard.parseWizCode('AABBCCDDEE');
            expect(result.code).toBe('aabbccddee');
        });
    });

    describe('clamping to maximum values', () => {
        // 'ff' in each position = 255, which exceeds all maximums
        it('clamps wiz to wizcodes.max.wiz', () => {
            const result = Wizard.parseWizCode('ffffffffff');
            expect(result.wiz).toBe(wizcodes.max.wiz);
        });

        it('clamps pri to wizcodes.max.pri', () => {
            const result = Wizard.parseWizCode('ffffffffff');
            expect(result.pri).toBe(wizcodes.max.pri);
        });

        it('clamps sec to wizcodes.max.sec', () => {
            const result = Wizard.parseWizCode('ffffffffff');
            expect(result.sec).toBe(wizcodes.max.sec);
        });

        it('clamps skin to wizcodes.max.skin', () => {
            const result = Wizard.parseWizCode('ffffffffff');
            expect(result.skin).toBe(wizcodes.max.skin);
        });

        it('clamps hat to wizcodes.max.hat', () => {
            const result = Wizard.parseWizCode('ffffffffff');
            expect(result.hat).toBe(wizcodes.max.hat);
        });

        it('does not clamp values that are within bounds', () => {
            // wiz=1 (max 15), pri=2 (max 35), sec=3 (max 35), skin=4 (max 9), hat=15 (max 50)
            const result = Wizard.parseWizCode('010203040f');
            expect(result.wiz).toBe(1);
            expect(result.pri).toBe(2);
            expect(result.sec).toBe(3);
            expect(result.skin).toBe(4);
            expect(result.hat).toBe(15);
        });
    });
});

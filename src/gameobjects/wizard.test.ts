import { describe, it, expect } from 'vitest';
import { Wizard } from './wizard';
// Import the same JSON data used by Wizard to verify clamping behaviour
import { wizcodes } from '../../assets/spritesheets/wizards.json';
import { Board } from './board';
import { WizardConfig } from './configs/piececonfig';
import { Player } from './player';
import { UnitDirection } from './enums/unitdirection';
import { UnitStatus } from './enums/unitstatus';

function makeMockSprite() {
    return {
        setOrigin: () => ({}),
        setFrame: () => ({}),
        setDepth: () => ({}),
        setTint: () => ({}),
        setTintFill: () => ({}),
        clearTint: () => ({}),
        setAlpha: () => ({}),
        setVisible: () => ({}),
        setFlipX: () => ({}),
        setBlendMode: () => ({}),
        getData: (_key: string) => null,
        setData: () => ({}),
        destroy: () => ({}),
        getCenter: () => ({ x: 0, y: 0 }),
        x: 0,
        y: 0,
        depth: 0,
        anims: { play: () => ({}) },
        displayOriginY: 0,
    };
}

function makeMockImage() {
    return {
        setOrigin: () => ({}),
        setTint: () => ({}),
        setBlendMode: () => ({}),
        setDepth: () => ({}),
        setFlipX: () => ({}),
        setAlpha: () => ({}),
        setVisible: () => ({}),
        getData: (_key: string) => null,
        setData: () => ({}),
        destroy: () => ({}),
        x: 0,
        y: 0,
        depth: 0,
        displayOriginY: 0,
    };
}

function makeMockBoard() {
    return {
        getIsoPosition: () => ({ x: 0, y: 0 }),
        scene: {
            add: {
                sprite: () => makeMockSprite(),
                image: () => makeMockImage(),
            },
            tweens: {
                add: () => ({}),
            }
        },
        getLayer: () => ({
            add: () => ({})
        }),
        logger: {
            log: () => {},
        },
    } as unknown as Board;
}

function makeMockPlayer(name: string = 'Test Wizard') {
    return {
        castingPiece: null,
        colour: 0xffffff,
        name,
    } as unknown as Player;
}

class MockWizard extends Wizard {
    constructor(board: Board, id: number, config: WizardConfig) {
        super(board, id, config);
    }

    createSprite() {
        if (!this._sprite) {
            this._sprite = makeMockSprite() as unknown as Phaser.GameObjects.Sprite;
        }
        return this._sprite;
    }

    createShadow() {
        if (!this._shadow) {
            this._shadow = makeMockImage() as unknown as Phaser.GameObjects.Image;
        }
        return this._shadow;
    }

    createShaders() {
        return {};
    }
}

function makeWizard(wizCode = '010203040f', name = 'Test Wizard') {
    return new MockWizard(makeMockBoard(), 0, {
        wizCode,
        x: 0,
        y: 0,
        owner: makeMockPlayer(name),
    });
}

describe('Wizard.parseWizCode', () => {

    describe('construction', () => {
        it('should be constructible with a valid WizCode', () => {
            const wiz = new MockWizard(makeMockBoard(), 0, { wizCode: '010203040f', x: 0, y: 0, owner: makeMockPlayer() });
            expect(wiz).toBeInstanceOf(Object);
            expect(wiz.wizCode).toBe('010203040f');
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

describe('Wizard instance methods', () => {

    describe('constructor', () => {
        it("should set the owner's casting piece to the wizard piece", () => {
            const owner = makeMockPlayer();
            const wiz = new MockWizard(makeMockBoard(), 0, { wizCode: '010203040f', x: 0, y: 0, owner });
            expect(owner.castingPiece).toBe(wiz);
        });

        it('should throw if the owner is missing', () => {
            expect(() => new MockWizard(makeMockBoard(), 0, { wizCode: '010203040f', x: 0, y: 0 })).toThrow('Wizard must have an owner');
        });
    });

    describe('name and fullName getters', () => {
        it('name returns the owning player name', () => {
            const wiz = makeWizard('010203040f', 'Gandalf');
            expect(wiz.name).toBe('Gandalf');
        });

        it('name returns "Unnamed wizard" when owner has no name', () => {
            const owner = { castingPiece: null, colour: 0xffffff } as unknown as Player;
            const wiz = new MockWizard(makeMockBoard(), 0, { wizCode: '010203040f', x: 0, y: 0, owner });
            expect(wiz.name).toBe('Unnamed wizard');
        });

        it('fullName returns the same value as name', () => {
            const wiz = makeWizard('010203040f', 'Saruman');
            expect(wiz.fullName).toBe(wiz.name);
        });
    });

    describe('playAnim', () => {
        it('does not throw when called', () => {
            const wiz = makeWizard();
            expect(() => wiz.playAnim()).not.toThrow();
        });
    });

    describe('direction setter', () => {
        it('updates direction when set to a new value', () => {
            const wiz = makeWizard();
            wiz.direction = UnitDirection.Left;
            expect(wiz.direction).toBe(UnitDirection.Left);
            wiz.direction = UnitDirection.Right;
            expect(wiz.direction).toBe(UnitDirection.Right);
        });

        it('does not throw when effects are present and direction changes', () => {
            const wiz = makeWizard();
            wiz.addStatus(UnitStatus.MagicKnife);
            expect(() => { wiz.direction = UnitDirection.Left; }).not.toThrow();
            expect(() => { wiz.direction = UnitDirection.Right; }).not.toThrow();
        });
    });

    describe('randomWizCode', () => {
        it('generates a string that can be parsed without error', () => {
            const code = Wizard.randomWizCode();
            expect(() => Wizard.parseWizCode(code)).not.toThrow();
        });

        it('generates a 10-character lowercase hex string', () => {
            const code = Wizard.randomWizCode();
            expect(code).toMatch(/^[0-9a-f]{10}$/);
        });

        it('generates values within wizcodes bounds', () => {
            const result = Wizard.parseWizCode(Wizard.randomWizCode());
            expect(result.wiz).toBeGreaterThanOrEqual(0);
            expect(result.wiz).toBeLessThanOrEqual(wizcodes.max.wiz);
            expect(result.pri).toBeGreaterThanOrEqual(0);
            expect(result.pri).toBeLessThanOrEqual(wizcodes.max.pri);
            expect(result.sec).toBeGreaterThanOrEqual(0);
            expect(result.sec).toBeLessThanOrEqual(wizcodes.max.sec);
            expect(result.skin).toBeGreaterThanOrEqual(0);
            expect(result.skin).toBeLessThanOrEqual(wizcodes.max.skin);
            expect(result.hat).toBeGreaterThanOrEqual(0);
            expect(result.hat).toBeLessThanOrEqual(wizcodes.max.hat);
        });
    });

    describe('addStatus', () => {
        it('adds ShadowForm to the status list', () => {
            const wiz = makeWizard();
            wiz.addStatus(UnitStatus.ShadowForm);
            expect(wiz.hasStatus(UnitStatus.ShadowForm)).toBe(true);
        });

        it('adds Flying to the status list', () => {
            const wiz = makeWizard();
            wiz.addStatus(UnitStatus.Flying);
            expect(wiz.hasStatus(UnitStatus.Flying)).toBe(true);
        });

        it('returns false when status is already present', () => {
            const wiz = makeWizard();
            wiz.addStatus(UnitStatus.Flying);
            expect(wiz.addStatus(UnitStatus.Flying)).toBe(false);
        });

        it('adding a magic weapon also grants AttackUndead', () => {
            const wiz = makeWizard();
            expect(wiz.hasStatus(UnitStatus.AttackUndead)).toBe(false);
            wiz.addStatus(UnitStatus.MagicBow);
            expect(wiz.hasStatus(UnitStatus.AttackUndead)).toBe(true);
        });

        it('adding MagicWings also grants Flying', () => {
            const wiz = makeWizard();
            expect(wiz.hasStatus(UnitStatus.Flying)).toBe(false);
            wiz.addStatus(UnitStatus.MagicWings);
            expect(wiz.hasStatus(UnitStatus.Flying)).toBe(true);
        });

        it('adding MagicSword after MagicKnife removes MagicKnife (mutual exclusion)', () => {
            const wiz = makeWizard();
            wiz.addStatus(UnitStatus.MagicKnife);
            wiz.addStatus(UnitStatus.MagicSword);
            expect(wiz.hasStatus(UnitStatus.MagicKnife)).toBe(false);
            expect(wiz.hasStatus(UnitStatus.MagicSword)).toBe(true);
        });

        it('adding MagicKnife after MagicSword removes MagicSword (mutual exclusion)', () => {
            const wiz = makeWizard();
            wiz.addStatus(UnitStatus.MagicSword);
            wiz.addStatus(UnitStatus.MagicKnife);
            expect(wiz.hasStatus(UnitStatus.MagicSword)).toBe(false);
            expect(wiz.hasStatus(UnitStatus.MagicKnife)).toBe(true);
        });

        it('adding MagicArmour after MagicShield removes MagicShield (mutual exclusion)', () => {
            const wiz = makeWizard();
            wiz.addStatus(UnitStatus.MagicShield);
            wiz.addStatus(UnitStatus.MagicArmour);
            expect(wiz.hasStatus(UnitStatus.MagicShield)).toBe(false);
            expect(wiz.hasStatus(UnitStatus.MagicArmour)).toBe(true);
        });

        it('adding MagicShield after MagicArmour removes MagicArmour (mutual exclusion)', () => {
            const wiz = makeWizard();
            wiz.addStatus(UnitStatus.MagicArmour);
            wiz.addStatus(UnitStatus.MagicShield);
            expect(wiz.hasStatus(UnitStatus.MagicArmour)).toBe(false);
            expect(wiz.hasStatus(UnitStatus.MagicShield)).toBe(true);
        });

        it('does not throw when adding multiple statuses', () => {
            const wiz = makeWizard();
            expect(() => {
                wiz.addStatus(UnitStatus.ShadowForm);
                wiz.addStatus(UnitStatus.MagicKnife);
                wiz.addStatus(UnitStatus.MagicShield);
                wiz.addStatus(UnitStatus.MagicWings);
            }).not.toThrow();
        });
    });

    describe('removeStatus', () => {
        it('removes ShadowForm from the status list', () => {
            const wiz = makeWizard();
            wiz.addStatus(UnitStatus.ShadowForm);
            wiz.removeStatus(UnitStatus.ShadowForm);
            expect(wiz.hasStatus(UnitStatus.ShadowForm)).toBe(false);
        });

        it('removes Flying from the status list', () => {
            const wiz = makeWizard();
            wiz.addStatus(UnitStatus.Flying);
            wiz.removeStatus(UnitStatus.Flying);
            expect(wiz.hasStatus(UnitStatus.Flying)).toBe(false);
        });

        it('returns false when status is not present', () => {
            const wiz = makeWizard();
            expect(wiz.removeStatus(UnitStatus.Flying)).toBe(false);
        });

        it('removing MagicWings also removes Flying', () => {
            const wiz = makeWizard();
            wiz.addStatus(UnitStatus.MagicWings);
            wiz.removeStatus(UnitStatus.MagicWings);
            expect(wiz.hasStatus(UnitStatus.MagicWings)).toBe(false);
            expect(wiz.hasStatus(UnitStatus.Flying)).toBe(false);
        });

        it('removing the last magic weapon also removes AttackUndead', () => {
            const wiz = makeWizard();
            expect(wiz.hasStatus(UnitStatus.AttackUndead)).toBe(false);
            wiz.addStatus(UnitStatus.MagicBow);
            wiz.addStatus(UnitStatus.MagicKnife);
            expect(wiz.hasStatus(UnitStatus.AttackUndead)).toBe(true);
            wiz.removeStatus(UnitStatus.MagicBow);
            expect(wiz.hasStatus(UnitStatus.AttackUndead)).toBe(true);
            wiz.removeStatus(UnitStatus.MagicKnife);
            expect(wiz.hasStatus(UnitStatus.AttackUndead)).toBe(false);
        });

        it('removing one magic weapon does not remove AttackUndead if another weapon is still present', () => {
            const wiz = makeWizard();
            expect(wiz.hasStatus(UnitStatus.AttackUndead)).toBe(false);
            wiz.addStatus(UnitStatus.MagicKnife);
            wiz.addStatus(UnitStatus.MagicBow);
            wiz.removeStatus(UnitStatus.MagicBow);
            expect(wiz.hasStatus(UnitStatus.AttackUndead)).toBe(true);
        });

        it('does not throw when removing MagicArmour', () => {
            const wiz = makeWizard();
            wiz.addStatus(UnitStatus.MagicArmour);
            expect(() => wiz.removeStatus(UnitStatus.MagicArmour)).not.toThrow();
            expect(wiz.hasStatus(UnitStatus.MagicArmour)).toBe(false);
        });
    });
});

import { EngineEvent } from "../enums/engineevent";
import { BoardPhase } from "../enums/boardphase";
import { SpellType } from "../enums/spelltype";
import { UnitType } from "../enums/unittype";
import { UnitStatus } from "../enums/unitstatus";
import { RangeType } from "../enums/rangetype";
import { SpellTarget } from "../enums/spelltarget";
import type { RemotePlayer } from "../interfaces/remoteplayer";
import { Piece } from "../piece";
import { Path } from "../pathfinding";
import { AttackSpell } from "../spells/attackspell";
import { Spell } from "../spells/spell";
import type { SummonSpell } from "../spells/summonspell";
import { Board } from "../board";
import type { Player } from "../player";
import { Point } from "../point";
import type { Alignment } from "../alignment";
import type {
    AttackPieceCommand,
    CancelCastCommand,
    CastSpellCommand,
    EndMovementPhaseCommand,
    EndPieceTurnCommand,
    EndSpellPickCommand,
    MountPieceCommand,
    MovePieceCommand,
    PhaseChangedOutcome,
    PickSpellCommand,
    RangedAttackPieceCommand,
    SelectPieceCommand,
    SpellTarget as CommandSpellTarget,
} from "../protocol";
import { toPhaseKind } from "../snapshotbuilder";
/**
 * This contains AI logic for computer-controlled wizards. Each computer player
 * receives a ComputerWizard instance that determines its actions each turn.
 */
export class ComputerWizard implements RemotePlayer {
    /**
     * The board the computer wizard is playing on.
     */
    private readonly _board: Board;

    /**
     * The player this computer wizard is controlling.
     */
    private readonly _player: Player;

    /**
     * A set of piece IDs that are known to not be illusions. This is used to
     * track which units have been unsuccessfully Disbelieved. There's a small
     * chance that the computer player may 'forget' this information over time,
     * or neglect to record it altogether, to simulate imperfect memory.
     */
    private readonly _knownNonIllusionPieces: Set<number>;

    /**
     * A map of enemy players to their threat priority levels.
     */
    private readonly _enemyPlayerPriorities: Map<Player, number> = new Map();

    /**
     * Controls how sharply the suspicion score affects the chance to cast
     * Disbelieve. A value of 1 gives a linear relationship; higher values
     * suppress casting against low-suspicion targets while keeping the AI
     * aggressive against high-suspicion ones (power curve / gamma). Values
     * below 1 produce a more uniform chance regardless of threat level.
     */
    private static readonly DISBELIEVE_CONTRAST: number = 2;

    /**
     * The difficulty level of the computer wizard, from 0 (easiest) to 1 (hardest).
     */
    private readonly _difficulty: number = 0.5;

    /**
     * The ID of a piece that selectSpell identified as a preferred target
     * for the next spell cast (e.g. a suspected illusion for Disbelieve,
     * or a high-value threat for an attack spell). When set, autoCastSpell
     * will strongly favour this piece via weighted selection. Cleared after
     * use.
     */
    private _preferredTargetId: number | null = null;

    /**
     * True once a pick command has been emitted for the current
     * spellbook phase. Reset whenever the spellbook phase is entered.
     * Guards against double-submission when the FSM-driven phase-changed
     * outcome and the per-slot phase-changed outcome both fire.
     */
    private _spellbookSubmitted: boolean = false;

    /**
     * Creates a new ComputerWizard instance.
     *
     * @param board a reference to the game board
     * @param player the player this computer wizard is controlling
     */
    constructor(board: Board, player: Player, difficulty?: number) {
        this._board = board;
        this._player = player;
        this._difficulty = difficulty ?? 0.5;
        this._knownNonIllusionPieces = new Set<number>();
        // Subscribe to phase-changed forwarded onto the engine event bus
        // so the AI can dispatch its spellbook pick / cast commands at
        // the right moment without being driven by a direct method call.
        this._board.events.on(EngineEvent.PhaseChanged, (outcome: PhaseChangedOutcome) => {
            this._onPhaseChanged(outcome);
        });
    }

    /**
     * Generate a fresh commandId for an AI-emitted command. Combines
     * the player id, the next event-log sequence, and a short random
     * suffix to keep the id unique within a single sequence.
     */
    private _nextCommandId(): string {
        const seq: number = this._board.eventLog.head() + 1;
        const suffix: string = Math.random().toString(36).slice(2, 10);
        return `ai-${this._player.id}-${seq}-${suffix}`;
    }

    /**
     * Phase-changed listener. Routes each phase-changed outcome to the
     * appropriate command-computation hook and dispatches the result via
     * `Board.handleCommand`.
     */
    private _onPhaseChanged(outcome: PhaseChangedOutcome): void {
        // Reset the spellbook one-shot flag whenever we leave the
        // spellbook phase. Each new spellbook entry is a fresh pick.
        if (outcome.phase !== toPhaseKind(BoardPhase.Spellbook)) {
            this._spellbookSubmitted = false;
        }

        if (outcome.phase === toPhaseKind(BoardPhase.Spellbook)) {
            const myId: number = this._player.id;
            const isMyTurn: boolean = outcome.currentPlayerId === undefined || outcome.currentPlayerId === myId;
            // Suppress dispatch when no slot is actually open for us.
            // The FSM-fired phase-changed inside newTurn() emits with
            // currentPlayerId=undefined before the per-player slot is
            // opened, which would otherwise be mistaken for a barrier
            // signal and land in a closed slot.
            if (isMyTurn && !this._spellbookSubmitted && this._board.canAcceptCommandFor(myId)) {
                this._spellbookSubmitted = true;
                const cmd: PickSpellCommand | EndSpellPickCommand = this._computePickSpellCommand();
                void this._board.handleCommand(myId, cmd);
            }
        } else if (outcome.phase === toPhaseKind(BoardPhase.Casting)) {
            // The casting phase loop re-emits phase-changed once per
            // open slot (one per multi-cast iteration). Issue exactly
            // one cast or cancel command per fire — but only when the
            // engine actually has a slot open for us.
            if (outcome.currentPlayerId === this._player.id && this._board.canAcceptCommandFor(this._player.id)) {
                const cmd: CastSpellCommand | CancelCastCommand = this._computeCastSpellCommand();
                void this._board.handleCommand(this._player.id, cmd);
            }
        } else if (outcome.phase === toPhaseKind(BoardPhase.Moving)) {
            // The movement phase loop re-emits phase-changed once per
            // open slot. Each fire dispatches one command; the loop
            // re-fires after every command that submits its slot
            // (move-piece, attack-piece, ranged-attack-piece,
            // mount-piece, end-piece-turn, end-movement-phase). For
            // commands that do not close their slot (select-piece,
            // cancel-piece-action), `_dispatchMovementCommand` chains
            // the follow-up itself.
            if (outcome.currentPlayerId === this._player.id && this._board.canAcceptCommandFor(this._player.id)) {
                void this._dispatchMovementCommand();
            }
        }
    }

    /**
     * Gets the difficulty level of the computer wizard, from 0 (easiest) to 1
     * (hardest).
     */
    public get difficulty(): number {
        return this._difficulty;
    }

    /**
     * Gets or sets the preferred target piece ID for the next spell cast.
     * Set by selectSpell when it identifies a high-priority target,
     * consumed and cleared by autoCastSpell.
     */
    public get preferredTargetId(): number | null {
        return this._preferredTargetId;
    }

    public set preferredTargetId(id: number | null) {
        this._preferredTargetId = id;
    }

    /**
     * Check the players on the board, and evaluate their threat levels based on
     * proximity and strength of their units. This updates
     * `_enemyPlayerPriorities` accordingly.
     */
    protected evaluateEnemyPlayerPriorities(): void {
        this._enemyPlayerPriorities.clear();

        // First of all, who's left to fight?
        const enemyPlayers: Player[] = this._board.players.filter((p: Player) => {
            return p !== this._player && !p.defeated;
        });

        // Evaluate each enemy player
        for (const enemy of enemyPlayers) {
            let threatLevel: number = 0;
            const enemyPieces: Piece[] = this._board.getPiecesByOwner(enemy).filter((p: Piece) => {
                return !p.dead && !p.hasStatus(UnitStatus.Structure);
            });

            for (const enemyPiece of enemyPieces) {
                threatLevel += enemyPiece.strength;
            }
            this._enemyPlayerPriorities.set(enemy, threatLevel);
        }

        // Temper the threat levels based on the average distance to our wizard
        // of the enemy's pieces
        const wizardPiece: Piece | null = this._player.castingPiece;

        if (!wizardPiece) {
            console.error(`Cannot evaluate enemy player priorities for ${this._player.name} as they have no wizard`);
            return;
        }

        for (const [enemy, threatLevel] of this._enemyPlayerPriorities) {
            const enemyPieces: Piece[] = this._board.getPiecesByOwner(enemy).filter((p: Piece) => {
                return (
                    !p.dead && // Not dead (corpses aren't usually owned, but just in case)
                    !p.hasStatus(UnitStatus.Structure) && // Not a structure
                    (p.canAttackPiece(wizardPiece) || // Can attack our wizard
                        p.hasStatus(UnitStatus.Spreads)) // Or can spread (which is also dangerous for a wizard)
                );
            });
            let totalDistance: number = 0;
            if (enemyPieces.length === 0) {
                // No threatening pieces, so just put the enemy wizard into the
                // enemyPieces list
                enemyPieces.push(enemy.castingPiece);
            }
            for (const enemyPiece of enemyPieces) {
                const distance: number = Board.distance(wizardPiece.position, enemyPiece.position);
                totalDistance += distance;
            }
            const averageDistance: number = totalDistance / enemyPieces.length;
            const adjustedThreatLevel: number = threatLevel / (averageDistance + 1);
            this._enemyPlayerPriorities.set(enemy, adjustedThreatLevel);
        }

        // Normalise threat levels to 0-1 range, with 1 always being the highest
        // perceived threat
        const maxThreatLevel: number = Math.max(...this._enemyPlayerPriorities.values(), 1);
        for (const [enemy, threatLevel] of this._enemyPlayerPriorities) {
            this._enemyPlayerPriorities.set(enemy, threatLevel / maxThreatLevel);
        }

        console.debug(
            `Enemy player threat levels for ${this._player.name}:`,
            Object.fromEntries(this._enemyPlayerPriorities),
        );
    }

    /**
     * Gets the aggression level of the computer wizard, from 0 (least
     * aggressive) to 1 (most aggressive). This affects how likely the computer
     * wizard is to take risks, such as attacking or moving into dangerous
     * positions.
     */
    private get aggression(): number {
        return Math.min(Math.max(this._difficulty + 0.2, 0), 1);
    }

    /**
     * Given a list of spells, finds all valid targets for each spell.
     *
     * @param board the game board to search for targets on
     * @param spells the spells to find targets for
     */
    public static findSpellTargets(board: Board, spells: Spell[]): Map<Spell, Piece[]> {
        const targets: Map<Spell, Piece[]> = new Map();

        // Loop over all of the board pieces, and ask each spell if it can
        // target that piece
        for (const spell of spells) {
            for (let piece of board.pieces) {
                if (spell.getValidTarget(piece, false)) {
                    if (!targets.has(spell)) {
                        targets.set(spell, []);
                    }
                    targets.get(spell).push(piece);
                }
            }
        }

        // For spells which destroy wizard creatures, filter out any wizard
        // targets whose owner has no other units to target. While they're
        // technically a valid target, it's not strategically sound to do so.
        const justiceSpells: Spell[] = spells.filter((spell: Spell) => {
            return spell.type === SpellType.Attack && spell.properties.destroyWizardCreatures;
        });

        // No justice spells, nothing to filter
        if (!justiceSpells.length) {
            return targets;
        }

        // Filter each justice spell's targets
        for (const justiceSpell of justiceSpells) {
            if (targets.has(justiceSpell)) {
                const filteredTargets: Piece[] = [];
                for (const piece of targets.get(justiceSpell)) {
                    if (piece.type === UnitType.Wizard) {
                        const wizardOwner: Player = piece.owner;
                        const ownerUnits: Piece[] = board.getPiecesByOwner(wizardOwner).filter((p: Piece) => {
                            return p.type !== UnitType.Wizard && !p.dead;
                        });
                        // Only keep this wizard target if its owner has
                        // non-dead, non-wizard units
                        if (ownerUnits.length > 0) {
                            filteredTargets.push(piece);
                        }
                    }
                    targets.set(justiceSpell, filteredTargets);
                }
            }
        }

        return targets;
    }

    /**
     * Finds valid targets for the given spells.
     *
     * @param spells the spells to find targets for
     * @returns a map of spells to their valid targets
     */
    protected findSpellTargets(spells: Spell[]): Map<Spell, Piece[]> {
        return ComputerWizard.findSpellTargets(this._board, spells);
    }

    /**
     * Causes the computer wizard to forget some of its knowledge about
     * illusions over time.
     */
    public forgetIllusionKnowledge(): void {
        // Small chance to forget a known non-illusion piece each turn
        // Graph: https://www.desmos.com/calculator/ismripyway
        const forgetChance: number = Math.min(
            0.001, // Cap at 0.1% minimum chance
            -(0.4 * Math.log(Math.max(0.1, this._difficulty))) * 0.3, // Higher difficulties forget less often; 1 = 0.1%, 0.5 = 8%, 0.1 = ~28%
        );
        for (const pieceId of this._knownNonIllusionPieces) {
            // If we succeed the 'forget' roll, stop tracking this piece as a
            // known non-illusion
            if (this._board.rollChance(forgetChance)) {
                this._knownNonIllusionPieces.delete(pieceId);
                console.debug(`${this._player.name} has forgotten that piece ID ${pieceId} is not an illusion`);
            }
        }
    }

    /**
     * Remembers that a given piece is not an illusion. Has a chance to fail
     * based on the computer wizard's difficulty level.
     *
     * @param pieceId the ID of the piece to remember
     */
    public rememberNonIllusionPiece(pieceId: number): void {
        const rememberChance: number = 0.2 + this._difficulty; // Harder difficulties remember more often
        if (!this._board.rollChance(rememberChance)) {
            console.debug(`${this._player.name} failed to notice that piece ID ${pieceId} is not an illusion`);
            return;
        }
        console.debug(
            `${this._player.name} has learned from another player that piece ID ${pieceId} is not an illusion`,
        );
        this._knownNonIllusionPieces.add(pieceId);
    }

    /**
     * Checks if the computer wizard knows that a given piece is not an illusion.
     *
     * @param pieceId the ID of the piece to check
     * @returns true if the piece is known to be non-illusion, false otherwise
     */
    public knowsPieceIsNonIllusion(pieceId: number): boolean {
        return this._knownNonIllusionPieces.has(pieceId);
    }

    /**
     * Looks up the effective casting chance for the spell that summons a unit
     * with the given unit ID, adjusted by the universe alignment (chaotic
     * spells are easier on a chaotic board, and vice versa).
     *
     * @param unitId the unit ID to look up
     * @param alignment the board's alignment tracker, used to compute the chance modifier
     * @returns the effective casting chance (0.1-1), or null if no matching spell found
     */
    private static getSpellChanceForUnit(unitId: string, alignment: Alignment): number | null {
        for (const spellConfig of Object.values(Spell.spells)) {
            if (spellConfig.unitId === unitId || spellConfig.unit?.id === unitId) {
                // Apply the same alignment adjustment as Spell.chance
                if (spellConfig.balance === 0) {
                    return spellConfig.chance;
                }
                const adjusted: number = alignment.adjustChance(spellConfig.chance, spellConfig.balance);
                return Math.min(Math.max(adjusted, 0.1), 1);
            }
        }
        return null;
    }

    /**
     * Reorder a targets array so that the preferred target (if present) is
     * first. This causes `weightedPick` to strongly favour it.
     * Returns the array unchanged if no preferred target or not found.
     *
     * @param targets the original targets array
     * @param preferredId the preferred piece ID, or null
     * @returns a new array with the preferred target first, or the original
     */
    static withPreferredFirst(targets: Piece[], preferredId: number | null): Piece[] {
        if (preferredId == null) return targets;
        const idx: number = targets.findIndex((p) => p.id === preferredId);
        if (idx <= 0) return targets; // Not found or already first
        return [targets[idx], ...targets.slice(0, idx), ...targets.slice(idx + 1)];
    }

    /**
     * Build the spellbook-pick command this AI wants to submit. Returns
     * an `end-spell-pick` command when no spell can or should be chosen.
     * The state mutations the legacy `selectSpell` performed
     * (`player.pickSpell`, `spell.illusion = ...`) are now applied by
     * `Board.handleCommand` from the command's payload.
     */
    private _computePickSpellCommand(): PickSpellCommand | EndSpellPickCommand {
        this._board.events.emit(EngineEvent.AiThinking);

        // Re-evaluate enemy player priorities as this may impact our spell
        // choices
        this.evaluateEnemyPlayerPriorities();

        // Possibly forget some illusion knowledge
        this.forgetIllusionKnowledge();
        try {
            let spells: Spell[] = this._player.spells;

            if (!spells.length) {
                console.debug(`${this._player.name} has no spells to cast`);
                this._board.events.emit(EngineEvent.EffectRequested, {
                    sound: "cancel",
                });
                return this._buildEndSpellPickCommand();
            }

            // Filter out any spells that have no valid targets
            const validSpellsTargets: Map<Spell, Piece[]> = this.findSpellTargets(spells);
            spells = spells.filter((spell: Spell) => {
                return (
                    spell.properties.unitId ||
                    spell.properties.unit || // Summon spells are always valid
                    spell.properties.target === "self" || // Self-targeting spells are always valid
                    validSpellsTargets.get(spell)?.length > 0
                ); // Has valid targets
            });

            // Filter out Disbelieve if there are no valid targets, or
            // consider preferring it against suspected illusions —
            // high-strength units with low casting chances are more likely
            // to have been cast as illusions
            const disbelieveSpell: Spell | undefined = spells.find((spell: Spell) => {
                return spell.type === SpellType.Disbelieve;
            });
            if (disbelieveSpell) {
                const potentialTargets: Piece[] = this._board.pieces.filter((p: Piece) => {
                    return (
                        p.owner !== this._player && // Enemy piece
                        !p.dead && // Not dead
                        p.canBeDisbelieved && // Can be disbelieved
                        !p.raisedDead && // Not raised dead (can't be an illusion)
                        !this._knownNonIllusionPieces.has(p.id) // Not already known to be non-illusion
                    );
                });
                if (potentialTargets.length === 0) {
                    // No valid targets for Disbelieve, remove it from the list
                    spells = spells.filter((spell: Spell) => {
                        return spell.type !== SpellType.Disbelieve;
                    });
                } else {
                    // Score each potential target by how suspicious it looks:
                    // high strength + low casting chance = likely an illusion
                    const wizardPiece: Piece | null = this._player.castingPiece;
                    if (wizardPiece) {
                        const wizardThreats: Set<Piece> = wizardPiece.findThreatPieces();

                        let bestSuspicion: number = 0;
                        let bestTarget: Piece | null = null;

                        for (const piece of potentialTargets) {
                            const castChance: number | null = ComputerWizard.getSpellChanceForUnit(
                                piece.properties.id,
                                this._board.alignment,
                            );
                            if (castChance === null) continue;

                            let suspicion: number = piece.strength * (1 - castChance);

                            // Dampen by distance — nearby pieces keep most
                            // of their suspicion, distant ones fade out
                            const distance: number = Board.distance(wizardPiece.position, piece.position);
                            suspicion *= 5 / (5 + distance);

                            // Boost if this piece actively threatens our wizard
                            if (wizardThreats.has(piece)) {
                                suspicion *= 2;
                            }

                            if (suspicion > bestSuspicion) {
                                bestSuspicion = suspicion;
                                bestTarget = piece;
                            }
                        }

                        if (bestTarget) {
                            // Normalise to [0,1], apply contrast curve, then
                            // gate by difficulty. Higher contrast suppresses
                            // low-suspicion targets while keeping the AI
                            // aggressive against genuine threats.
                            const normalised: number = Math.min(bestSuspicion / 25, 1);
                            const disbelievePreference: number = Math.min(
                                Math.pow(normalised, ComputerWizard.DISBELIEVE_CONTRAST) * this._difficulty,
                                1,
                            );

                            if (this._board.rollChance(disbelievePreference)) {
                                console.debug(
                                    `${this._player.name} suspects ${bestTarget.fullName} may be an illusion (suspicion: ${bestSuspicion.toFixed(1)}) and prefers Disbelieve`,
                                );
                                this._preferredTargetId = bestTarget.id;
                                return this._buildPickSpellCommand(disbelieveSpell.id);
                            }
                        }
                    }
                }
            }

            // Rank spells by how likely they are to cast to play conservatively
            spells.sort((a, b) => {
                if (a.chance > b.chance) {
                    return -1;
                }
                if (a.chance < b.chance) {
                    return 1;
                }
                return 0;
            });

            const pickedSpell: SummonSpell = this._board.rng.weightedPick(spells) as SummonSpell;

            if (!pickedSpell) {
                console.debug(`${this._player.name} failed to pick a spell`);
                this._board.events.emit(EngineEvent.EffectRequested, {
                    sound: "cancel",
                });
                return this._buildEndSpellPickCommand();
            }

            // The lower the spell's cast chance, the more likely we are to cast
            // it as an illusion. The illusion bit travels on the command;
            // `handleCommand` applies it to the spell.
            let illusion: boolean | undefined;
            if (pickedSpell.allowIllusion) {
                const roll: number = this._board.rng.realInRange(0.1, 1);
                if (roll > pickedSpell.chance) {
                    illusion = true;
                }
            }

            return this._buildPickSpellCommand(pickedSpell.id, illusion);
        } catch (error) {
            console.error(`Error selecting spell for ${this._player.name}:`, error);
            return this._buildEndSpellPickCommand();
        } finally {
            this._board.events.emit(EngineEvent.AiActing);
        }
    }

    /**
     * Construct a `PickSpellCommand` for the given spell instance id.
     */
    private _buildPickSpellCommand(spellId: number, illusion?: boolean): PickSpellCommand {
        return {
            type: "command",
            commandId: this._nextCommandId(),
            token: "",
            kind: "pick-spell",
            spellId,
            ...(illusion === true ? { illusion: true } : {}),
        };
    }

    /**
     * Construct an `EndSpellPickCommand` for an explicit AI skip.
     */
    private _buildEndSpellPickCommand(): EndSpellPickCommand {
        return {
            type: "command",
            commandId: this._nextCommandId(),
            token: "",
            kind: "end-spell-pick",
        };
    }

    /**
     * Automatically casts the currently selected spell for the specified player
     * on the board. Normally used for computer-controlled wizards, but can also
     * be used for auto-casting spells for human players (e.g., Magic Wood)
     *
     * @param board The game board on which the spell is to be cast.
     * @param player The player who is casting the spell.
     * @returns A promise that resolves to true if the spell was cast successfully, false otherwise.
     */
    static async autoCastSpell(board: Board, player: Player): Promise<boolean> {
        board.events.emit(EngineEvent.AiThinking);
        try {
            // Capture and clear the preferred target set by selectSpell
            const preferredTargetId: number | null = player.ai?.preferredTargetId ?? null;
            if (player.ai) {
                player.ai.preferredTargetId = null;
            }

            const spell: Spell | null = await player.useSpell();
            let successfullyCast: boolean = false;
            if (spell) {
                if (spell.type === SpellType.Summon) {
                    return await (spell as SummonSpell).autoCast(player);
                } else if (spell.type === SpellType.Buff) {
                    await board.rules.doCastSpell(board, player.castingPiece);
                    return true;
                } else if (spell.type === SpellType.Attack) {
                    const attackSpell: AttackSpell = spell as AttackSpell;
                    console.debug(`${player.name} is casting attack spell ${spell.name}`);
                    while (attackSpell.castTimes > 0) {
                        const targets: Piece[] = (
                            ComputerWizard.findSpellTargets(board, [attackSpell]).get(attackSpell) || []
                        ).toSorted((a: Piece, b: Piece) => {
                            // Prefer wizard or high strength targets
                            if (a.type === UnitType.Wizard && b.type !== UnitType.Wizard) {
                                return -1;
                            }
                            if (a.type !== UnitType.Wizard && b.type === UnitType.Wizard) {
                                return 1;
                            }
                            return b.strength - a.strength;
                        });
                        if (!targets.length) {
                            console.debug(`${player.name} has no valid targets to cast ${spell.name}`);
                            if (successfullyCast) {
                                player.discardSpell();
                            }
                            board.events.emit(EngineEvent.EffectRequested, {
                                sound: "cancel",
                            });
                            return false;
                        }
                        console.debug(`${player.name} has ${targets.length} valid targets to cast ${spell.name}`);
                        const target: Piece = board.rng.weightedPick(
                            ComputerWizard.withPreferredFirst(targets, preferredTargetId),
                        );
                        console.debug(`${player.name} is casting ${spell.name} on target ${target.name}`);
                        board.events.emit(EngineEvent.FocusPieces, {
                            pieceIds: [target.id],
                        });
                        await board.rules.doCastSpell(board, target);
                        successfullyCast = true;
                    }
                    return true;
                } else if (spell.type === SpellType.Disbelieve) {
                    console.debug(`${player.name} is casting Disbelieve`);
                    const potentialTargets: Piece[] = board.pieces.filter((p: Piece) => {
                        return (
                            p.owner !== player && // Enemy piece
                            !p.dead && // Not dead
                            p.canBeDisbelieved && // Can be disbelieved
                            !player.ai?.knowsPieceIsNonIllusion(p.id) // Not already known to be non-illusion
                        );
                    });

                    if (!potentialTargets.length) {
                        console.debug(`${player.name} has no valid targets to cast Disbelieve`);
                        board.events.emit(EngineEvent.EffectRequested, {
                            sound: "cancel",
                        });
                        return false;
                    }

                    let target: Piece;
                    if (preferredTargetId == null) {
                        target = board.rng.pick(potentialTargets);
                    } else {
                        // Disbelieve was chosen because of a specific
                        // suspected illusion — target it directly
                        target =
                            potentialTargets.find((p) => p.id === preferredTargetId) ??
                            board.rng.pick(potentialTargets);
                    }
                    board.events.emit(EngineEvent.FocusPieces, {
                        pieceIds: [target.id],
                    });
                    await board.rules.doCastSpell(board, target);
                    return true;
                } else if (spell.type === SpellType.Misc) {
                    if (spell.properties.target === "self") {
                        await board.rules.doCastSpell(board, player.castingPiece);
                        return true;
                    } else if ([SpellTarget.Piece, SpellTarget.Corpse].includes(spell.properties.target)) {
                        const potentialTargets: Piece[] = board.pieces.filter((p: Piece) => {
                            return spell.getValidTarget(p, false);
                        });

                        if (!potentialTargets.length) {
                            console.debug(`${player.name} has no valid targets to cast ${spell.name}`);
                            board.events.emit(EngineEvent.EffectRequested, {
                                sound: "cancel",
                            });
                            return false;
                        }
                        const miscReordered: Piece[] = ComputerWizard.withPreferredFirst(
                            potentialTargets,
                            preferredTargetId,
                        );
                        const target: Piece =
                            preferredTargetId == null
                                ? board.rng.pick(potentialTargets)
                                : board.rng.weightedPick(miscReordered);
                        board.events.emit(EngineEvent.FocusPieces, {
                            pieceIds: [target.id],
                        });
                        await board.rules.doCastSpell(board, target);
                        return true;
                    }
                }
            }
            board.events.emit(EngineEvent.EffectRequested, { sound: "cancel" });
            return false;
        } catch (error) {
            console.error(`Error casting spell for ${player.name}:`, error);
            return false;
        } finally {
            board.events.emit(EngineEvent.AiActing);
        }
    }

    /**
     * Build the cast or cancel command for one casting iteration. The
     * casting phase loop re-emits phase-changed for each multi-cast
     * iteration, so this method returns a single command per call;
     * subsequent calls (driven by the next phase-changed event) cover
     * the rest of a multi-cast spell.
     *
     * Returns a `CancelCastCommand` when no valid target can be found
     * for the currently-selected spell — this releases the slot and
     * forfeits any remaining casts.
     */
    private _computeCastSpellCommand(): CastSpellCommand | CancelCastCommand {
        this._board.events.emit(EngineEvent.AiThinking);
        try {
            const spell: Spell | null = this._player.selectedSpell;
            if (!spell) {
                return this._buildCancelCastCommand();
            }

            // Capture and clear the preferred target set by
            // `_computePickSpellCommand`. Only the first cast of a
            // multi-cast spell uses the preferred target.
            const preferredTargetId: number | null = this._preferredTargetId;
            this._preferredTargetId = null;

            const target: CommandSpellTarget | null = this._pickCastTarget(spell, preferredTargetId);
            if (target == null) {
                this._board.events.emit(EngineEvent.EffectRequested, { sound: "cancel" });
                return this._buildCancelCastCommand();
            }
            return this._buildCastSpellCommand(target);
        } catch (error) {
            console.error(`Error casting spell for ${this._player.name}:`, error);
            return this._buildCancelCastCommand();
        } finally {
            this._board.events.emit(EngineEvent.AiActing);
        }
    }

    /**
     * Pick a target for one cast of the given spell using the same
     * heuristics as the legacy `autoCastSpell`. Returns null when no
     * valid target is available.
     */
    private _pickCastTarget(spell: Spell, preferredTargetId: number | null): CommandSpellTarget | null {
        if (spell.type === SpellType.Summon) {
            return this._pickSummonTile(spell as SummonSpell);
        }
        if (spell.type === SpellType.Buff) {
            return { self: true };
        }
        if (spell.type === SpellType.Attack) {
            const attackSpell: AttackSpell = spell as AttackSpell;
            const targets: Piece[] = (
                ComputerWizard.findSpellTargets(this._board, [attackSpell]).get(attackSpell) || []
            ).toSorted((a: Piece, b: Piece) => {
                if (a.type === UnitType.Wizard && b.type !== UnitType.Wizard) return -1;
                if (a.type !== UnitType.Wizard && b.type === UnitType.Wizard) return 1;
                return b.strength - a.strength;
            });
            if (!targets.length) return null;
            const target: Piece = this._board.rng.weightedPick(
                ComputerWizard.withPreferredFirst(targets, preferredTargetId),
            );
            this._board.events.emit(EngineEvent.FocusPieces, { pieceIds: [target.id] });
            return { pieceId: target.id };
        }
        if (spell.type === SpellType.Disbelieve) {
            const potentialTargets: Piece[] = this._board.pieces.filter((p: Piece) => {
                return (
                    p.owner !== this._player && !p.dead && p.canBeDisbelieved && !this._knownNonIllusionPieces.has(p.id)
                );
            });
            if (!potentialTargets.length) return null;
            let target: Piece;
            if (preferredTargetId == null) {
                target = this._board.rng.pick(potentialTargets);
            } else {
                target =
                    potentialTargets.find((p) => p.id === preferredTargetId) ?? this._board.rng.pick(potentialTargets);
            }
            this._board.events.emit(EngineEvent.FocusPieces, { pieceIds: [target.id] });
            return { pieceId: target.id };
        }
        if (spell.type === SpellType.Misc) {
            if (spell.properties.target === "self") {
                return { self: true };
            }
            if ([SpellTarget.Piece, SpellTarget.Corpse].includes(spell.properties.target)) {
                const potentialTargets: Piece[] = this._board.pieces.filter((p: Piece) => {
                    return spell.getValidTarget(p, false);
                });
                if (!potentialTargets.length) return null;
                const reordered: Piece[] = ComputerWizard.withPreferredFirst(potentialTargets, preferredTargetId);
                const target: Piece =
                    preferredTargetId == null
                        ? this._board.rng.pick(potentialTargets)
                        : this._board.rng.weightedPick(reordered);
                this._board.events.emit(EngineEvent.FocusPieces, { pieceIds: [target.id] });
                return { pieceId: target.id };
            }
        }
        return null;
    }

    /**
     * Pick a tile for one summon-spell cast. Walks every board tile
     * once, collects those the spell considers valid, and returns one
     * via the board's RNG. The legacy `SummonSpell.autoCast` applied
     * fancier heuristics (mount placement, spreading direction, wall
     * pattern); a richer port is left for a follow-up — for now the
     * AI picks any valid tile, weighted toward the wizard.
     */
    private _pickSummonTile(spell: SummonSpell): CommandSpellTarget | null {
        const validTiles: Point[] = [];
        for (let xx = 0; xx < this._board.width; xx++) {
            for (let yy = 0; yy < this._board.height; yy++) {
                const pt = new Point(xx, yy);
                if (spell.getValidTarget(pt, false)) {
                    validTiles.push(pt);
                }
            }
        }
        if (!validTiles.length) return null;

        // Sort by distance to the wizard so weightedPick (which favours
        // the head of the array) prefers tiles near the caster.
        const wizardPos: Point | null = this._player.castingPiece?.position ?? null;
        if (wizardPos) {
            validTiles.sort((a, b) => Board.distance(a, wizardPos) - Board.distance(b, wizardPos));
        }

        const chosen: Point = this._board.rng.weightedPick(validTiles);
        return { point: { x: chosen.x, y: chosen.y } };
    }

    /**
     * Construct a `CastSpellCommand` for the given target.
     */
    private _buildCastSpellCommand(target: CommandSpellTarget): CastSpellCommand {
        return {
            type: "command",
            commandId: this._nextCommandId(),
            token: "",
            kind: "cast-spell",
            target,
        };
    }

    /**
     * Construct a `CancelCastCommand`.
     */
    private _buildCancelCastCommand(): CancelCastCommand {
        return {
            type: "command",
            commandId: this._nextCommandId(),
            token: "",
            kind: "cancel-cast",
        };
    }

    /**
     * Build the next movement-phase command for this AI's turn. Called
     * from `_onPhaseChanged` whenever a movement-phase slot opens for
     * this AI. The phase loop re-emits phase-changed after each
     * slot-closing command (move, attack, ranged-attack, mount,
     * end-piece-turn, end-movement-phase), which re-triggers this
     * method for the next decision.
     *
     * For commands that do not close their slot (select-piece,
     * cancel-piece-action), this method chains the follow-up itself by
     * recursing.
     *
     * When the AI judges no remaining piece has a useful action, it
     * dispatches `end-movement-phase` to close the player's slot loop.
     */
    private async _dispatchMovementCommand(): Promise<void> {
        // No piece selected yet: pick one and dispatch select-piece.
        // Since select-piece does not close the slot, we then recurse
        // to dispatch the follow-up action for the now-selected piece.
        if (!this._board.selected) {
            const candidate: Piece | null = this._chooseNextPieceToSelect();
            if (!candidate) {
                void this._board.handleCommand(this._player.id, this._buildEndMovementPhaseCommand());
                return;
            }
            this._board.events.emit(EngineEvent.FocusPieces, {
                pieceIds: [candidate.id],
            });
            await this._board.handleCommand(this._player.id, this._buildSelectPieceCommand(candidate));
            // The slot stays open after select-piece. The rangegizmo
            // needs to be populated before path computation, since the
            // engine's _handleSelectPiece does not do this itself.
            if (this._board.selected) {
                await this._board.rangeGizmo.generate(this._board.selected);
            }
            // Recurse to dispatch the action for the selected piece.
            if (this._board.canAcceptCommandFor(this._player.id)) {
                await this._dispatchMovementCommand();
            }
            return;
        }
        const piece: Piece = this._board.selected;
        const cmd = this._computeNextActionFor(piece);
        void this._board.handleCommand(this._player.id, cmd);
    }

    /**
     * Pick the next own-piece eligible for selection during the
     * movement phase. Mirrors the filter from the legacy
     * `moveAllUnits`: must be alive, selectable, not mounted (mounted
     * units move with their mounts), not turn-over, and not a
     * structure.
     */
    private _chooseNextPieceToSelect(): Piece | null {
        const candidate: Piece | undefined = this._board.getPiecesByOwner(this._player).find((p: Piece) => {
            return !p.dead && !p.currentMount && !p.turnOver && p.canSelect && !p.hasStatus(UnitStatus.Structure);
        });
        return candidate ?? null;
    }

    /**
     * Compute the next single command for the currently-selected
     * piece, mirroring the decision tree of the legacy `moveUnit`. The
     * legacy method walked engaged-attack -> melee-attack -> mount ->
     * fly-attack -> move -> ranged-attack in one sweep, mutating the
     * piece's turn flags between steps. The command pipeline only
     * accepts one mutation per slot; this method picks the highest-
     * priority single command and returns it. Subsequent phase-changed
     * fires (after the previous command's slot closes) re-enter this
     * method with the piece's flags now reflecting the prior action.
     *
     * Falls back to `end-piece-turn` when no useful action remains.
     */
    private _computeNextActionFor(
        piece: Piece,
    ): MovePieceCommand | AttackPieceCommand | RangedAttackPieceCommand | MountPieceCommand | EndPieceTurnCommand {
        // Branch A: engaged-attack. An engaged piece may swing at one
        // adjacent engaged enemy but cannot move. The legacy code
        // handled this first and mutated piece.moved/attacked so the
        // move block below would skip; here we simply return when an
        // engaged-attack target exists.
        if (piece.engaged && !piece.attacked) {
            const engagedEnemies: Piece[] = this._board.getAdjacentPiecesAtPosition(piece.position, (p: Piece) => {
                return (
                    p.owner !== this._player && // Enemy piece
                    !p.currentMount && // Not mounted
                    piece.canAttackPiece(p) && // Can attack target
                    piece.canAttackPossiblyUndeadPiece(p) // Can attack target even if undead
                );
            });
            if (engagedEnemies.length > 0) {
                const target: Piece = this._board.rng.pick(engagedEnemies);
                console.debug(`${piece.fullName} is engaged and attacks ${target.fullName}`);
                return this._buildAttackCommand(piece, target);
            }
            console.debug(`No engaged targets found for ${piece.fullName}`);
            // Fall through to ranged check: an engaged piece may still
            // ranged-attack if able. Skip the regular move/attack
            // block - engagement prevents it.
        }

        // Branch B: regular adjacent melee attack. Only when the piece
        // is not engaged (engagement gates this off) and a successful
        // aggression roll triggers it.
        const willAttack: boolean = this._board.rollChance(this.aggression);
        if (!willAttack) {
            console.debug(`${piece.fullName} will skip attacking this turn`);
        }
        if (!piece.engaged && !piece.attacked && piece.canAttack && willAttack) {
            const potentialAttackTargets: Piece[] = this._board
                .getAdjacentPiecesAtPosition(piece.position, (p: Piece) => {
                    return (
                        p.owner !== this._player && // Enemy piece
                        !p.currentMount && // Not mounted
                        piece.canAttackPiece(p) && // Can attack target
                        piece.canAttackPossiblyUndeadPiece(p) && // Can attack target even if undead
                        (p.canAttackPiece(piece) || p.hasStatus(UnitStatus.Spreads))
                    ); // Target can fight back or is dangerous
                })
                .toSorted((a: Piece, b: Piece) => {
                    // Prefer wizard targets
                    if (a.type === UnitType.Wizard && b.type !== UnitType.Wizard) {
                        return -1;
                    }
                    if (a.type !== UnitType.Wizard && b.type === UnitType.Wizard) {
                        return 1;
                    }
                    return 0;
                });
            if (potentialAttackTargets.length > 0) {
                const target: Piece = this._board.rng.weightedPick(potentialAttackTargets);
                console.debug(`${piece.fullName} attacks target ${target.name}`);
                return this._buildAttackCommand(piece, target);
            }
            console.debug(`No attack targets found for ${piece.fullName}`);
        } else {
            console.debug(`${piece.fullName} cannot attack or has already attacked`);
        }

        // Branch C: movement and movement-driven actions (mount, fly-
        // attack, tactical move). Engagement gates this whole block.
        if (!piece.engaged && !piece.moved && piece.canMove) {
            // Sub-branch C.1: wizard adjacent-mount priority. If the
            // wizard is unmounted and a mountable unit is adjacent,
            // possibly mount it (subject to a difficulty/danger roll).
            if (piece.type === UnitType.Wizard && piece.currentMount == null) {
                const mountablePieces: Piece[] = this._board.getAdjacentPiecesAtPosition(piece.position, (p: Piece) => {
                    return piece.canMountPiece(p);
                });
                if (mountablePieces.length > 0) {
                    let modifier: number = 0;
                    if (this._player.castingPiece.findThreatPieces().size > 0) {
                        console.debug(`${piece.fullName} is in danger and more likely to mount`);
                        modifier = this._difficulty * 0.5;
                    }
                    if (this._board.rollChance(Math.min(0.75 + (this._difficulty + modifier) * 0.25, 1))) {
                        const mountable: Piece = this._board.rng.pick(mountablePieces);
                        console.debug(`${piece.fullName} mounts ${mountable.fullName}`);
                        return this._buildMountCommand(piece, mountable);
                    }
                    console.debug(`${piece.fullName} chooses not to mount this turn`);
                    // TODO(task-13): legacy moveUnit returned false (no
                    // further action) when the wizard rolled to skip
                    // an adjacent mount. Here we fall through so the
                    // AI may still move or fly-attack on this slot.
                } else {
                    console.debug(`No friendly mountables found for ${piece.fullName}`);
                }
            }

            // Sub-branch C.2: flying attack. Search all positions
            // within fly range for an attackable enemy and go for
            // them with a greater chance the higher the difficulty.
            if (piece.hasStatus(UnitStatus.Flying) && this._board.rollChance(this.aggression)) {
                const flyPoints: Point[] = this._board.getPointsInRange(
                    piece.position,
                    piece.stats.movement,
                    false,
                    RangeType.Fly,
                );
                let targetPiece: Piece | null = null;
                for (const pos of flyPoints) {
                    targetPiece =
                        this._board.getPiecesAtPosition(pos, (p: Piece) => {
                            return (
                                p.owner !== this._player && // Enemy piece
                                piece.canAttackPossiblyUndeadPiece(p) && // Can attack target even if undead
                                piece.canAttackPiece(p) // Can attack target
                            );
                        })[0] || null;
                    if (targetPiece) {
                        break;
                    }
                }
                if (targetPiece) {
                    console.debug(`${piece.fullName} flies to attack ${targetPiece.fullName}`);
                    // TODO(task-13): the legacy moveUnit recursed back
                    // into moveUnit if the fly-attack triggered an
                    // engagement, then optionally fired a ranged
                    // attack afterwards. The new flow returns the
                    // attack command and relies on the next
                    // phase-changed re-fire to compute the follow-up.
                    return this._buildAttackCommand(piece, targetPiece);
                }
                console.debug(`No attackable targets in fly range for ${piece.fullName}`);
            } else {
                console.debug(`${piece.fullName} is not flying or did not roll to attack terminal paths`);
            }

            // Sub-branch C.3: tactical move. Pick a destination tile
            // using the same priority order as the legacy moveUnit.
            const reachableTiles: Point[] = Array.from(this._board.rangeGizmo.getAllValidPaths())
                .map((path: Path) => {
                    return path.nodes?.findLast((node) => node.traversable)?.pos;
                })
                .filter((pt: Point) => {
                    if (!pt) {
                        return false;
                    }
                    return !Point.equals(pt, piece.position);
                });
            if (reachableTiles.length === 0) {
                console.debug(`No reachable tiles for ${piece.fullName}`);
                this._board.events.emit(EngineEvent.EffectRequested, {
                    sound: "cancel",
                });
                // Skip move; fall through to ranged then end-turn.
            } else {
                let movePt: Point | null = null;

                if (piece === this._player.castingPiece) {
                    // Wizard priority 1: seek a mountable unit if
                    // unmounted. Higher difficulties do this more
                    // reliably (50% at diff 0, 100% at diff 1).
                    // Adjacent mounts are already handled above, so
                    // skip any that are already adjacent.
                    if (piece.currentMount == null && this._board.rollChance(0.5 + this._difficulty * 0.5)) {
                        const mountTargets: Piece[] = this._board.pieces.filter((p: Piece) => {
                            if (p.dead) return false;
                            if (!piece.canMountPiece(p)) return false;
                            return Board.distance(piece.position, p.position) > 1;
                        });
                        if (mountTargets.length > 0) {
                            let closestTile: Point | null = null;
                            let closestDist: number = Infinity;
                            let closestMount: Piece | null = null;
                            for (const tile of reachableTiles) {
                                for (const mount of mountTargets) {
                                    const dist: number = Board.distance(tile, mount.position);
                                    if (dist < closestDist) {
                                        closestDist = dist;
                                        closestTile = tile;
                                        closestMount = mount;
                                    }
                                }
                            }
                            if (closestTile) {
                                console.debug(
                                    `${piece.fullName} moves towards mountable unit ${closestMount?.fullName}`,
                                );
                                movePt = closestTile;
                            }
                        }
                    }
                    // Wizard priority 2: move away from threats when
                    // threatened. Higher difficulties do this more
                    // reliably (50% at diff 0, 100% at diff 1).
                    if (!movePt) {
                        const threats: Set<Piece> = piece.findThreatPieces();
                        if (threats.size > 0 && this._board.rollChance(0.5 + this._difficulty * 0.5)) {
                            const threatArray: Piece[] = Array.from(threats);
                            let safestTile: Point | null = null;
                            let maxMinDistance: number = -Infinity;
                            for (const tile of reachableTiles) {
                                const minDist: number = Math.min(
                                    ...threatArray.map((t: Piece) => Board.distance(tile, t.position)),
                                );
                                if (minDist > maxMinDistance) {
                                    maxMinDistance = minDist;
                                    safestTile = tile;
                                }
                            }
                            if (safestTile) {
                                console.debug(`${piece.fullName} moves away from ${threats.size} threat(s)`);
                                movePt = safestTile;
                            }
                        }
                    }
                } else if (this._board.rollChance(this.aggression)) {
                    // Non-wizard: move towards the highest priority
                    // enemy. If the closest reachable tile is occupied
                    // by an attackable enemy, attack rather than move.
                    const highestPriorityEnemy: Player | null =
                        Array.from(this._enemyPlayerPriorities.entries()).toSorted((a, b) => b[1] - a[1])[0]?.[0] ||
                        null;

                    if (highestPriorityEnemy) {
                        let closestTile: Point | null = null;
                        let closestDistance: number = Infinity;
                        let closestPiece: Piece | null = null;
                        const enemyPieces: Piece[] = this._board
                            .getPiecesByOwner(highestPriorityEnemy)
                            .filter((p: Piece) => {
                                return (
                                    !p.dead && // Not dead
                                    piece.canAttackPossiblyUndeadPiece(p) && // Can attack target even if undead
                                    piece.canAttackPiece(p) // Can attack target
                                );
                            });
                        for (const tile of reachableTiles) {
                            for (const enemyPiece of enemyPieces) {
                                const distance: number = Board.distance(tile, enemyPiece.position);
                                const effectiveDistance: number =
                                    enemyPiece.type === UnitType.Wizard
                                        ? distance * Math.max(0.1, 1 - this.difficulty)
                                        : distance;
                                if (effectiveDistance < closestDistance) {
                                    closestDistance = effectiveDistance;
                                    closestTile = tile;
                                    closestPiece = enemyPiece;
                                }
                            }
                        }
                        if (closestTile) {
                            const pieceAtTile: Piece | null =
                                this._board.getPiecesAtPosition(
                                    closestTile,
                                    (p: Piece) => !p.dead && p.owner !== this._player,
                                )[0] ?? null;
                            if (pieceAtTile) {
                                if (
                                    piece.canAttackPossiblyUndeadPiece(pieceAtTile) &&
                                    piece.canAttackPiece(pieceAtTile)
                                ) {
                                    console.debug(
                                        `${piece.fullName} chooses to attack ${pieceAtTile.fullName} rather than move towards them`,
                                    );
                                    return this._buildAttackCommand(piece, pieceAtTile);
                                }
                                console.debug(
                                    `${piece.fullName} cannot move to or attack ${pieceAtTile.fullName}; skipping tactical move`,
                                );
                            } else {
                                console.debug(
                                    `${piece.fullName} chooses to move tactically towards ${closestPiece?.fullName ?? highestPriorityEnemy.name}`,
                                );
                                movePt = closestTile;
                            }
                        } else {
                            console.debug(`Could not find closest tile to enemy pieces for ${piece.fullName}`);
                        }
                    }
                }
                // Fallback: pick a random unoccupied tile.
                if (!movePt) {
                    movePt = this._board.rng.pick(
                        reachableTiles.filter((pt: Point) => {
                            const pieceAtTile: Piece | null =
                                this._board.getPiecesAtPosition(pt, (p: Piece) => !p.dead)[0] ?? null;
                            return !pieceAtTile;
                        }),
                    );
                    if (movePt) {
                        console.debug(`${piece.fullName} chooses to move randomly`);
                    }
                }
                if (movePt) {
                    console.debug(`${piece.fullName} moves to (${movePt.x}, ${movePt.y})`);
                    this._board.events.emit(EngineEvent.FocusPosition, {
                        position: movePt,
                    });
                    return this._buildMoveCommand(piece, movePt);
                }
                console.debug(`${piece.fullName} could not find a valid tile to move to`);
                this._board.events.emit(EngineEvent.EffectRequested, {
                    sound: "cancel",
                });
            }
        }

        // Branch D: ranged attack. May fire even when the piece is
        // engaged (engagement only blocks melee, not ranged).
        if (!piece.rangedAttacked && piece.canRangedAttack) {
            const rangedTargets: Piece[] = this._board.pieces
                .filter((p: Piece) => {
                    return (
                        p.owner !== this._player && // Enemy piece
                        (p.stats.combat > 0 || p.stats.rangedCombat > 0 || p.hasStatus(UnitStatus.Spreads)) && // Is potentially dangerous
                        !p.currentMount && // Not mounted (can't target riders without killing the mount first)
                        piece.canAttackPossiblyUndeadPiece(p) &&
                        piece.canRangedAttackPiece(p) // In ranged attack range
                    );
                })
                .toSorted((a: Piece, b: Piece) => {
                    if (a.type === UnitType.Wizard && b.type !== UnitType.Wizard) {
                        return -1;
                    }
                    if (a.type !== UnitType.Wizard && b.type === UnitType.Wizard) {
                        return 1;
                    }
                    return 0;
                });
            if (rangedTargets.length > 0) {
                const target: Piece = this._board.rng.weightedPick(rangedTargets);
                this._board.events.emit(EngineEvent.FocusPieces, {
                    pieceIds: [target.id],
                });
                console.debug(`${piece.fullName} performs ranged attack on ${target.fullName}`);
                return this._buildRangedAttackCommand(piece, target);
            }
            console.debug(`No ranged attack targets found for ${piece.fullName}`);
        } else {
            console.debug(`${piece.fullName} cannot ranged attack or has already ranged attacked`);
        }

        // No useful action remains: end the piece's turn.
        return this._fallbackEndPieceTurnFor(piece);
    }

    /**
     * Construct a `SelectPieceCommand` for the given piece.
     */
    private _buildSelectPieceCommand(piece: Piece): SelectPieceCommand {
        return {
            type: "command",
            commandId: this._nextCommandId(),
            token: "",
            kind: "select-piece",
            pieceId: piece.id,
        };
    }

    /**
     * Construct a `MovePieceCommand` for moving the given piece to
     * the destination tile. The path is derived from the rangegizmo's
     * cached A* path.
     */
    private _buildMoveCommand(piece: Piece, to: Point): MovePieceCommand {
        const path: Point[] = this._computePathTo(piece, to);
        return {
            type: "command",
            commandId: this._nextCommandId(),
            token: "",
            kind: "move-piece",
            pieceId: piece.id,
            to: { x: to.x, y: to.y },
            path: path.map((p) => ({ x: p.x, y: p.y })),
        };
    }

    /**
     * Construct an `AttackPieceCommand` from `piece` against `target`.
     * The path stops one tile short of the target (the handler
     * resolves the attack from the terminal step).
     */
    private _buildAttackCommand(piece: Piece, target: Piece): AttackPieceCommand {
        const path: Point[] = this._computeAttackPath(piece, target);
        return {
            type: "command",
            commandId: this._nextCommandId(),
            token: "",
            kind: "attack-piece",
            attackerId: piece.id,
            targetId: target.id,
            path: path.map((p) => ({ x: p.x, y: p.y })),
        };
    }

    /**
     * Construct a `RangedAttackPieceCommand` from `piece` against
     * `target`. No path is required; the handler validates range.
     */
    private _buildRangedAttackCommand(piece: Piece, target: Piece): RangedAttackPieceCommand {
        return {
            type: "command",
            commandId: this._nextCommandId(),
            token: "",
            kind: "ranged-attack-piece",
            attackerId: piece.id,
            targetId: target.id,
        };
    }

    /**
     * Construct a `MountPieceCommand` for `wizard` to mount `mount`.
     * The path is empty when the wizard is already on the mount's
     * tile; otherwise it is the rangegizmo's cached path to the
     * mount's tile.
     */
    private _buildMountCommand(wizard: Piece, mount: Piece): MountPieceCommand {
        const path: Point[] =
            wizard.position.x === mount.position.x && wizard.position.y === mount.position.y
                ? []
                : this._computePathTo(wizard, mount.position);
        return {
            type: "command",
            commandId: this._nextCommandId(),
            token: "",
            kind: "mount-piece",
            wizardId: wizard.id,
            mountId: mount.id,
            path: path.map((p) => ({ x: p.x, y: p.y })),
        };
    }

    /**
     * Build an `EndPieceTurnCommand` as a no-action fallback when the
     * piece has nothing useful to do this slot.
     */
    private _fallbackEndPieceTurnFor(piece: Piece): EndPieceTurnCommand {
        return {
            type: "command",
            commandId: this._nextCommandId(),
            token: "",
            kind: "end-piece-turn",
            pieceId: piece.id,
        };
    }

    /**
     * Build an `EndMovementPhaseCommand` to close the AI's movement
     * slot loop when no remaining piece has a useful action.
     */
    private _buildEndMovementPhaseCommand(): EndMovementPhaseCommand {
        return {
            type: "command",
            commandId: this._nextCommandId(),
            token: "",
            kind: "end-movement-phase",
        };
    }

    /**
     * Compute a path from the piece's current position (exclusive) to
     * the destination tile (inclusive). Reads from the rangegizmo's
     * cached A* paths populated by the prior `rangeGizmo.generate(piece)`
     * call. Returns an empty array if no path exists.
     */
    private _computePathTo(piece: Piece, to: Point): Point[] {
        const path: Path | null = this._board.rangeGizmo.getPathTo(to);
        if (!path) return [];
        const nodes = path.nodes ?? [];
        const result: Point[] = [];
        for (const node of nodes) {
            if (node.pos.x === piece.position.x && node.pos.y === piece.position.y) continue;
            result.push(new Point(node.pos.x, node.pos.y));
        }
        return result;
    }

    /**
     * Compute a path that ends adjacent to (but not on) the target's
     * tile. Walks all 8 adjacent tiles and picks the one with the
     * cheapest path. Returns an empty array if no adjacent tile is
     * reachable - the handler then rejects with `invalid-move` for
     * non-flying / non-zero-mov attackers, or accepts the empty path
     * for already-adjacent or flying attackers.
     */
    private _computeAttackPath(attacker: Piece, target: Piece): Point[] {
        const adj: Point[] = this._board.getAdjacentPoints(target.position, false);
        let best: Point[] = [];
        let bestCost: number = Infinity;
        for (const tile of adj) {
            const path: Path | null = this._board.rangeGizmo.getPathTo(tile);
            if (path && path.cost < bestCost) {
                bestCost = path.cost;
                best = (path.nodes ?? [])
                    .filter((n) => !(n.pos.x === attacker.position.x && n.pos.y === attacker.position.y))
                    .map((n) => new Point(n.pos.x, n.pos.y));
            }
        }
        return best;
    }

    /**
     * Legacy entry point. Decision logic now flows through
     * `_dispatchMovementCommand` on phase-changed events. The
     * RemotePlayer interface still requires this method until a later
     * task removes it.
     */
    async moveUnit(_piece: Piece): Promise<boolean> {
        return false;
    }

    /**
     * Legacy entry point. The slot loop in Board.openMovementSlotFor
     * drives the AI movement-phase commands directly via the
     * phase-changed event subscription. This method is retained as
     * a no-op so the RemotePlayer interface still binds; we still
     * call evaluateEnemyPlayerPriorities here so the threat data is
     * fresh when _computeNextActionFor reads it on the first
     * phase-changed fire.
     */
    async moveAllUnits(): Promise<void> {
        this.evaluateEnemyPlayerPriorities();
    }
}

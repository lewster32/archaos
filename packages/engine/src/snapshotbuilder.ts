import type { Board } from "./board";
import { BoardPhase } from "./enums/boardphase";
import type { Piece } from "./piece";
import type { Player } from "./player";
import type { Spell } from "./spells/spell";
import type { PhaseKind, PieceState, PlayerId, PlayerPublicState, SnapshotMessage, SpellbookEntry } from "./protocol";

/**
 * Map a {@link BoardPhase} enum value to the protocol's
 * {@link PhaseKind} string. `BoardPhase.Idle` has no direct
 * protocol equivalent; it is treated as `"spellbook"` until
 * the game formally starts.
 */
function toPhaseKind(phase: BoardPhase): PhaseKind {
    switch (phase) {
        case BoardPhase.Spellbook:
            return "spellbook";
        case BoardPhase.Casting:
            return "casting";
        case BoardPhase.Spreading:
            return "spreading";
        case BoardPhase.Moving:
            return "movement";
        default:
            return "spellbook";
    }
}

/**
 * Convert a numeric colour value (e.g. `0xff0000`) to a
 * six-character lowercase hex string without a leading `#`
 * (e.g. `"ff0000"`).
 */
function colourToHex(colour: number): string {
    return colour.toString(16).padStart(6, "0");
}

/**
 * Walk the board's current state and produce a `SnapshotMessage`
 * addressed to the given recipient. Pure, read-only — performs no
 * mutations and no emissions.
 *
 * The snapshot's `sequence` field is set to the board's current event
 * log head.
 *
 * @param board The board to snapshot.
 * @param recipient The player id the snapshot is addressed to.
 * @returns A complete `SnapshotMessage`.
 */
export function buildSnapshot(board: Board, recipient: PlayerId): SnapshotMessage {
    const scenario = {
        boardWidth: board.width,
        boardHeight: board.height,
        weather: {},
    };

    const players: PlayerPublicState[] = board.players.map((p: Player) => ({
        id: p.id,
        name: p.name,
        colour: colourToHex(p.colour),
        castingPieceId: p.castingPiece ? p.castingPiece.id : null,
        defeated: p.defeated,
        pickedSpell: p.selectedSpell ? true : null,
    }));

    const pieces: PieceState[] = board.pieces.map((piece: Piece) => {
        const wizCode: string | undefined = (piece as unknown as { wizCode?: string }).wizCode;
        return {
            id: piece.id,
            typeId: piece.properties.id ?? String(piece.id),
            ...(wizCode === undefined ? {} : { wizCode }),
            ownerId: piece.owner ? piece.owner.id : 0,
            position: { x: piece.position.x, y: piece.position.y },
            stats: {
                mov: piece.stats.movement,
                com: piece.stats.combat,
                rcm: piece.stats.rangedCombat,
                rng: piece.stats.range,
                def: piece.stats.defence,
                mnv: piece.stats.manoeuvrability,
                res: piece.stats.magicResistance,
            },
            statuses: piece.properties.status.map(String),
            flags: {
                turn: {
                    moved: piece.moved,
                    attacked: piece.attacked,
                    rangedAttacked: piece.rangedAttacked,
                    engaged: piece.engaged,
                    turnOver: piece.turnOver,
                },
                persistent: {
                    dead: piece.dead,
                    raisedDead: piece.raisedDead,
                },
            },
            currentMountId: piece.currentMount ? piece.currentMount.id : null,
            mountedById: piece.currentRider ? piece.currentRider.id : null,
        };
    });

    const recipientPlayer = board.players.find((p) => p.id === recipient);
    const spells: SpellbookEntry[] = recipientPlayer
        ? recipientPlayer.spells.map((s: Spell) => ({
              spellTypeId: s.properties.id ?? String(s.id),
              id: s.id,
          }))
        : [];

    return {
        type: "snapshot",
        sequence: board.eventLog.head(),
        recipient,
        state: {
            scenario,
            phase: {
                kind: toPhaseKind(board.phase),
                currentPlayerId: board.currentPlayer?.id ?? null,
                turnNumber: 0,
            },
            board: {
                alignment: {
                    value: board.alignment.value,
                    accumulatedValue: board.alignment.valueAccumulated,
                },
            },
            players,
            pieces,
            self: {
                spells,
                pickedSpell: null,
            },
        },
    };
}

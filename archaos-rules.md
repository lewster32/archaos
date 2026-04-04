# Archaos: Game Rules

Archaos is a turn-based tactical game where wizards fight with _magic spells_, summoned _creatures_ and their bare fists
to become the sole survivor.

## Play area

The game plays out on a _board_. This is a (typically square) grid of _tiles_ (may also be referred to as spaces), much
like a chess board. The board is initially empty and featureless other than each player's _wizard_. The wizard
represents the player on the board, and if the wizard is killed, the game is over for that player.

The wizard is a type of _piece_ that can exist on the board. A piece is any physical object on the board, such as a
summoned _creature_, _structure_ or _tree_.

Pieces cannot leave the constraints of the board. All gameplay takes place within the boundaries of the board's width
and height.

## Phases, states and turns

Every game is split into distinct parts which run in sequence. At the start of the game, each player's wizard is placed
on the board in a particular pattern based on the board size and number of players. Each player is given a random
selection of spells, plus _Disbelieve_, a spell which is always added, persists and always succeeds.

### Phases

Each phase runs through all of the active (i.e., not defeated) players in turn:

- `Spellbook` - Players choose a spell to cast from their list of spells, or skip selection
- `Casting` - Players take turns at casting their spells
- `Spreading` - Any pieces on the board with the `Spreads` status are ran through several iterations of the random 'cellular automata' routine
- `Moving` - Players take turns to move their pieces around the board; this is also where combat may take place

Once the last player has moved their pieces, the turn is over and the game returns back to the `Spellbook` phase.

### States

Within the phases (but not necessarily tied to them), there are distinct states that affect how the game can be
interacted with:

- `Busy` - Something is happening that prevents the player interacting with the board at this time
- `Idle` - Nothing is happening
- `View` - Pieces can be interacted with to show their stats
- `SelectSpell` - A player is selecting their spell
- `CastSpell` - A player is casting their spell
- `Move` - A player is moving a piece
- `Attack` - A player is attacking with a piece
- `RangedAttack` - A player is ranged attacking with a piece
- `Dismount` - A player is dismounting a piece with the `Mount` or `MountAny` status
- `GameOver` - The game has ended

### Game over

The game is considered ended when the number of undefeated players is less than 2. In most cases, the game will end with
a single remaining undefeated player, however it may be possible through the quirks of the spreading mechanic for all
remaining wizards to be killed in the same turn.

## Pieces / units

Every piece/unit (the term is used interchangably) has a series of _stats_ or _properties_ and possible _statuses_, as
well as various _flags_ and other unique aspects. Typically, all pieces have the following stats/properties:

- `mov` (movement) - how far the piece can move each turn
- `com` (combat) - how likely this unit will successfully kill another unit when melee attacking
- `rcm` (ranged combat) - how likely this unit will successfully kill another unit when ranged attacking
- `rng` (ranged combat range) - maximum distance of ranged combat targets
- `def` (defence) - how likely this unit will survive a melee attack
- `mnv` (manoeuvrability) - how likely the unit will break _engagement_ on subsequent turns
- `res` (magic resistance) - how likely a spell cast on this unit will succeed

If a stat is 0, this affects that piece's ability to do certain actions. Typically this is setting the `rcm` and `rng`
to 0 to show that a piece has no ranged combat abilities. A unit's `mov` may also be set to 0 to make it an immobile,
static unit, such as a structure or tree.

### Unit statuses

Units can have statuses that affect how they behave. These include:

- `Engulfs` - When combined with `Spreads`, can engulf other units
- `Expires` - Is removed from the board after a random number of turns
- `ExpiresGivesSpell` - Like `Expires`, but when combined with `Mount` or `MountAny`, gives a spell to the mounted wizard on expiry
- `Flying` - Can fly over obstacles, rather than have to move through each tile to get to their destination
- `Invulnerable` - Cannot be attacked by any offensive spell or action
- `Sanctity` - Cannot be attacked with magical attacks, e.g. _Magic Bolt_, _Vengeance_ etc.
- `Mount` - Mountable by its owning wizard
- `MountAny` - Mountable by any wizard, not just the owner, e.g. _Magic Wood_
- `Spreads` - Can spread to adjacent tiles, e.g. _Gooey Blob_ and _Magic Fire_; behaves like a cellular automaton
- `Structure` - Is a structure (typically combined with `mov` of 0)
- `Transparent` - Does not block _line of sight_
- `Tree` - Is a tree (used to prevent trees from being cast on adjacent tiles to other trees)
- `Undead` - Is an _undead_ piece, which mainly affects combat situations
- `Wizard` - Is the player's reprentative piece on the board. Can cast spells (i.e., is the so-called 'casting piece')
- `NoCorpse` - Does not leave a corpse when killed; typically combined with `Undead`
- `AttackUndead` - Can attack units with the `Undead` status

Wizard pieces can also have certain _buff_ statuses from spells:

- `ShadowForm` - Increases the unit's mov and def, and effectively makes their mnv infinitely high, breaking any _engagement_ at the start of the next turn
- `MagicWings` - Grants the `Flying` status
- `MagicShield` - Moderately increases the unit's def
- `MagicArmour` - Greatly increases the unit's def
- `MagicSword` - Greatly increases the unit's com and grants them the `AttackUndead` status
- `MagicBow` - Adds ranged combat ability to a unit, and grants them the `AttackUndead` status
- `MagicKnife` - Moderately increases the unit's com and grants them the `AttackUndead` status

## Movement and combat

During the `Moving` phase each player is given the opportunity to move their pieces. A player can move their pieces, or
skip their turn when they have moved as many as they wish. Once their turn is over, the next player in line gets to do
the same.

Each piece has a sequence of states they go through:

1. `Move` - If the piece can move, they may select a new tile in range to move to
2. `Attack` - If the piece can attack, and moves next to an engageable piece (or is already next to one), they may do so now
3. `RangedAttack` - If the piece can ranged attack, they may do so now

If the player cancels during the move or attack state, and a ranged attack is possible, the ranged attack state will be
checked to see if it can still be performed. Once the sequence is complete, that piece is flagged as its turn being
over, and it cannot be selected or perform any more actions for the remainder of the turn.

Depending on the piece's stats, there are some unusual scenarios. One such scenario is _Shadow Wood_, which is a piece
that cannot move (`mov = 0`), cannot engage (`mnv = 0`) but can attack (`com = 2`). This means if an enemy piece is
adjacent to shadow wood, it may be attacked. Because the shadow wood cannot move however, it _does not_ move into the
defeated enemy's place if combat succeeds.

### Types of movement

A piece without the `Flying` status has to move through every tile individually during their movement turn. This means
that a piece with a long movement range, such as the _Horse_, must avoid obstacles and engagement to navigate the board.

A piece with the `Flying` status on the other hand can move directly to any tile within range, skipping over obstacles.
If a flying piece lands next to an enemy unit

### Mounted pieces

Some pieces have the `Mount` status, which allows the owning wizard to mount them and ride them around the board. The
game acts as if the mounted piece is now the casting piece. The piece keeps its existing stats, but any spells are now
cast from that piece's position, and the wizard piece is effectively 'hidden' from the board. Its position is kept in
synchronisation with the mount however, so that if the mount is killed or the wizard dismounts, the wizard will appear
in the correct place.

If a wizard mounts a mountable piece, the mountable piece's movement turn is flagged as ended, and the piece's state
is advanced forward to check if melee or ranged attacks are possible.

At the start of a movement turn, the player can choose to dismount onto an adjacent tile, or indeed swap to another
adjacent mountable piece (e.g., to dismount a _Horse_ into a _Magic Wood_). If the player chooses to move the piece
instead, they will no longer be able to dismount during that turn.

A mounted wizard is protected from most harm, as attacks must defeat the mount first, causing the wizard to dismount.
There is however one scenario where a mounted wizard will be immediately destroyed: if a piece with the _Spreads_
status spreads onto their tile, this _always_ results in immediate defeat for the wizard caught in the spread.

Some mountable pieces are not creatures, but instead are _structures_ or _trees_. These do not offer movement benefits,
but instead serve to protect the wizard (e.g., _Magic Castle_) and, in some cases (e.g., _Magic Wood_), can grant new
spells.

### Melee combat

Both movement and combat happens in this phase. For melee combat, a piece simply has to attempt to move into the space
of an enemy piece. Doing so initiates melee combat between the pieces. Each unit rolls a d10 to decide the outcome of
the combat. The attacking piece rolls against their `com` stat, and the defending piece against their `def` stat. If the
attacking piece meets or exceeds the defending piece's roll, the combat is successful and the defending piece is killed.
The attacking piece then moves to occupy the tile that the defending piece was in.

**Note** that movement into the defeated enemy's tile is only possible if the attacking unit is able to move, i.e. its
`mov > 0`

Ground-based pieces must always melee attack from adjacent tiles, however pieces with the `Flying` status can attack
from afar, using their `mov` stat to determine how far. The same rules otherwise apply, and if successful, the attacking
piece will move onto the dead piece's tile.

### Undead combat

There are some particular mechanics around `Undead` pieces. These pieces are only able to be attacked in the following
situations:

1. The attacking piece is also undead
2. The attacking piece has the `AttackUndead` status
3. The attack is a magical attack spell

### Engagement

If a piece moves adjacent to another piece with the ability to melee attack (i.e., their `com` is > 0) then the piece
will become _engaged_ in combat. This gives the piece only two options: attack or cancel. This leads to an interesting
quirk in the movement mechanics; a piece can technically move one tile further than their `mov` stat allows, should
their destination be adjacent to an engageable piece, and should they be able to defeat said piece in combat.

At the start of a new movement turn, upon selecting a piece to move which is adjacent to engageable enemy pieces, the
`mnv` stats of the selected piece and the first engageable enemy found will be rolled for to decide whether the piece
remains engaged, forcing them to again attack or cancel, or disengages, allowing them to move away from the enemy.

Pieces with a `com = 0` do not count as engageable, however there are some `mnv` stats that can change the behaviour.
If the selected piece has `mnv < 0` they will always remain engaged with adjacent engageable pieces. On the other hand,
if a piece has `mnv = Infinity`, they will always cause adjacent pieces with `mnv > 0` to become and
remain engaged.

### Ranged combat

Pieces with `rcm` and `rng` stats may attack at range. The `RangedAttack` state is triggered when a piece with this
ability has moved and has valid targets in range. During this state, the piece may fire a projectile at any valid target
and roll their `rcm` against the target's `def`. A successful attack will kill the target, however, unlike melee, the
attacking unit will _not_ move to occupy the space.

## Spells and casting

Every wizard starts with a random selection of spells. Each spell has a _chance_ and a _balance_. The chance is the base
stat that decides how likely a spell is to fail or succeed. The balance is a spell's alignment towards _chaos_ or _law_.

Casting spells which have a _chaos_ balance will cause the game to shift towards a more chaotic state, meaning other
chaos-aligned spells will become easier to cast. Conversely, law-aligned spells will become more difficult to cast. This
same effect happens in reverse for spells cast with _law_ balance, thus the name 'balance' as the game shifts between
the two opposed alignments.

_Neutral_ spells are not affected by (nor do they affect) the balance of the game.

When a spell is cast, it is discarded from the player's list of spells, regardless of whether the spell succeeded or
failed.

Most spells have a single cast, however some, such as _Shadow Wood_, _Wall_ and _Dark Power_ can be cast multiple times
in a single casting session. If the player cancels casting before reaching the maximum cast times of a spell, it is
discarded.

### Spell types

The spells range in their effects, but most are categorisable into the following:

- _Summon_ - The most numerous of the spells, these summon a _piece_ onto an empty tile on the board for that player
- _Attack_ - Must be cast on a piece, and may either directly do magic damage, or may have other adverse effects depending on whether cast on a normal piece or a wizard
- _Buff_ - Always automatically cast on the casting player's wizard, and may augment the wizard piece's stats or abilities

#### Disbelieve

All players start with this spell, it is never consumed when cast and it always succeeds. Its purpose is to dispell
_illusionary_ pieces from the board. For almost all summonable pieces, the player is given the choice to cast the spell
as an illusion. If they pick 'yes', the spell will always succeed in casting, no matter its _chance_ or the game's
_balance_, however the piece can then subsequently be disbelieved to instantly destroy it.

#### Justice-like spells

The _Justice_, _Decree_, _Vengeance_ and _Dark Power_ attack spells all work in a similar way. If cast on a normal
piece, they act as a magical attack. If cast on a wizard however, they will instead, if successful, destroy all of that
wizard's pieces on the board, rather than killing the wizard directly.

**Note** that if the wizard being attacked is mounted, the mount will absorb the attack, thus the special wizard effect
only happens if the wizard is the one being attacked.

#### Miscellaneous spells

- _Law_ and _Chaos_ - Directly alter the _balance_ of the game when cast
- _Raise Dead_ - Allows a dead piece (a _corpse_) to be resurrected. The piece is converted from a _corpse_ to its non-dead state, but now with the `Undead` status.
- _Subversion_ - Brings an enemy piece under the casting player's ownership
- _Turmoil_ - A rare spell obtained only through the `ExpiresGivesSpell` status gifting it to the mounted wizard's player. Casting causes all pieces on the board to move randomly to another unoccupied tile on the board.

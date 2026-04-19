import type { BroadcastEventMessage, PrivateEventMessage } from "./events";
import type { SnapshotMessage } from "./snapshot";

/**
 * Any message the authoritative server may send to a client. The outer
 * discriminator is the `type` field (`"snapshot"`, `"event"`, or
 * `"private-event"`).
 */
export type ServerToClientMessage = SnapshotMessage | BroadcastEventMessage | PrivateEventMessage;

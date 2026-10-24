// Stable mutable registry; default eager mode preserves synchronous consumers.
import {legacyRoomRegistry,prepareLegacyRoomsAtStartup} from './legacy-room-loader.js';
export const ROOM_BOUNCE_DATA=legacyRoomRegistry.ROOM_BOUNCE_DATA;
await prepareLegacyRoomsAtStartup();

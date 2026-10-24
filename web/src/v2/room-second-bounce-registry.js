// Stable mutable registry; default eager mode preserves synchronous consumers.
import {legacyRoomRegistry,prepareLegacyRoomsAtStartup} from './legacy-room-loader.js';
export const ROOM_SECOND_BOUNCE_DATA=legacyRoomRegistry.ROOM_SECOND_BOUNCE_DATA;
await prepareLegacyRoomsAtStartup();

// Stable mutable registry; default eager mode preserves synchronous consumers.
import {legacyRoomRegistry,prepareLegacyRoomsAtStartup} from './legacy-room-loader.js';
export const ROOM_CONTACT_DATA=legacyRoomRegistry.ROOM_CONTACT_DATA;
await prepareLegacyRoomsAtStartup();

// Stable mutable registry; default eager mode preserves synchronous consumers.
import {legacyRoomRegistry,prepareLegacyRoomsAtStartup} from './legacy-room-loader.js';
export const ROOM_TRANSPORT_DATA=legacyRoomRegistry.ROOM_TRANSPORT_DATA;
await prepareLegacyRoomsAtStartup();

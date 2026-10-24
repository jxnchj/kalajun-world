// Stable mutable registry; default eager mode preserves synchronous consumers.
import {legacyRoomRegistry,prepareLegacyRoomsAtStartup} from './legacy-room-loader.js';
export const ROOM_APERTURE_DATA=legacyRoomRegistry.ROOM_APERTURE_DATA;
await prepareLegacyRoomsAtStartup();

import { Staff, Incident } from './types';

export const INITIAL_STAFF: Staff[] = [
  { id: 'SJ', name: 'Sarah Jenkins', role: 'Security', status: 'AVAILABLE', location: 'R412', color: '#EF4444' },
  { id: 'MT', name: 'Mike Thorne', role: 'Medical Officer', status: 'AVAILABLE', location: 'POOL', color: '#10B981' },
  { id: 'AR', name: 'Alex Rivera', role: 'Concierge', status: 'AVAILABLE', location: 'LOBBY', color: '#10B981' },
  { id: 'LC', name: 'Laura Chen', role: 'Floor Manager', status: 'ON_BREAK', location: null, color: '#F59E0B' },
  { id: 'RB', name: 'Ryan Bose', role: 'Security', status: 'AVAILABLE', location: null, color: '#64748B' }
];

export const INCIDENT_TYPES = ['Medical Emergency', 'Security Alert', 'Fire Alarm', 'Guest Distress', 'Maintenance', 'Unauthorized Entry', 'Water Leak', 'Power Outage'];

export const LOCATIONS = [
  'Room 401', 'Room 402', 'Room 403', 'Room 404', 'Room 405', 'Room 406', 'Room 407', 'Room 408', 'Room 409', 'Room 412',
  'Room 101', 'Room 205', 'Room 314',
  'Main Lobby', 'Pool Deck', 'Restaurant', 'Ballroom A', 'Elevator Bank B', 'Parking Level B2', 'Executive Lounge 12F', 'Gym - Level 2', 'Sauna', 'Roof Access'
];

export const SEVERITIES: ('CRITICAL' | 'HIGH' | 'MEDIUM')[] = ['CRITICAL', 'HIGH', 'MEDIUM'];

export const INITIAL_INCIDENTS: Incident[] = [];

export const FLOOR_PLAN_COORDS: Record<string, { x: number; y: number; floor: string }> = {
  // Floor 4 Rooms
  'Room 401': { x: 100, y: 100, floor: '4' },
  'Room 402': { x: 180, y: 100, floor: '4' },
  'Room 403': { x: 260, y: 100, floor: '4' },
  'Room 404': { x: 340, y: 100, floor: '4' },
  'Room 405': { x: 420, y: 100, floor: '4' },
  'Room 406': { x: 500, y: 100, floor: '4' },
  'Room 407': { x: 580, y: 100, floor: '4' },
  'Room 408': { x: 180, y: 300, floor: '4' },
  'Room 409': { x: 260, y: 300, floor: '4' },
  'Room 412': { x: 420, y: 300, floor: '4' },
  'Elevator Bank B': { x: 340, y: 300, floor: '4' },
  // Floor 1
  'Main Lobby': { x: 300, y: 200, floor: '1' },
  'Restaurant': { x: 150, y: 200, floor: '1' },
  // Amenities Deck
  'Pool Deck': { x: 300, y: 250, floor: 'AMENITIES' },
  'Gym - Level 2': { x: 150, y: 150, floor: 'AMENITIES' },
  'Sauna': { x: 450, y: 150, floor: 'AMENITIES' },
};

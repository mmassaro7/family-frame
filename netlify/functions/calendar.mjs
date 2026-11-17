// Netlify Function: the same logic as api/calendar.js, served at /api/calendar
import handler from '../../api/calendar.js';
import { adapt } from '../../lib/adapt.js';

export default adapt(handler);
export const config = { path: '/api/calendar' };

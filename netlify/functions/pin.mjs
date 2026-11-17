// Netlify Function: the same logic as api/pin.js, served at /api/pin
import handler from '../../api/pin.js';
import { adapt } from '../../lib/adapt.js';

export default adapt(handler);
export const config = { path: '/api/pin' };

// Netlify Function: the same logic as api/stocks.js, served at /api/stocks
import handler from '../../api/stocks.js';
import { adapt } from '../../lib/adapt.js';

export default adapt(handler);
export const config = { path: '/api/stocks' };

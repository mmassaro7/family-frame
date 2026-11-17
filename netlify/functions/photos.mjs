// Netlify Function: the same logic as api/photos.js, served at /api/photos
import handler from '../../api/photos.js';
import { adapt } from '../../lib/adapt.js';

export default adapt(handler);
export const config = { path: '/api/photos' };

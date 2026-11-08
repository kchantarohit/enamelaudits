import * as handlers from '../../api/health.js';
import { adapt } from '../adapter.js';

export default adapt(handlers);
export const config = { path: '/api/health' };

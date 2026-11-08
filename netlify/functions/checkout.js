import * as handlers from '../../api/checkout.js';
import { adapt } from '../adapter.js';

export default adapt(handlers);
export const config = { path: '/api/checkout' };

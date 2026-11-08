import * as handlers from '../../api/stripe-webhook.js';
import { adapt } from '../adapter.js';

export default adapt(handlers);
export const config = { path: '/api/stripe-webhook' };

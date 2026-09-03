/**
 * Real-Time Activity Trace & Event Bus
 * Records authentic, timestamped events as the agent discovers, reasons, acts, and verifies.
 */

export default class ActivityTrace {
  constructor() {
    this._events = [];
    this._listeners = new Set();
  }

  /**
   * Records a new activity event.
   *
   * @param {object} params
   * @param {string} params.stage - e.g. 'DISCOVER', 'AUDIT', 'CHECKPOINT', 'ACTUATE', 'VERIFY'
   * @param {string} params.message
   * @param {string} [params.type='info'] - 'info' | 'success' | 'warning' | 'error'
   * @param {object} [params.metadata={}]
   * @returns {object} The created event
   */
  log({ stage, message, type = 'info', metadata = {} }) {
    const now = new Date();
    const formattedTime = [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join(':');

    const event = {
      id: `trace_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      formattedTime,
      stage,
      message,
      type,
      metadata
    };

    this._events.push(event);
    this._notify(event);
    return event;
  }

  /**
   * Retrieves all recorded events.
   * @returns {Array<object>}
   */
  getEvents() {
    return [...this._events];
  }

  /**
   * Clears the event history.
   */
  clear() {
    this._events = [];
    this._notify({ stage: 'RESET', message: 'Activity trace cleared', type: 'info' });
  }

  /**
   * Subscribes to new events.
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _notify(event) {
    for (const cb of this._listeners) {
      try {
        cb(event);
      } catch (err) {
        console.error('Error in trace listener:', err);
      }
    }
  }
}

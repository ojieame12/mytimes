import type { ApiClientError } from './api';

export function participantClaimErrorMessage(error: ApiClientError): string {
  if (error.code === 'booking_limit_reached') {
    return 'This board is full. Contact the organizer for another time.';
  }
  if (error.code === 'slot_limit_reached') {
    return 'That time is no longer available. Pick another visible slot or refresh the board.';
  }
  if (error.code === 'event_expired') {
    return 'This booking board is no longer accepting bookings.';
  }
  if (error.code === 'event_payment_pending') {
    return 'This booking board is waiting for payment before it can accept bookings.';
  }
  return error.message;
}

export function createBoardErrorMessage(error: ApiClientError): string {
  if (error.code === 'slot_limit_reached') {
    return 'This setup is too large for the single-board unlock. Reduce the availability range, or use Company for larger recurring rounds.';
  }
  return error.message;
}

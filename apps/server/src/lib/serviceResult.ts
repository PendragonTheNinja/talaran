// How a service says "the server failed", and what status that becomes.
//
// Services return result objects rather than throwing, because the game tick
// calls many of them and reports the result to the player. When something
// unexpected fails inside one (a database error, a CHECK constraint refusing a
// write), its catch-all returns { error: SERVER_ERROR }. Routes used to forward
// every failed result as a 400, so a database failure looked like the player
// had asked for something invalid: status codes, logs and anything watching
// them could not tell the two apart (audit §15, found item 3).
//
// Services name the fault with SERVER_ERROR; routes pick the status with
// failureStatus. The text players see is unchanged.

/** The error every service returns when something unexpected failed. */
export const SERVER_ERROR = 'Server error';

/**
 * Status for a failed service result: 500 when the server failed, 400 when the
 * request itself was refused (not enough items, wrong place, bad input).
 */
export function failureStatus(error: string | undefined | null): 400 | 500 {
    return error === SERVER_ERROR ? 500 : 400;
}

// The four shapes every screen of this application uses to say where it is.
//
// They were written twelve times for four shapes: a load state in three
// modules, a pagination state in three, a feedback in four -- counting the one
// the ActionFeedback component declared for itself -- and an action result in
// two. Identical, character for character, and nothing said they had to stay
// that way: the day one of them gains a 'retrying' status, the other two do not
// hear about it, and two screens start meaning different things by the same
// word.
//
// The domain names stay, as aliases beside their shape. They carry the intent
// -- ItemsLoadState says which screen is loading -- while the shape is declared
// once. Removing them instead would have touched fifty-one files to gain
// nothing but shorter names.

// Whether the screen has its data yet. No 'idle': a screen that has not asked
// for anything is not a state this application renders, it is a screen that has
// not mounted.
export type LoadState =
    | { status: 'loading' }
    | { status: 'ready' }
    | { status: 'error'; message: string };

// Whether another page is on its way. Idle carries the announcement rather than
// nothing, because a live region that has just been emptied must still be able
// to say what arrived.
export type PaginationState =
    | { status: 'idle'; announcement: string }
    | { status: 'loading' }
    | { status: 'error'; message: string };

// What became of the last thing somebody asked for. Idle carries no message,
// which is what tells a live region to stay silent rather than repeat the last
// thing that happened.
export type Feedback =
    | { status: 'idle' }
    | { status: 'success'; message: string }
    | { status: 'error'; message: string };

// What one action answers to whoever triggered it. A success needs no message:
// the screen shows the change itself, and a line saying so would be noise.
export type ActionResult = { status: 'success' } | { status: 'error'; message: string };

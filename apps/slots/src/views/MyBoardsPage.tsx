import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import {
  ApiClientError,
  createMyBoardsAdminLink,
  readMyBoards,
  type MyBoardsResponse,
} from '../lib/api';
import { navigate } from '../lib/routing';

type MyBoard = MyBoardsResponse['boards'][number];

type PageState =
  | { status: 'missing-token' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: MyBoardsResponse };

function readTokenFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const url = new URL(window.location.href);
  const token = url.searchParams.get('t')?.trim();
  if (token) {
    url.searchParams.delete('t');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return token || undefined;
}

function formatCreated(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  return `${month} ${d.getDate()}, ${d.getFullYear()}`;
}

function planBadgeLabel(board: MyBoard) {
  if (board.status === 'archived') return 'ARCHIVED';
  if (board.planKey === 'company_standby') return 'COMPANY';
  if (board.planKey === 'event_pass') return 'UNLOCKED';
  if (board.paymentStatus === 'pending') return 'PENDING';
  if (board.paymentStatus === 'failed') return 'FAILED';
  return 'FREE';
}

function planBadgeKind(board: MyBoard) {
  if (board.status === 'archived') return 'archived';
  if (board.planKey === 'company_standby') return 'company';
  if (board.planKey === 'event_pass') return 'paid';
  if (board.paymentStatus === 'pending') return 'pending';
  return 'free';
}

export function MyBoardsPage() {
  const token = useMemo(readTokenFromUrl, []);
  const [state, setState] = useState<PageState>(() => (
    token ? { status: 'loading' } : { status: 'missing-token' }
  ));
  const [openingId, setOpeningId] = useState<string | undefined>();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setState({ status: 'loading' });
    readMyBoards(token)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: error instanceof ApiClientError || error instanceof Error
            ? error.message
            : 'Could not load your boards.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const openBoard = async (board: MyBoard) => {
    if (!token || openingId) return;
    setOpeningId(board.id);
    try {
      const response = await createMyBoardsAdminLink(token, board.id);
      window.location.assign(response.url);
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof ApiClientError || error instanceof Error
          ? error.message
          : 'Could not open this board.',
      });
    } finally {
      setOpeningId(undefined);
    }
  };

  if (state.status === 'missing-token') {
    return (
      <section className="my-boards-shell">
        <EmptyState
          title="Request your boards link."
          body="Enter your organizer email and we’ll send a private link listing every board tied to it."
          actionLabel="Email me the link"
          onAction={() => navigate('/my-boards/request')}
        />
      </section>
    );
  }

  if (state.status === 'loading') {
    return (
      <section className="my-boards-shell">
        <EmptyState
          title="Loading your boards."
          body="Checking this private link and pulling together your free and paid boards."
        />
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="my-boards-shell">
        <EmptyState
          title="This boards link is unavailable."
          body={state.message}
          actionLabel="Request a fresh link"
          onAction={() => navigate('/my-boards/request')}
        />
      </section>
    );
  }

  const boards = state.data.boards;
  const freeCount = boards.filter((b) => b.planKey === 'free' && b.status !== 'archived').length;
  const paidCount = boards.filter((b) => b.planKey !== 'free' && b.status !== 'archived').length;
  const totalBookings = boards.reduce((sum, b) => sum + b.bookingCount, 0);

  return (
    <section className="my-boards-shell">
      <section className="my-boards-card" aria-label="Your mytimes boards">
        <header className="my-boards-card__main">
          <div className="my-boards-card__text">
            <p className="my-boards-card__eyebrow">
              <span className="mono">{state.data.ownerEmail}</span> · your boards
            </p>
            <h1 className="my-boards-card__title">Your mytimes boards.</h1>
            <p className="my-boards-card__body">
              Boards you’ve created with this email, free and paid. Open any board
              to mint a fresh private admin link.
            </p>
          </div>
        </header>
        <div className="my-boards-card__strip">
          <div className="my-boards-card__strip-left">
            <span className="my-boards-card__strip-stat">
              <span className="my-boards-card__strip-num mono tabular">{freeCount}</span>
              <span className="my-boards-card__strip-label">free</span>
            </span>
            <span className="my-boards-card__strip-sep" aria-hidden="true" />
            <span className="my-boards-card__strip-stat">
              <span className="my-boards-card__strip-num mono tabular">{paidCount}</span>
              <span className="my-boards-card__strip-label">paid</span>
            </span>
            <span className="my-boards-card__strip-sep" aria-hidden="true" />
            <span className="my-boards-card__strip-stat">
              <span className="my-boards-card__strip-num mono tabular">{totalBookings}</span>
              <span className="my-boards-card__strip-label">total bookings</span>
            </span>
          </div>
          <button
            type="button"
            className="my-boards-card__new"
            onClick={() => navigate('/new')}
          >
            <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>New board</span>
          </button>
        </div>
      </section>

      {boards.length === 0 ? (
        <EmptyState
          title="No boards yet"
          body="We didn’t find any mytimes boards for this email yet. Spin one up. Five minutes from idea to shareable link."
          actionLabel="Create a board"
          onAction={() => navigate('/new')}
        />
      ) : (
        <div className="my-boards-rows" role="list">
          {boards.map((board) => {
            const kind = planBadgeKind(board);
            const isArchived = board.status === 'archived';
            const isOpening = openingId === board.id;
            return (
              <button
                key={board.id}
                type="button"
                role="listitem"
                className={`my-boards-row${isArchived ? ' is-archived' : ''}`}
                onClick={() => void openBoard(board)}
                disabled={Boolean(openingId)}
                aria-label={`Open board: ${board.title}, ${board.openSlots} open of ${board.slotCount} slots, ${board.bookingCount} bookings`}
              >
                <span className="my-boards-row__numeral">
                  <span className="my-boards-row__num mono tabular">
                    {board.openSlots}
                  </span>
                  <span className="my-boards-row__num-label">
                    open · of <span className="mono">{board.slotCount}</span>
                  </span>
                </span>

                <span className="my-boards-row__body">
                  <span className="my-boards-row__title">{board.title}</span>
                  <span className="my-boards-row__meta-line">
                    <span
                      className={`my-boards-badge my-boards-badge--${kind}`}
                      aria-label={`Plan: ${planBadgeLabel(board)}`}
                    >
                      {planBadgeLabel(board)}
                    </span>
                    <span className="my-boards-row__bookings">
                      <span className="mono tabular">{board.bookingCount}</span>
                      <span>booked</span>
                    </span>
                  </span>
                </span>

                <span className="my-boards-row__right">
                  <span className="my-boards-row__created mono">
                    {isOpening ? 'Opening…' : formatCreated(board.createdAt)}
                  </span>
                  <ChevronRight
                    size={18}
                    strokeWidth={1.6}
                    aria-hidden="true"
                    className="my-boards-row__chev"
                  />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className="my-boards-empty" aria-live="polite">
      <img
        className="my-boards-empty__vignette"
        src="/assets/bg/vignette-laptop-still-life.webp"
        alt=""
      />
      <h2 className="my-boards-empty__title">{title}</h2>
      <p className="my-boards-empty__body">{body}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          className="my-boards-card__new"
          onClick={onAction}
        >
          <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>{actionLabel}</span>
        </button>
      )}
    </section>
  );
}

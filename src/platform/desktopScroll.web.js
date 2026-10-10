/**
 * On desktop the app is a phone-width column whose screens scroll inside it,
 * which put a scrollbar in the middle of the page and ignored the wheel over
 * the side gutters. This hides the column's own scrollbars, forwards gutter
 * wheel events to whatever scrolls under the column, and draws a page-style
 * scrollbar at the window edge that mirrors (and drags) that scroller.
 */
const SCROLLABLE = /(auto|scroll)/;
const LINE_PX = 16;
const MIN_THUMB = 32;

function scrollerAt(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el && el !== document.body) {
        if (el.scrollHeight > el.clientHeight + 1 && SCROLLABLE.test(getComputedStyle(el).overflowY)) return el;
        el = el.parentElement;
    }
    return null;
}

export function installDesktopScroll(column) {
    if (typeof window === 'undefined' || !column || !window.matchMedia) return () => {};
    const query = window.matchMedia('(min-width: 560px) and (hover: hover) and (pointer: fine)');
    const root = document.documentElement;
    const track = document.createElement('div');
    track.className = 'af-pagebar';
    track.setAttribute('aria-hidden', 'true');
    const thumb = document.createElement('div');
    track.appendChild(thumb);

    let active = null;
    let frame = 0;
    let poll = 0;
    let drag = null;

    const columnScroller = (y) => {
        const r = column.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const atY = y == null ? null : scrollerAt(x, Math.min(Math.max(y, r.top + 1), r.bottom - 1));
        return atY || scrollerAt(x, r.top + r.height / 2);
    };

    const geometry = () => {
        const h = window.innerHeight;
        const thumbH = Math.max(MIN_THUMB, (h * active.clientHeight) / active.scrollHeight);
        const max = active.scrollHeight - active.clientHeight;
        return { h, thumbH, max };
    };

    const render = () => {
        frame = 0;
        if (!drag) active = columnScroller();
        if (!active) {
            track.hidden = true;
            return;
        }
        const { h, thumbH, max } = geometry();
        track.hidden = false;
        thumb.style.height = `${thumbH}px`;
        thumb.style.transform = `translateY(${max ? (active.scrollTop / max) * (h - thumbH) : 0}px)`;
    };
    const schedule = () => {
        if (!frame) frame = requestAnimationFrame(render);
    };

    const onWheel = (event) => {
        if (event.ctrlKey || column.contains(event.target) || track.contains(event.target)) return;
        const target = columnScroller(event.clientY);
        if (!target) return;
        const unit = event.deltaMode === 1 ? LINE_PX : event.deltaMode === 2 ? target.clientHeight : 1;
        target.scrollBy({ top: event.deltaY * unit });
        event.preventDefault();
    };

    const onThumbDown = (event) => {
        if (!active) return;
        event.preventDefault();
        event.stopPropagation();
        drag = { y: event.clientY, top: active.scrollTop };
        track.classList.add('af-drag');
        thumb.setPointerCapture(event.pointerId);
    };
    const onThumbMove = (event) => {
        if (!drag || !active) return;
        const { h, thumbH, max } = geometry();
        active.scrollTop = drag.top + ((event.clientY - drag.y) * max) / Math.max(1, h - thumbH);
    };
    const onThumbUp = () => {
        drag = null;
        track.classList.remove('af-drag');
    };
    const onTrackDown = (event) => {
        if (!active || event.target !== track) return;
        const thumbTop = thumb.getBoundingClientRect().top;
        active.scrollBy({ top: (event.clientY < thumbTop ? -1 : 1) * active.clientHeight * 0.9, behavior: 'smooth' });
    };

    const enable = () => {
        root.classList.add('af-desktop');
        document.body.appendChild(track);
        window.addEventListener('wheel', onWheel, { passive: false });
        document.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        thumb.addEventListener('pointerdown', onThumbDown);
        thumb.addEventListener('pointermove', onThumbMove);
        thumb.addEventListener('pointerup', onThumbUp);
        thumb.addEventListener('pointercancel', onThumbUp);
        track.addEventListener('pointerdown', onTrackDown);
        // Screens change without a scroll event; re-check which list is showing.
        poll = setInterval(schedule, 400);
        schedule();
    };
    const disable = () => {
        root.classList.remove('af-desktop');
        track.remove();
        window.removeEventListener('wheel', onWheel);
        document.removeEventListener('scroll', schedule, true);
        window.removeEventListener('resize', schedule);
        thumb.removeEventListener('pointerdown', onThumbDown);
        thumb.removeEventListener('pointermove', onThumbMove);
        thumb.removeEventListener('pointerup', onThumbUp);
        thumb.removeEventListener('pointercancel', onThumbUp);
        track.removeEventListener('pointerdown', onTrackDown);
        clearInterval(poll);
        cancelAnimationFrame(frame);
        frame = 0;
    };
    const onQuery = () => (query.matches ? enable() : disable());

    onQuery();
    query.addEventListener?.('change', onQuery);
    return () => {
        query.removeEventListener?.('change', onQuery);
        disable();
    };
}

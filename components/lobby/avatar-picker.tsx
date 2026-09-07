import { useState } from 'react';
import { avatarIds, type AvatarId } from '@/lib/protocol';

const avatarNames = [
  'Rose',
  'Forest',
  'Sunny',
  'Cozy',
  'Maker',
  'Plum',
  'Denim',
  'Meadow',
] as const;

type Props = {
  disabled?: boolean;
  selected: AvatarId;
  onSelect: (avatarId: AvatarId) => void;
};

export function AvatarPicker({ disabled, selected, onSelect }: Props) {
  const initialIndex = Math.max(0, avatarIds.indexOf(selected));
  const [page, setPage] = useState(Math.floor(initialIndex / 2));
  const pageCount = Math.ceil(avatarIds.length / 2);
  const visibleAvatars = avatarIds.slice(page * 2, page * 2 + 2);

  function movePage(direction: -1 | 1) {
    setPage((current) => (current + direction + pageCount) % pageCount);
  }

  return (
    <fieldset className="avatar-picker">
      <legend>Choose your person</legend>
      <div className="avatar-carousel">
        <button
          className="avatar-arrow"
          type="button"
          disabled={disabled}
          aria-label="View previous avatars"
          onClick={() => movePage(-1)}
        >
          &lt;
        </button>
        <div className="avatar-options">
          {visibleAvatars.map((avatarId) => {
            const index = avatarIds.indexOf(avatarId);
            return (
              <button
                className={`avatar-option ${selected === avatarId ? 'is-selected' : ''}`}
                key={avatarId}
                type="button"
                disabled={disabled}
                aria-pressed={selected === avatarId}
                aria-label={`Choose ${avatarNames[index]} avatar`}
                onClick={() => onSelect(avatarId)}
              >
                <span className={`avatar-art ${avatarId}`} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <button
          className="avatar-arrow"
          type="button"
          disabled={disabled}
          aria-label="View next avatars"
          onClick={() => movePage(1)}
        >
          &gt;
        </button>
      </div>
      <p className="avatar-page" aria-live="polite">
        Pair {page + 1} of {pageCount}
      </p>
    </fieldset>
  );
}

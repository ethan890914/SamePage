import { useLanguage } from '@/lib/i18n/provider';
import { useState } from 'react';
import { SettingStepper } from '@/components/pixel/setting-stepper';
import { Input } from '@/components/ui/input';
import { PixelButton } from '@/components/pixel/pixel-button';
import {
  minesweeperMineCount,
  type MinesweeperSettings,
} from '@/lib/game-settings';
import type { PlayerView } from '@/lib/protocol';

const boards = [
  { id: 'small', label: 'Small · 8 × 8', rows: 8, columns: 8 },
  { id: 'standard', label: 'Standard · 9 × 9', rows: 9, columns: 9 },
  { id: 'large', label: 'Large · 16 × 16', rows: 16, columns: 16 },
  { id: 'wide', label: 'Wide · 16 × 30', rows: 16, columns: 30 },
];

export function MinesweeperSettingsFields({
  settings,
  players,
  disabled,
  onChange,
}: {
  settings: MinesweeperSettings;
  players: PlayerView[];
  disabled: boolean;
  onChange: (settings: MinesweeperSettings) => void;
}) {
  const { t } = useLanguage();
  const [custom, setCustom] = useState(false);
  const [rows, setRows] = useState(String(settings.rows));
  const [columns, setColumns] = useState(String(settings.columns));
  const preset = boards.find(
    (board) =>
      board.rows === settings.rows && board.columns === settings.columns,
  );
  const valid = [rows, columns].every(
    (value) => /^\d+$/.test(value) && Number(value) >= 8 && Number(value) <= 30,
  );
  return (
    <fieldset
      disabled={disabled}
      className="game-entry-settings minesweeper-settings"
    >
      <legend className="sr-only">{t('Minesweeper settings')}</legend>
      <span className="game-setting-label">{t('Starting player')}</span>
      <SettingStepper
        label={t('starting player')}
        options={['player1', 'player2', 'random'] as const}
        value={settings.startingPlayer}
        format={(value) =>
          value === 'random'
            ? t('Random')
            : t('Player {0} ({1})', [
                value === 'player1' ? 1 : 2,
                players[value === 'player1' ? 0 : 1]?.name ??
                  t('waiting to join'),
              ])
        }
        onChange={(startingPlayer) => onChange({ ...settings, startingPlayer })}
      />
      <span className="game-setting-label">{t('Board size')}</span>
      <SettingStepper
        label={t('board size')}
        options={[...boards.map((board) => board.id), 'custom']}
        value={custom ? 'custom' : (preset?.id ?? 'custom')}
        format={(value) =>
          t(boards.find((board) => board.id === value)?.label ?? 'Custom')
        }
        onChange={(value) => {
          const board = boards.find((option) => option.id === value);
          setCustom(!board);
          setRows(String(settings.rows));
          setColumns(String(settings.columns));
          if (board)
            onChange({ ...settings, rows: board.rows, columns: board.columns });
        }}
      />
      {(custom || !preset) && (
        <div className="minesweeper-custom-size">
          <div className="minesweeper-custom-dimension">
            <label htmlFor="minesweeper-custom-rows">{t('Rows')}</label>
            <Input
              id="minesweeper-custom-rows"
              type="number"
              min={8}
              max={30}
              step={1}
              value={rows}
              onChange={(event) => setRows(event.target.value)}
            />
          </div>
          <div className="minesweeper-custom-dimension">
            <label htmlFor="minesweeper-custom-columns">{t('Columns')}</label>
            <Input
              id="minesweeper-custom-columns"
              type="number"
              min={8}
              max={30}
              step={1}
              value={columns}
              onChange={(event) => setColumns(event.target.value)}
            />
          </div>
          <PixelButton
            type="button"
            disabled={!valid}
            onClick={() =>
              onChange({
                ...settings,
                rows: Number(rows),
                columns: Number(columns),
              })
            }
          >
            {t('Apply size')}
          </PixelButton>
          <p>
            {t('8–30 rows and columns. Apply your size before getting ready.')}
          </p>
          {valid && (
            <output aria-live="polite">
              {t('Custom preview:')}{' '}
              {minesweeperMineCount({
                ...settings,
                rows: Number(rows),
                columns: Number(columns),
              })}{' '}
              {t('mines')}
            </output>
          )}
        </div>
      )}
      <span className="game-setting-label">{t('Difficulty')}</span>
      <SettingStepper
        label={t('difficulty')}
        options={['easy', 'medium', 'hard'] as const}
        value={settings.difficulty}
        format={(value) =>
          ({ easy: t('Easy'), medium: t('Medium'), hard: t('Hard') })[value]
        }
        onChange={(difficulty) =>
          onChange({
            ...settings,
            difficulty,
          })
        }
      />
      <output className="minesweeper-mine-preview" aria-live="polite">
        {t('{0} × {1} board · {2} mines', [
          settings.rows,
          settings.columns,
          minesweeperMineCount(settings),
        ])}
      </output>
      <p>
        {t(
          'The first reveal always opens a safe area. Take as long as you need on your turn.',
        )}
      </p>
      <p className="game-settings-note">
        {t('Shared by both players. Changing settings resets readiness.')}
      </p>
    </fieldset>
  );
}

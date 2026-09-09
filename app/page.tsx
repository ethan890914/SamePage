'use client';

import { useState, type SyntheticEvent } from 'react';
import { ArcadeLobby } from '@/components/lobby/arcade-lobby';
import { EntryScreen, type EntryMode } from '@/components/lobby/entry-screen';
import { PixelStatus } from '@/components/pixel/pixel-status';
import { useRoomConnection } from '@/hooks/use-room-connection';
import { PhotoBooth } from '@/components/photo-booth/photo-booth';
import { EntryCamera } from '@/components/photo-booth/entry-camera';
import { useEntryCamera } from '@/hooks/use-entry-camera';
import { ConvergeGame } from '@/components/games/converge-game';
import { PatternRaceGame } from '@/components/games/pattern-race-game';
import { MinesweeperGame } from '@/components/games/minesweeper-game';
import { isAvatarId, type AvatarId } from '@/lib/protocol';

export default function Home() {
  const [mode, setMode] = useState<EntryMode>('create');
  const [displayName, setDisplayName] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : (localStorage.getItem('same-page.display-name') ?? ''),
  );
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [password, setPassword] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarId>(() => {
    if (typeof window === 'undefined') return 'avatar-1';
    const storedAvatar = localStorage.getItem('same-page.avatar');
    return isAvatarId(storedAvatar) ? storedAvatar : 'avatar-1';
  });
  const [copied, setCopied] = useState(false);
  const room = useRoomConnection();
  const camera = useEntryCamera(
    room.players.find((player) => player.id === room.selfId)
      ?.selectedActivity === 'photo-booth',
    () => {
      if (!room.activeActivity) room.setReady('photo-booth', false);
      else if (room.activityInstanceId)
        room.sendBooth(room.activityInstanceId, { kind: 'reset' });
    },
  );
  const busy = ['creating', 'connecting', 'reconnecting'].includes(room.status);
  const inRoom = Boolean(room.roomCode && room.selfId);

  function handleModeChange(nextMode: EntryMode) {
    setMode(nextMode);
    room.clearError();
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    localStorage.setItem('same-page.avatar', selectedAvatar);
    if (mode === 'create')
      await room.createRoom(displayName, selectedAvatar, password);
    else room.joinRoom(roomCodeInput, displayName, selectedAvatar, password);
  }

  async function copyRoomCode() {
    if (!room.roomCode) return;
    await navigator.clipboard.writeText(room.roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const statusLabel =
    room.status === 'connected'
      ? 'Connected'
      : room.status === 'reconnecting'
        ? 'Reconnecting'
        : busy
          ? 'Connecting'
          : 'Arcade online';

  return (
    <main
      id="top"
      className="pixel-world min-h-screen px-4 py-5 text-foreground sm:px-7 lg:px-10"
    >
      <div className="mx-auto max-w-7xl">
        <header className="site-header">
          <a className="pixel-logo" href="#top" aria-label="Same Page home">
            <span className="pixel-logo-mark" aria-hidden="true">
              SP
            </span>
            <span>
              <strong>Same Page</strong>
              <small>Two-player arcade</small>
            </span>
          </a>
          <PixelStatus label={statusLabel} />
        </header>

        {inRoom && room.roomCode && room.selfId ? (
          room.activeActivity === 'converge' && room.activityInstanceId ? (
            <ConvergeGame
              key={room.activityInstanceId}
              instanceId={room.activityInstanceId}
              players={room.players}
              selfId={room.selfId}
              state={room.convergeState}
              status={room.status}
              send={room.sendConverge}
              onExit={() => room.exitActivity('converge')}
            />
          ) : room.activeActivity === 'pattern-race' &&
            room.activityInstanceId ? (
            <PatternRaceGame
              key={room.activityInstanceId}
              instanceId={room.activityInstanceId}
              players={room.players}
              selfId={room.selfId}
              state={room.patternRaceState}
              guessError={room.patternRaceGuessError}
              status={room.status}
              send={room.sendPatternRace}
              onExit={() => room.exitActivity('pattern-race')}
            />
          ) : room.activeActivity === 'minesweeper' &&
            room.activityInstanceId &&
            room.players.some(
              (player) =>
                player.id === room.selfId &&
                player.selectedActivity === 'minesweeper',
            ) ? (
            <MinesweeperGame
              key={room.activityInstanceId}
              instanceId={room.activityInstanceId}
              players={room.players}
              selfId={room.selfId}
              state={room.minesweeperState}
              status={room.status}
              error={room.error}
              onClearError={room.clearError}
              send={room.sendMinesweeper}
              onExit={() => room.exitActivity('minesweeper')}
            />
          ) : room.activeActivity === 'photo-booth' &&
            room.activityInstanceId &&
            room.status === 'connected' &&
            room.players.length === 2 &&
            room.players.every((player) => player.connected) ? (
            <PhotoBooth
              initialStream={camera.stream}
              key={room.activityInstanceId}
              selfId={room.selfId}
              peerId={
                room.players.find((player) => player.id !== room.selfId)!.id
              }
              instanceId={room.activityInstanceId}
              players={room.players}
              send={room.sendBooth}
              subscribe={room.subscribeBooth}
              onExit={() => room.exitActivity('photo-booth')}
            />
          ) : (
            <ArcadeLobby
              boothCamera={
                <EntryCamera stream={camera.stream} error={camera.error} />
              }
              boothCameraReady={Boolean(camera.stream)}
              boothCameraBusy={camera.busy}
              onEnableBoothCamera={() => void camera.enable()}
              boothCountdownSeconds={room.boothCountdownSeconds}
              onBoothCountdown={room.updateBoothCountdown}
              convergeSettings={room.convergeSettings}
              onConvergeSettings={room.updateConvergeSettings}
              patternRaceSettings={room.patternRaceSettings}
              onPatternRaceSettings={room.updatePatternRaceSettings}
              minesweeperSettings={room.minesweeperSettings}
              onMinesweeperSettings={room.updateMinesweeperSettings}
              activeActivity={room.activeActivity}
              copied={copied}
              error={room.error}
              players={room.players}
              roomCode={room.roomCode}
              selfId={room.selfId}
              status={room.status}
              onCopyRoomCode={copyRoomCode}
              onClearError={room.clearError}
              onExitActivity={room.exitActivity}
              onLeave={room.leaveRoom}
              onSetReady={room.setReady}
              onSelectActivity={room.selectActivity}
            />
          )
        ) : (
          <EntryScreen
            busy={busy}
            displayName={displayName}
            error={room.error}
            mode={mode}
            password={password}
            roomCode={roomCodeInput}
            selectedAvatar={selectedAvatar}
            status={room.status}
            onDisplayNameChange={setDisplayName}
            onModeChange={handleModeChange}
            onPasswordChange={setPassword}
            onRoomCodeChange={setRoomCodeInput}
            onAvatarChange={setSelectedAvatar}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </main>
  );
}

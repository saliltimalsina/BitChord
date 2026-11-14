import { Laptop, MonitorSpeaker, Smartphone, Users } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { Menu, MenuHeader, MenuItem, MenuSeparator } from '@/components/Menu';
import type { PartyMember } from '@/party/models';
import { createParty, messageOf, outputElsewhere, party, useParty } from '@/party/listenTogether';
import { usePlayer } from '@/state/player';

export const looksLikePhone = (m: PartyMember): boolean => /android|ios|iphone|pixel|galaxy|phone/i.test(m.deviceName);
export const deviceLabel = (m: PartyMember): string => m.deviceName || m.displayName;

const DEVICES_BUTTON_ID = 'player-devices-button';

/**
 * Where the sound is while this tab is a remote: a small glass tab resting on
 * the player, in the bar's own material, with the speaker named in green.
 * It opens the devices menu, so the way back is one click from the reminder.
 */
export function RemoteSpeakerTag({ className = '' }: { className?: string }) {
  const remote = useRemoteSpeaker();
  if (!remote) return null;
  const Icon = looksLikePhone(remote) ? Smartphone : Laptop;
  return (
    <button
      className={`glass-pill relative flex items-center gap-1.5 rounded-pill py-1 ps-2 pe-2.5 type-footnote animate-[fade-in_220ms_ease-out] ${className}`}
      onClick={() => document.getElementById(DEVICES_BUTTON_ID)?.click()}
      title="Choose where it plays"
    >
      <span className="relative grid size-4 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-green/30 [animation-duration:2.4s]" />
        <Icon size={12} strokeWidth={2.4} className="relative text-green" />
      </span>
      <span className="text-secondary">Playing on</span>
      <span className="max-w-40 truncate font-semibold text-green">{deviceLabel(remote)}</span>
    </button>
  );
}

/** The device making the sound, when it isn't this one. */
export function useRemoteSpeaker(): PartyMember | null {
  return useParty((s) => (outputElsewhere(s) ? (s.members.find((m) => m.memberId === s.playback.outputMemberId) ?? null) : null));
}

/**
 * Spotify Connect's devices button: pick which device plays. Outside a session
 * it starts one, so a phone can join with the code and take over.
 */
export function DevicesButton({ className }: { className: string }) {
  const navigate = useNavigate();
  const state = useParty();
  const remote = useRemoteSpeaker();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const output = state.playback.outputMemberId;
  const locked = state.hostOnlyControl && !state.you?.isHost;
  const label = remote ? `Playing on ${deviceLabel(remote)}` : 'Connect to a device';

  const start = () => {
    setError(null);
    createParty({ autoplayEnabled: usePlayer.getState().autoplay }).catch((e: unknown) => setError(messageOf(e)));
  };

  return (
    <>
      <button
        id={DEVICES_BUTTON_ID}
        // Green rather than the key colour while another device plays: the same green as the tag.
        className={`${className} aria-pressed:!text-green`}
        aria-label={label}
        title={label}
        aria-pressed={remote !== null}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        <MonitorSpeaker size={17} strokeWidth={2} />
      </button>
      {anchor && (
        <Menu anchor={anchor} placement="above-end" onClose={close} label="Devices">
          {!state.code ? (
            <>
              <MenuHeader>Connect to a device</MenuHeader>
              <MenuItem icon={<MonitorSpeaker size={15} />} onSelect={start}>
                Start a session
              </MenuItem>
              <MenuItem icon={<Users size={15} />} onSelect={() => (close(), navigate('/settings/listen-together'))}>
                Join with a code…
              </MenuItem>
              {error && <p className="max-w-60 px-2 pb-1 type-callout text-red">{error}</p>}
            </>
          ) : (
            <>
              <MenuHeader>{state.supportsOutput ? 'Play on' : 'In a session'}</MenuHeader>
              {state.supportsOutput &&
                state.members.map((m) => (
                  <MenuItem
                    key={m.memberId}
                    checked={output === m.memberId}
                    disabled={locked}
                    icon={looksLikePhone(m) ? <Smartphone size={15} /> : <Laptop size={15} />}
                    trailing={m.memberId === state.you?.memberId ? 'This device' : !m.connected ? 'Offline' : undefined}
                    onSelect={() => (close(), output !== m.memberId && party.setOutput(m.memberId))}
                  >
                    {deviceLabel(m)}
                  </MenuItem>
                ))}
              {state.supportsOutput && (
                <MenuItem checked={output === null} disabled={locked} icon={<Users size={15} />} onSelect={() => (close(), output !== null && party.setOutput(null))}>
                  Every device
                </MenuItem>
              )}
              {!state.supportsOutput && (
                <p className="max-w-64 px-2 pb-1 type-callout text-secondary">
                  Every device plays. This party server is too old to pick one device.
                </p>
              )}
              <MenuSeparator />
              <MenuItem trailing={<span className="tracking-[0.12em]">{state.code}</span>} onSelect={() => (close(), void navigator.clipboard.writeText(state.code!))}>
                Copy session code
              </MenuItem>
              <MenuItem onSelect={() => (close(), navigate('/settings/listen-together'))}>Session settings…</MenuItem>
            </>
          )}
        </Menu>
      )}
    </>
  );
}

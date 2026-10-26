import React from "react";
import { ConnectionStateToast, ControlBar, GridLayout, LiveKitRoom, ParticipantTile, RoomAudioRenderer, useParticipants, useRoomContext, useTracks } from "@livekit/components-react";
import { RoomEvent, Track, VideoPresets } from "livekit-client";
import "@livekit/components-styles";

function CallContents({ audioOnly, en }: { audioOnly: boolean; en: boolean }) {
  const room = useRoomContext(); const participants = useParticipants();
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }]);
  React.useEffect(() => {
    const update = () => { for (const participant of room.remoteParticipants.values()) for (const publication of participant.videoTrackPublications.values()) publication.setSubscribed(!audioOnly); };
    update(); room.on(RoomEvent.TrackPublished, update); room.on(RoomEvent.ParticipantConnected, update);
    return () => { room.off(RoomEvent.TrackPublished, update); room.off(RoomEvent.ParticipantConnected, update); };
  }, [room, audioOnly]);
  return <><ConnectionStateToast/><RoomAudioRenderer/>{audioOnly ? <div className="interview-audio-people">{participants.map(person => <div key={person.identity}><span>{(person.name || "?").slice(0, 1).toUpperCase()}</span><strong>{person.name}</strong><small>{en ? "In the call" : "У дзвінку"}</small></div>)}</div> : <GridLayout tracks={tracks} className="interview-video-grid"><ParticipantTile/></GridLayout>}<ControlBar variation="minimal" controls={{ microphone: true, camera: !audioOnly, screenShare: !audioOnly, chat: false, leave: true }} saveUserChoices={false}/></>;
}

export default function TalentInterviewCall({ token, url, audio, video, audioOnly, en, onLeft, onError }: { token: string; url: string; audio: boolean; video: boolean; audioOnly: boolean; en: boolean; onLeft: () => void; onError: (error: string) => void }) {
  return <LiveKitRoom token={token} serverUrl={url} connect audio={audio} video={video && !audioOnly} options={{ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { resolution: VideoPresets.h360.resolution, frameRate: 15 }, publishDefaults: { videoSimulcastLayers: [VideoPresets.h180], videoEncoding: { maxBitrate: 350_000, maxFramerate: 15 } } }} onDisconnected={onLeft} onError={error => onError(error.message)} onMediaDeviceFailure={() => onError(en ? "Check camera and microphone permissions. You can rejoin without devices." : "Перевір дозволи камери й мікрофона. Можна приєднатися без пристроїв.")} className="interview-call"><CallContents audioOnly={audioOnly} en={en}/></LiveKitRoom>;
}

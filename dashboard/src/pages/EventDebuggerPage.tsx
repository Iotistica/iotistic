import { EventReplayDebugger } from "../components/EventReplayDebugger";

interface EventDebuggerPageProps {
  deviceUuid: string;
}

export function EventDebuggerPage({ deviceUuid }: EventDebuggerPageProps) {
  return (
    <div className="p-6">
      <EventReplayDebugger deviceUuid={deviceUuid} />
    </div>
  );
}

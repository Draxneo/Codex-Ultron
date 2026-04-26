import { PrivateNotesPanel } from "../main/PrivateNotesPanel";

export function NotesTab({ customerId }: { customerId: string }) {
  return <PrivateNotesPanel customerId={customerId} />;
}

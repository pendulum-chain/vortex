import { AveniaTicketStatus } from "@vortexfi/shared";

interface AveniaPayinTicketClient {
  getAveniaPayinTickets(subAccountId: string): Promise<{ id: string; status: string }[]>;
}

interface RampOnHoldMetadata {
  aveniaTicketId: string;
  onHold?: boolean;
}

export async function syncAveniaOnHoldState(
  state: RampOnHoldMetadata,
  updateState: (state: RampOnHoldMetadata) => Promise<unknown>,
  brlaApiService: AveniaPayinTicketClient,
  subAccountId: string
): Promise<boolean> {
  const ticket = (await brlaApiService.getAveniaPayinTickets(subAccountId)).find(
    aveniaTicket => aveniaTicket.id === state.aveniaTicketId
  );

  if (!ticket) {
    return false;
  }

  const isOnHold = ticket.status.trim().toUpperCase() === AveniaTicketStatus.ON_HOLD;
  if (state.onHold === isOnHold) {
    return true;
  }

  await updateState({
    ...state,
    onHold: isOnHold
  });
  return true;
}

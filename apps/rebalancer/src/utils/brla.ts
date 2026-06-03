import { AveniaSwapTicket, AveniaTicketStatus, BrlaApiService } from "@vortexfi/shared";

type AveniaTicketReader = Pick<BrlaApiService, "getAveniaSwapTicket">;

export async function checkTicketStatusPaid(brlaApiService: AveniaTicketReader, ticketId: string): Promise<AveniaSwapTicket> {
  const pollInterval = 5000;
  const timeout = 5 * 60 * 1000;
  const startTime = Date.now();
  let lastError: Error | undefined;

  while (Date.now() - startTime < timeout) {
    let ticket: AveniaSwapTicket;
    try {
      ticket = await brlaApiService.getAveniaSwapTicket(ticketId);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Polling for ticket ${ticketId} status failed with error. Retrying...`, lastError);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      continue;
    }

    if (ticket?.status === AveniaTicketStatus.PAID) {
      return ticket;
    }
    if (ticket?.status === AveniaTicketStatus.FAILED) {
      throw new Error(`Ticket ${ticketId} status is FAILED`);
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  if (lastError) {
    throw new Error(`Polling for ticket status timed out with an error: ${lastError.message}`);
  }
  throw new Error("Polling for ticket status timed out.");
}

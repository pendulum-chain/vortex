import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CORRIDORS } from "@/domain/corridors";
import type { Recipient } from "@/domain/types";

export function RecipientsTable({ recipients }: { recipients: Recipient[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Recipient</TableHead>
          <TableHead>Corridor</TableHead>
          <TableHead>Destination</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Added</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {recipients.map(recipient => {
          const corridor = CORRIDORS[recipient.corridorId];
          return (
            <TableRow key={recipient.id}>
              <TableCell className="font-medium">{recipient.name}</TableCell>
              <TableCell>
                {corridor.flag} {corridor.name}
              </TableCell>
              <TableCell className="font-mono text-muted-foreground text-xs">
                {corridor.recipientLabel}: {recipient.destination}
              </TableCell>
              <TableCell>
                {recipient.status === "registered" ? (
                  <Badge variant="success">Registered</Badge>
                ) : (
                  <Badge variant="info">Pending</Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(recipient.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
